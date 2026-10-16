import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { bridalFinishById, bridalLipById, bridalLookById, mehendiChoice, MEHENDI_COVERAGE, MEHENDI_DENSITY, MEHENDI_SHADES, MEHENDI_STYLES } from "@/data/bridal";
import { parseBrowColour, parseBrowThickness } from "@/data/brows";
import { claimGenerationJob, failGenerationJob, jobFingerprint } from "@/lib/ai/dedupe";
import { BROWS_NEED_OPENAI, browsRoute, demoGuestPreview, engineForGuestTool, guestEngineReady, loadGuestReference, readGuestEngine, runGuestHairstyleIfReady, runGuestLookIfReady } from "@/lib/ai/guest-hairstyle";
import { guestPreviewHeaders } from "@/lib/ai/guest-response";
import { auth } from "@/auth";
import { resolveFalKey } from "@/lib/ai/credentials";
import { bridalReferenceJpeg } from "@/lib/bridal-reference";
import { buildBridalPrompt, buildMehendiPrompt } from "@/lib/prompts";
import { styleEnabledForTenant } from "@/lib/style-menu";
import { consumePreviewRateShared, guestLimitMessage, toolEnabled, type PreviewTool, type ToolId } from "@/lib/tools";
import { resolveLook } from "@/lib/guidance";
import { classifySkinPhoto } from "@/lib/hand-photo";
import { sanitizeSelfie, ImageError } from "@/lib/images";
import { logPlacementRejection, poseGate, TRY_ANOTHER_PHOTO } from "@/lib/face/region";
import { parseLandmarks, type PlacementDebug } from "@/lib/face/pose";
import { AI_PREVIEW_KINDS, actorKeyFor, capForTier, hashIp, readGuestToken, verifySalonToken, type PreviewTier } from "@/lib/preview-access";
import { ensurePhotoConsent } from "@/lib/photo-consent";
import { prisma } from "@/lib/prisma";
import { requestClientIp } from "@/lib/ratelimit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

async function viewerIsSuper() {
  try {
    const session = await auth();
    return Boolean(session?.user?.isSuperAdmin);
  } catch {
    return false;
  }
}

