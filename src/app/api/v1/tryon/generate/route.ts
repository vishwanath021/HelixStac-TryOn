import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { HD_CREDIT_COST, STANDARD_CREDIT_COST } from "@/data/plans";
import { shadeById } from "@/data/shades";
import { resolveProviderChoice } from "@/lib/ai/credentials";
import { claimGenerationJob, completeGenerationJob, failGenerationJob, jobFingerprint } from "@/lib/ai/dedupe";
import { referenceModeActive } from "@/lib/ai/reference-mode";
import { parseAskedTexture, referenceFingerprintMode } from "@/lib/ai/reference-texture";
import { runTryOnReference } from "@/lib/ai/reference-run";
import { salonOutcome, guestPreviewHeaders } from "@/lib/ai/guest-response";
import { generateWithFailover, selectProvider } from "@/lib/ai/router";
import { readTierFlags } from "@/lib/ai/settings-store";
import { resolveGuestTier } from "@/lib/ai/tiers";
import type { GenerateInput } from "@/lib/ai/types";
import { CreditError, refundStaleReserves, reserveCredits, settleCredits } from "@/lib/credits";
import { numberEnv } from "@/lib/env";
import { resolveLook } from "@/lib/guidance";
import { classifySkinPhoto } from "@/lib/hand-photo";
import { sanitizeSelfie, ImageError } from "@/lib/images";
import { hairExtentForStyle, preflightPhoto, TRY_ANOTHER_PHOTO, type RegionTool } from "@/lib/face/region";
import { logError } from "@/lib/logger";
import { AI_PREVIEW_KINDS, actorKeyFor, capForTier, hashIp, readGuestToken, verifySalonToken, type PreviewTier } from "@/lib/preview-access";
import { prisma } from "@/lib/prisma";
import { buildBeardPrompt, buildBrowPrompt, buildNailPrompt, buildStylePrompt } from "@/lib/prompts";
import { beardById } from "@/data/beards";
import { browById } from "@/data/brows";
import { nailById } from "@/data/nails";
import { styleById } from "@/data/styles";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { isSuperSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "INVALID", message: "Send a photo and a style." }, { status: 400 });
  const slug = String(form.get("slug") || "");
  const styleId = String(form.get("styleId") || "");
  const sessionId = String(form.get("sessionId") || "");
  const consentId = String(form.get("consentId") || "");
  const rawTool = String(form.get("tool") || "style");
  const tool = rawTool === "brows" || rawTool === "beard" || rawTool === "nails" ? rawTool : "style";
  const shadeId = form.get("shadeId") ? String(form.get("shadeId")) : null;
  const photo = form.get("photo");
  if (!slug || !styleId || sessionId.length < 8 || !(photo instanceof File)) {
    return NextResponse.json({ error: "INVALID", message: "Photo, style, and session are required." }, { status: 400 });
  }
  if (photo.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "SIZE", message: "Please use a photo under 2 MB." }, { status: 413 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return NextResponse.json({ error: "TENANT", message: "Salon not found." }, { status: 404 });
  if (tenant.status === "SUSPENDED") {
    return NextResponse.json({ error: "SUSPENDED", message: "This salon's try-on is paused." }, { status: 403 });
  }

  const consent = await prisma.consentLog.findFirst({
    where: { id: consentId, tenantId: tenant.id, sessionId, accepted: true, ageGate: true },
  });
  if (!consent || Date.now() - consent.createdAt.getTime() > 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "CONSENT", message: "Agree to the preview notice before a style preview." }, { status: 403 });
  }

  const ip = clientIp(req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"));
  const hour = rateLimit(`gen:ip:h:${ip}`, numberEnv("GENERATE_PER_IP_HOUR", 6), 60 * 60 * 1000);
  const day = rateLimit(`gen:ip:d:${ip}`, numberEnv("GENERATE_PER_IP_DAY", 20), 24 * 60 * 60 * 1000);
  const burst = rateLimit(`gen:tenant:m:${tenant.id}`, numberEnv("GENERATE_PER_TENANT_MINUTE", 30), 60 * 1000);
  if (!hour.ok || !day.ok || !burst.ok) {
    return NextResponse.json({ error: "RATE", message: "Too many previews from this connection. Live colour is still free." }, { status: 429 });
  }

  const usedToday = await prisma.tryOn.count({
    where: { tenantId: tenant.id, kind: { in: [...AI_PREVIEW_KINDS] }, status: "SUCCEEDED", createdAt: { gte: startOfToday() } },
  });
  if (usedToday >= tenant.dailyCap) {
    return NextResponse.json({ error: "DAILY_CAP", message: "This salon has reached today's preview limit. Live colour is still free." }, { status: 429 });
  }

  const look = resolveLook(tool, styleId);
  const toolOn =
    tool === "brows" ? tenant.toolBrows : tool === "beard" ? tenant.toolBeard : tool === "nails" ? tenant.toolNails : tenant.toolStyle;
  if (!toolOn) return NextResponse.json({ error: "TOOL", message: "That try-on is turned off for this salon." }, { status: 403 });
  if (!look) return NextResponse.json({ error: "STYLE", message: "That look is not on this salon's menu." }, { status: 400 });
  if (tool === "style") {
    const enabled = await prisma.tenantStyle.findUnique({ where: { tenantId_styleId: { tenantId: tenant.id, styleId } } });
    if (!enabled?.enabled) return NextResponse.json({ error: "STYLE", message: "That style is not on this salon's menu." }, { status: 400 });
  }

  const salonToken = String(form.get("salonToken") || "");
  const salonOk = verifySalonToken(salonToken, tenant.id, tenant.salonNonce);
  const jar = await cookies();
  const guest = readGuestToken(jar.get("helix_guest")?.value);
  const member = guest && guest.tenantId === tenant.id ? guest : null;
  const tier: PreviewTier = salonOk ? "salon" : member ? "member" : "anon";
  const ipHash = hashIp(ip);
  const actorKey = actorKeyFor(tier, ipHash, member?.customerId);
  const limit = capForTier(tier, tenant.anonDailyCap, tenant.memberDailyCap);
  if (limit !== null) {
    const personal = await prisma.tryOn.count({
      where: { tenantId: tenant.id, actorKey, status: "SUCCEEDED", kind: { in: [...AI_PREVIEW_KINDS] }, createdAt: { gte: startOfToday() } },
    });
    if (personal >= limit) {
      const message = tier === "member"
        ? "You've used today's previews on this account. Live colour is still free. Come back tomorrow, or ask the salon to try it with you."
        : "That's today's previews used up. Log in for a higher limit, or visit the salon. Live colour is still free.";
      return NextResponse.json({ error: "CAP", tier, message }, { status: 429 });
    }
  }

  const original = Buffer.from(await photo.arrayBuffer());
  let jpeg: Buffer;
  try {
    jpeg = await sanitizeSelfie(original);
  } catch (error) {
    const code = error instanceof ImageError ? error.code : "DECODE";
    return NextResponse.json({ error: code, message: "Use a JPEG, PNG, or WebP selfie under 2 MB." }, { status: 400 });
  }

  if (tool === "nails") {
    const small = await sharp(jpeg).resize(48, 48, { fit: "fill" }).removeAlpha().raw().toBuffer();
    if (classifySkinPhoto(small, 48, 48, 3) === "face") {
      return NextResponse.json({ error: "HAND", message: "That looks like a face. Upload a photo of your hand." }, { status: 400 });
    }
  }

  const wantReference = referenceModeActive({
    isSuperAdmin: await isSuperSession(),
    requested: String(form.get("referenceMode") || "") === "yes",
    tool,
  });
  const askedTexture = wantReference ? parseAskedTexture(String(form.get("hairTexture") || "")) : "natural";
  const compareModel = wantReference ? String(form.get("compareModel") || "").trim() : "";
  if (wantReference && String(form.get("confirm") || "") !== "yes") {
    return NextResponse.json({ error: "CONFIRM", message: "Confirm the estimated cost before this paid call." }, { status: 400 });
  }

  const requestId = String(form.get("requestId") || "");
  let jobId = "";
  if (requestId) {
    const claim = await claimGenerationJob({
      tenantId: tenant.id,
      requestId,
      fingerprint: jobFingerprint({ photo: jpeg, styleId, tool, shadeId: wantReference ? "" : shadeId || "", mode: wantReference ? referenceFingerprintMode(askedTexture, compareModel) : "production" }),
    });
    if (claim.kind === "conflict") return NextResponse.json({ error: "CONFLICT", message: claim.message }, { status: 409 });
    if (claim.kind === "inflight") return NextResponse.json({ error: "IN_FLIGHT", message: claim.message }, { status: 409 });
    if (claim.kind === "repeat") return NextResponse.json({ error: "REPEAT", message: claim.message }, { status: claim.status });
    if (claim.kind === "replay") {
      if (claim.demoReason === "reference") {
        return new NextResponse(new Uint8Array(claim.image), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
      return new NextResponse(new Uint8Array(claim.image), {
        status: 200,
        headers: guestPreviewHeaders({ tryOnId: "replay", creditsLeft: tenant.creditBalance, demoReason: claim.demoReason }),
      });
    }
    jobId = claim.id;
  }

  if (wantReference) {
    return runTryOnReference({
      jpeg,
      original,
      styleId,
      tenantId: tenant.id,
      sessionId,
      tier,
      actorKey,
      jobId,
      requestId,
      revealCost: await isSuperSession(),
      hairTexture: askedTexture,
      modelId: compareModel,
    });
  }

  const shade = tool === "style" ? shadeById(shadeId) : null;
  const region: RegionTool = tool === "nails" ? "nails" : tool === "brows" ? "brows" : tool === "beard" ? "beard" : shade ? "colour" : "style";
  const lookStyle = tool === "style" ? styleById(styleId) : null;
  const choice = await resolveProviderChoice(tenant.id);
  if (selectProvider(choice.name, choice.apiKey).name !== "mock") {
    const placement = await preflightPhoto(jpeg, region, { hairExtent: hairExtentForStyle(lookStyle, region) });
    if (!placement.ok) {
      await failGenerationJob(jobId, { outcome: "placement", message: TRY_ANOTHER_PHOTO });
      return NextResponse.json({ error: "PLACEMENT", message: TRY_ANOTHER_PHOTO }, { status: 422 });
    }
  }

  const flags = await readTierFlags(tenant.id);
  const modelTier = resolveGuestTier({ ...flags, purpose: "guest" });
  const quality = modelTier === "high" ? "hd" : "standard";
  const credits = modelTier === "high" ? HD_CREDIT_COST : STANDARD_CREDIT_COST;
  const refId = randomUUID();
  await refundStaleReserves(tenant.id);
  try {
    await reserveCredits(tenant.id, credits, refId);
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      await failGenerationJob(jobId, { outcome: "credits", message: "This salon has used its preview credits. Live colour is still free. Message them on WhatsApp to book." });
      return NextResponse.json(
        { error: "CREDITS", message: "This salon has used its preview credits. Live colour is still free. Message them on WhatsApp to book." },
        { status: 402 },
      );
    }
    await failGenerationJob(jobId, { outcome: "suspended", message: "This salon's try-on is paused." });
    return NextResponse.json({ error: "SUSPENDED", message: "This salon's try-on is paused." }, { status: 403 });
  }

  const kind = tool === "brows" ? "BROWS" : tool === "beard" ? "BEARD" : tool === "nails" ? "NAILS" : "STYLE";
  const style = lookStyle;
  const prompt =
    tool === "brows" ? buildBrowPrompt(browById(styleId)!) :
    tool === "beard" ? buildBeardPrompt(beardById(styleId)!) :
    tool === "nails" ? buildNailPrompt(nailById(styleId)!) :
    buildStylePrompt(style!, shade?.name);
  const tryOn = await prisma.tryOn.create({
    data: {
      tenantId: tenant.id,
      sessionId,
      styleId,
      shadeId: shade?.id,
      kind,
      tier,
      actorKey,
      quality,
      status: "PENDING",
      credits,
    },
  });

  try {
    const input: GenerateInput = {
      image: jpeg,
      styleId,
      gender: style?.gender ?? "women",
      prompt,
      colour: shade?.name,
      tenantId: tenant.id,
      quality,
      tier: modelTier,
      kind: tool,
      styleName: look.name,
    };
    const result = await generateWithFailover(input, choice);
    const outcome = salonOutcome(result.demoReason);
    if (outcome.placement) {
      await settleCredits(tenant.id, refId, "REFUND");
      await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: "FAILED" } });
      await failGenerationJob(jobId, { outcome: "placement", message: TRY_ANOTHER_PHOTO, callId: result.callId });
      return NextResponse.json({ error: "PLACEMENT", message: TRY_ANOTHER_PHOTO }, { status: 422 });
    }
    await settleCredits(tenant.id, refId, outcome.commit ? "COMMIT" : "REFUND");
    const balance = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { creditBalance: true } });
    await prisma.tryOn.update({
      where: { id: tryOn.id },
      data: {
        status: outcome.status,
        latencyMs: result.latencyMs,
      },
    });
    await prisma.usageEvent.create({
      data: {
        tenantId: tenant.id,
        sessionId,
        name: outcome.commit ? "generate_succeeded" : "generate_demo",
        props: JSON.stringify({ styleId, demo: Boolean(result.demoReason) }),
      },
    });
    if (requestId) {
      await completeGenerationJob(jobId, {
        tenantId: tenant.id,
        requestId,
        image: result.image,
        demoReason: result.demoReason,
        callId: result.callId,
      });
    }
    return new NextResponse(new Uint8Array(result.image), {
      status: 200,
      headers: guestPreviewHeaders({
        tryOnId: tryOn.id,
        creditsLeft: balance?.creditBalance ?? 0,
        demoReason: result.demoReason || "",
      }),
    });
  } catch (error) {
    await settleCredits(tenant.id, refId, "REFUND");
    await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: "FAILED" } });
    const uncertain = error instanceof Error && error.name === "UncertainBillingError";
    const message = uncertain
      ? "The provider may have billed this attempt. It was not started again. The salon credit was returned."
      : "The preview did not finish. The salon credit was returned. No automatic retry was made.";
    await failGenerationJob(jobId, { outcome: uncertain ? "uncertain" : "provider", message });
    logError("generate failed", { tryOnId: tryOn.id, tenantId: tenant.id, message: error instanceof Error ? error.message : "error" });
    return NextResponse.json({ error: uncertain ? "UNCERTAIN" : "PROVIDER", message }, { status: uncertain ? 504 : 502 });
  }
}
