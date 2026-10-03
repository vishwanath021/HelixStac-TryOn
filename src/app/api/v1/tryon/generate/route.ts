import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { HD_CREDIT_COST, STANDARD_CREDIT_COST } from "@/data/plans";
import { shadeById } from "@/data/shades";
import { resolveProviderChoice } from "@/lib/ai/credentials";
import { generateWithFailover } from "@/lib/ai/router";
import type { GenerateInput } from "@/lib/ai/types";
import { CreditError, refundStaleReserves, reserveCredits, settleCredits } from "@/lib/credits";
import { numberEnv } from "@/lib/env";
import { resolveLook } from "@/lib/guidance";
import { sanitizeSelfie, ImageError } from "@/lib/images";
import { logError } from "@/lib/logger";
import { AI_PREVIEW_KINDS, actorKeyFor, capForTier, hashIp, readGuestToken, verifySalonToken, type PreviewTier } from "@/lib/preview-access";
import { prisma } from "@/lib/prisma";
import { buildBeardPrompt, buildBrowPrompt, buildNailPrompt, buildStylePrompt } from "@/lib/prompts";
import { beardById } from "@/data/beards";
import { browById } from "@/data/brows";
import { nailById } from "@/data/nails";
import { styleById } from "@/data/styles";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const quality = form.get("quality") === "hd" ? "hd" : "standard";
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

  let jpeg: Buffer;
  try {
    jpeg = await sanitizeSelfie(Buffer.from(await photo.arrayBuffer()));
  } catch (error) {
    const code = error instanceof ImageError ? error.code : "DECODE";
    return NextResponse.json({ error: code, message: "Use a JPEG, PNG, or WebP selfie under 2 MB." }, { status: 400 });
  }

  const credits = quality === "hd" ? HD_CREDIT_COST : STANDARD_CREDIT_COST;
  const refId = randomUUID();
  await refundStaleReserves(tenant.id);
  try {
    await reserveCredits(tenant.id, credits, refId);
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "CREDITS", message: "This salon has used its preview credits. Live colour is still free. Message them on WhatsApp to book." },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: "SUSPENDED", message: "This salon's try-on is paused." }, { status: 403 });
  }

  const shade = tool === "style" ? shadeById(shadeId) : null;
  const kind = tool === "brows" ? "BROWS" : tool === "beard" ? "BEARD" : tool === "nails" ? "NAILS" : "STYLE";
  const style = tool === "style" ? styleById(styleId) : null;
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
      kind: tool,
      styleName: look.name,
    };
    const result = await generateWithFailover(input, await resolveProviderChoice(tenant.id));
    await settleCredits(tenant.id, refId, "COMMIT");
    const balance = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { creditBalance: true } });
    await prisma.tryOn.update({
      where: { id: tryOn.id },
      data: {
        status: "SUCCEEDED",
        provider: result.provider,
        latencyMs: result.latencyMs,
        costMicroUsd: Math.round(result.providerCostUsd * 1_000_000),
      },
    });
    await prisma.usageEvent.create({
      data: {
        tenantId: tenant.id,
        sessionId,
        name: "generate_succeeded",
        props: JSON.stringify({
          styleId,
          quality,
          provider: result.provider,
          latencyMs: result.latencyMs,
          estimateInr: result.estimateInr ?? 0,
          demoReason: result.demoReason || "",
        }),
      },
    });
    return new NextResponse(new Uint8Array(result.image), {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "no-store",
        "x-tryon-id": tryOn.id,
        "x-credits-left": String(balance?.creditBalance ?? 0),
        "x-provider": result.provider,
        "x-demo-reason": result.demoReason || "",
        "x-estimate-inr": String(result.estimateInr ?? 0),
      },
    });
  } catch (error) {
    await settleCredits(tenant.id, refId, "REFUND");
    await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: "FAILED" } });
    logError("generate failed", { tryOnId: tryOn.id, tenantId: tenant.id, message: error instanceof Error ? error.message : "error" });
    return NextResponse.json({ error: "PROVIDER", message: "The preview did not finish. The credit was returned. Please try again." }, { status: 502 });
  }
}