async function signedInOwnerOrSuper(tenantId: string) {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user?.id) return null;
    if (user.isSuperAdmin) return user.id;
    const owner = await prisma.membership.findFirst({
      where: { userId: user.id, tenantId, role: "OWNER" },
      select: { userId: true },
    });
    return owner?.userId ?? null;
  } catch {
    return null;
  }
}

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
  const tool = rawTool === "brows" || rawTool === "beard" || rawTool === "nails" || rawTool === "colour" || rawTool === "bridal" || rawTool === "mehendi" ? rawTool : "style";
  const bridalTool = tool === "bridal" || tool === "mehendi";
  const shadeId = form.get("shadeId") ? String(form.get("shadeId")) : null;
  const browThickness = parseBrowThickness(form.get("browThickness"));
  const browColour = parseBrowColour(form.get("browColour"));
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
  if (bridalTool && !tenant.productBridal) {
    return NextResponse.json({ error: "PRODUCT", message: "Bridal is turned off for this salon." }, { status: 404 });
  }
  if (!bridalTool && !tenant.productTryOn) {
    return NextResponse.json({ error: "PRODUCT", message: "Try-on is not available for this salon." }, { status: 404 });
  }

  await ensurePhotoConsent({
    tenantId: tenant.id,
    sessionId,
    consentId,
    userAgent: req.headers.get("user-agent") || "",
  });

  const ip = requestClientIp(req);
  const staffId = await signedInOwnerOrSuper(tenant.id);
  const bucket = staffId ? `staff:${staffId}` : ip;

  const usedToday = await prisma.tryOn.count({
    where: { tenantId: tenant.id, kind: { in: [...AI_PREVIEW_KINDS] }, status: "SUCCEEDED", createdAt: { gte: startOfToday() } },
  });
  if (usedToday >= tenant.dailyCap) {
    return NextResponse.json({ error: "DAILY_CAP", message: guestLimitMessage("daily") }, { status: 429 });
  }

  const finish = bridalFinishById(String(form.get("finish") || "hd"));
  const lip = bridalLipById(String(form.get("lip") || "red"));
  const mehendiStyle = mehendiChoice(MEHENDI_STYLES, String(form.get("mehendiStyle") || styleId));
  const mehendiCoverage = mehendiChoice(MEHENDI_COVERAGE, String(form.get("coverage") || ""));
  const mehendiShade = mehendiChoice(MEHENDI_SHADES, String(form.get("mehendiShade") || ""));
  const mehendiDensity = mehendiChoice(MEHENDI_DENSITY, String(form.get("density") || ""));
  const bridalLook = tool === "bridal" ? bridalLookById(styleId) : null;
  const look = bridalTool
    ? bridalLook
      ? { id: bridalLook.id, name: bridalLook.name, serviceKeys: [] as string[] }
      : tool === "mehendi" && mehendiStyle && mehendiCoverage && mehendiShade && mehendiDensity
        ? { id: mehendiStyle.id, name: `Mehendi · ${mehendiStyle.label}`, serviceKeys: [] as string[] }
        : null
    : resolveLook(tool, styleId);
  const platformTool: ToolId = tool === "style" ? "hairstyle" : tool === "bridal" || tool === "mehendi" ? "hairstyle" : tool;
  const toolOn = bridalTool
    ? true
    : toolEnabled(platformTool) &&
      (tool === "brows" ? tenant.toolBrows : tool === "beard" ? tenant.toolBeard : tool === "nails" ? tenant.toolNails : tool === "colour" ? tenant.toolColour : tenant.toolStyle);
  if (!toolOn) return NextResponse.json({ error: "TOOL", message: "That try-on is turned off for this salon." }, { status: 403 });
  if (!look) return NextResponse.json({ error: "STYLE", message: bridalTool ? "Choose a bridal look first." : "That look is not on this salon's menu." }, { status: 400 });
  if (tool === "style" && !(await styleEnabledForTenant(tenant.id, styleId))) {
    return NextResponse.json({ error: "STYLE", message: "That style is not on this salon's menu." }, { status: 400 });
  }

  const salonToken = String(form.get("salonToken") || "");
  const salonOk = verifySalonToken(salonToken, tenant.id, tenant.salonNonce);
  const jar = await cookies();
  const guest = readGuestToken(jar.get("helix_guest")?.value);
  const member = guest && guest.tenantId === tenant.id ? guest : null;
  const tier: PreviewTier = salonOk ? "salon" : member ? "member" : "anon";
  const ipHash = hashIp(ip);
  const actorKey = actorKeyFor(tier, ipHash, member?.customerId);
  const limit = staffId ? null : capForTier(tier, tenant.anonDailyCap, tenant.memberDailyCap);
  if (limit !== null) {
    const personal = await prisma.tryOn.count({
      where: { tenantId: tenant.id, actorKey, status: "SUCCEEDED", kind: { in: [...AI_PREVIEW_KINDS] }, createdAt: { gte: startOfToday() } },
    });
    if (personal >= limit) {
      const message = guestLimitMessage(tier === "member" ? "member" : "anon");
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

  if (tool === "nails" || tool === "mehendi") {
    const small = await sharp(jpeg).resize(48, 48, { fit: "fill" }).removeAlpha().raw().toBuffer();
    if (classifySkinPhoto(small, 48, 48, 3) === "face") {
      return NextResponse.json({ error: "HAND", message: tool === "mehendi" ? "That looks like a face. Upload a photo of your hand for the mehendi." : "That looks like a face. Upload a photo of your hand." }, { status: 400 });
    }
  }

  const requestId = String(form.get("requestId") || "");
  let jobId = "";
  if (requestId) {
    const claim = await claimGenerationJob({
      tenantId: tenant.id,
      requestId,
      fingerprint: jobFingerprint({ photo: jpeg, styleId, tool, shadeId: tool === "brows" ? `${browThickness}:${browColour}` : tool === "style" ? shadeId || "" : "", mode: tool }),
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

  let previewCharged = false;
  const takePreviewSlot = async () => {
    if (previewCharged) return null;
    const limited = await consumePreviewRateShared({ tool: tool as PreviewTool, staff: Boolean(staffId), bucket, tenantId: tenant.id });
    if (!limited.ok) {
      await failGenerationJob(jobId, { outcome: "rate", message: limited.message });
      return NextResponse.json({ error: "RATE", message: limited.message }, { status: 429 });
    }
    previewCharged = true;
    return null;
  };

  const landmarks = parseLandmarks(form.get("landmarks"));
  const faceCount = Number(form.get("faceCount") || 0);
  let placementDebug: PlacementDebug | undefined;
  if ((tool === "brows" || tool === "beard" || tool === "colour") && landmarks) {
    const placement = await poseGate(jpeg, tool, landmarks, faceCount);
    placementDebug = placement.debug;
    if (!placement.ok) {
      const message = placement.message || TRY_ANOTHER_PHOTO;
      logPlacementRejection(tool, placement.debug);
      await failGenerationJob(jobId, { outcome: "placement", message });
      const body: { error: string; message: string; debug?: PlacementDebug } = { error: "PLACEMENT", message };
      if (await viewerIsSuper()) body.debug = placement.debug;
      return NextResponse.json(body, { status: 422 });
    }
  }

  const guestLook = tool === "style"
    ? null
    : tool === "bridal" && bridalLook
      ? { prompt: buildBridalPrompt(bridalLook, finish, lip, {
          kajal: String(form.get("kajal") || "") === "1",
          lashes: String(form.get("lashes") || "") === "1",
          blush: String(form.get("blush") || "") === "1",
          brow: String(form.get("browTint") || "") === "1",
        }), reference: await bridalReferenceJpeg(bridalLook.id), referenceFile: `${bridalLook.id}.jpg` }
      : tool === "mehendi" && mehendiStyle && mehendiCoverage && mehendiShade && mehendiDensity
        ? { prompt: buildMehendiPrompt(mehendiStyle, mehendiCoverage, mehendiShade, mehendiDensity), reference: await bridalReferenceJpeg(`mehendi-${mehendiStyle.id}`), referenceFile: `mehendi-${mehendiStyle.id}.jpg` }
        : await loadGuestReference(tool as "brows" | "beard" | "nails" | "colour", styleId, tool === "brows" ? { thickness: browThickness, colour: browColour } : undefined);
  if (tool !== "style" && !guestLook) {
    await failGenerationJob(jobId, { outcome: "style", message: "That look is not on this salon's menu." });
    return NextResponse.json({ error: "STYLE", message: "That look is not on this salon's menu." }, { status: 400 });
  }

  const { engine } = await readGuestEngine(tenant.id);
  if (tool === "brows") {
    const openaiReady = await guestEngineReady("openai");
    const selectedReady = engine === "openai" ? openaiReady : await guestEngineReady(engine);
    if (browsRoute({ openaiReady, selected: engine, selectedReady }) === "message") {
      await failGenerationJob(jobId, { outcome: "key", message: BROWS_NEED_OPENAI });
      return NextResponse.json({ error: "NO_OPENAI_KEY", message: BROWS_NEED_OPENAI }, { status: 400 });
    }
  }

  const limited = await takePreviewSlot();
  if (limited) return limited;

  const kind = tool === "brows" ? "BROWS" : tool === "beard" ? "BEARD" : tool === "nails" ? "NAILS" : tool === "colour" ? "COLOUR" : tool === "bridal" ? "BRIDAL" : tool === "mehendi" ? "MEHENDI" : "STYLE";
  const effective = engineForGuestTool(tool, engine);
  const superUser = placementDebug ? await viewerIsSuper() : false;
  const withPose = (response: NextResponse) => {
    if (response.status === 200 && placementDebug && superUser) {
      response.headers.set("x-placement-debug", JSON.stringify(placementDebug));
    }
    return response;
  };
  if (await guestEngineReady(effective)) {
    const styled = tool === "style" || !guestLook
      ? await runGuestHairstyleIfReady({
          jpeg,
          original,
          styleId,
          tenantId: tenant.id,
          sessionId,
          tier,
          actorKey,
          jobId,
          requestId,
        })
      : await runGuestLookIfReady({
          jpeg,
          original,
          styleId,
          tenantId: tenant.id,
          sessionId,
          tier,
          actorKey,
          jobId,
          requestId,
          tool,
          kind,
          prompt: guestLook.prompt,
          reference: guestLook.reference,
          referenceFile: guestLook.referenceFile,
        });
    if (styled) return withPose(styled);
  }

  // Say why a guest got the unbilled sample instead of a provider call.
  const falState = effective === "fal" ? await resolveFalKey() : null;
  console.warn(
    `[tryon] sample preview for ${tenant.slug}/${tool}: guest engine "${effective}" is not ready` +
      (falState && !falState.ok ? ` (fal key ${falState.reason === "off" ? "saved but not enabled on /super/ai" : "missing"})` : ""),
  );
  return withPose(await demoGuestPreview({
    jpeg,
    styleId,
    styleName: look.name,
    tenantId: tenant.id,
    sessionId,
    tier,
    actorKey,
    jobId,
    requestId,
    tool,
    kind,
  }));
}
