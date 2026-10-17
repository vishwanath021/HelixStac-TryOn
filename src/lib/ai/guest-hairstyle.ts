import sharp from "sharp";
import { NextResponse } from "next/server";
import { beardById } from "@/data/beards";
import { browById, type BrowVariation } from "@/data/brows";
import { nailById } from "@/data/nails";
import { shadeById } from "@/data/shades";
import { browDiagramJpeg } from "@/lib/ai/brow-diagram";
import { demoBridalSample, demoStyleComposite } from "@/lib/ai/composite";
import { resolveFalKey, resolveOpenAIKey } from "@/lib/ai/credentials";
import { completeGenerationJob, failGenerationJob } from "@/lib/ai/dedupe";
import { guestPreviewHeaders } from "@/lib/ai/guest-response";
import { executeReferenceEdit } from "@/lib/ai/reference-run";
import { readHairstyleReference, thumbnailFolder } from "@/lib/ai/style-reference";
import { CreditError, reserveCredits, settleCredits } from "@/lib/credits";
import { numberEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { appMediaUrl } from "@/lib/storage";
import { cropLetterbox } from "@/lib/ai/letterbox";
import { COLOUR_UNCHANGED_MESSAGE, hairChange } from "@/lib/ai/look-change";
import { buildBeardPrompt, buildBrowPrompt, buildColourPrompt, buildNailPrompt } from "@/lib/prompts";
import { guestLimitMessage } from "@/lib/tools";

/** Guest hairstyles. Model ids stay in this module so the guest route does not name them. */
export const GUEST_FAL_MODEL = "blackforestlabs/flux-3/edit-image";
export const GUEST_OPENAI_MODEL = "gpt-image-2.5-sunburst";

export type GuestEngine = "fal" | "openai";

/** Salon try-ons use sunburst at quality medium unless a salon or platform setting says fal. */
export const DEFAULT_GUEST_ENGINE: GuestEngine = "openai";

export function parseGuestEngine(value: string): GuestEngine | null {
  if (value === "fal" || value === "openai") return value;
  return null;
}

export function guestEngineModel(engine: GuestEngine) {
  return engine === "openai" ? GUEST_OPENAI_MODEL : GUEST_FAL_MODEL;
}

/**
 * Hairstyle, beard, colour, makeup, and bridal use the same engine.
 * The default is OpenAI gpt-image-2.5-sunburst at quality medium.
 * fal FLUX.3 is the automatic fallback when OpenAI is not ready or fails without a bill.
 */
export function engineForGuestTool(_tool: string, selected: GuestEngine): GuestEngine {
  return selected;
}

/** First attempt. A missing OpenAI key uses fal when that key is ready. */
export function guestEngineToRun(selected: GuestEngine, openaiReady: boolean, falReady: boolean): GuestEngine | null {
  const engine = engineForGuestTool("", selected);
  if (engine === "openai") {
    if (openaiReady) return "openai";
    return falReady ? "fal" : null;
  }
  return falReady ? "fal" : null;
}

/**
 * Second attempt after OpenAI. A timeout or a billed failure is not sent again.
 * An unbilled rejection can try fal FLUX.3.
 */
export function guestEngineAfterFailure(
  selected: GuestEngine,
  falReady: boolean,
  failure: { outcome: string; billedAttempt?: boolean },
): GuestEngine | null {
  if (engineForGuestTool("", selected) !== "openai") return null;
  if (!falReady) return null;
  if (failure.outcome === "uncertain" || failure.outcome === "spend-cap" || failure.billedAttempt) return null;
  if (failure.outcome !== "provider") return null;
  return "fal";
}

async function setting(key: string) {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return row?.value ?? "";
}

/** Salon override wins. An empty override uses sunburst. */
export async function readGuestEngine(tenantId: string): Promise<{ engine: GuestEngine; source: "salon" | "platform" }> {
  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { hairstyleEngine: true } });
    const override = parseGuestEngine(tenant?.hairstyleEngine || "");
    if (override) return { engine: override, source: "salon" };
  }
  return { engine: parseGuestEngine(await setting("guest_hairstyle_engine")) || DEFAULT_GUEST_ENGINE, source: "platform" };
}

export async function guestEngineReady(engine: GuestEngine) {
  if (engine === "fal") {
    const fal = await resolveFalKey();
    return fal.ok;
  }
  return Boolean(await resolveOpenAIKey());
}

export async function saveGuestEngine(engine: GuestEngine, actorId: string) {
  await prisma.platformSetting.upsert({
    where: { key: "guest_hairstyle_engine" },
    update: { value: engine },
    create: { key: "guest_hairstyle_engine", value: engine },
  });
  await prisma.auditLog.create({
    data: { actorId, action: "GUEST_ENGINE", target: "platform", meta: JSON.stringify({ engine }) },
  });
}

export async function saveSalonGuestEngine(tenantId: string, engine: "" | GuestEngine, actorId: string) {
  await prisma.tenant.update({ where: { id: tenantId }, data: { hairstyleEngine: engine } });
  await prisma.auditLog.create({
    data: { actorId, action: "GUEST_ENGINE", target: tenantId, meta: JSON.stringify({ engine: engine || "inherit" }) },
  });
}

function lookShareUrl(tenantId: string, requestId: string) {
  if (!requestId) return "";
  try {
    const hours = numberEnv("GENERATION_JOB_TTL_HOURS", 24);
    return appMediaUrl(`generations/${tenantId}/${requestId}/result.jpg`, Math.max(60, Math.round(hours * 3600)));
  } catch {
    return "";
  }
}

/** One row per real preview. Demo samples are not logged. */
export async function logGenerateEvent(args: { tenantId: string; sessionId: string; styleId: string; tool: string; tryOnId: string }) {
  await prisma.usageEvent.create({
    data: {
      tenantId: args.tenantId,
      sessionId: args.sessionId,
      name: "generate",
      props: JSON.stringify({ styleId: args.styleId, tool: args.tool, tryOnId: args.tryOnId }),
    },
  });
}

function guestMessage(outcome: string) {
  if (outcome === "spend-cap") return "This salon's preview budget is used up.";
  if (outcome === "uncertain") return "The preview may have been billed. It was not started again.";
  return "The preview did not finish. It was not started again.";
}

export type GuestLookTool = "brows" | "beard" | "nails" | "colour";

async function shadeSwatch(hex: string) {
  return sharp({ create: { width: 512, height: 512, channels: 3, background: hex } }).jpeg({ quality: 90 }).toBuffer();
}

/** Image 2 for a guest look. Colour is a flat swatch. Brows are a shape diagram. The others are catalogue JPEGs. */
export async function loadGuestReference(tool: GuestLookTool, styleId: string, variation?: BrowVariation) {
  if (tool === "colour") {
    const shade = shadeById(styleId);
    if (!shade) return null;
    return {
      prompt: buildColourPrompt(shade),
      reference: await shadeSwatch(shade.hex),
      referenceFile: `${shade.id}-swatch.jpg`,
    };
  }
  if (tool === "brows") {
    const brow = browById(styleId);
    if (!brow) return null;
    const reference = await browDiagramJpeg(brow.id);
    if (!reference) return null;
    return { prompt: buildBrowPrompt(brow, variation), reference, referenceFile: `${brow.id}.jpg` };
  }
  const reference = readHairstyleReference(styleId, thumbnailFolder(tool));
  if (!reference) return null;
  if (tool === "beard") {
    const beard = beardById(styleId);
    if (!beard) return null;
    return { prompt: buildBeardPrompt(beard), reference, referenceFile: `${beard.id}.jpg` };
  }
  const nail = nailById(styleId);
  if (!nail) return null;
  return { prompt: buildNailPrompt(nail), reference, referenceFile: `${nail.id}.jpg` };
}

type GuestEditArgs = {
  jpeg: Buffer;
  original: Buffer;
  styleId: string;
  tenantId: string;
  sessionId: string;
  tier: string;
  actorKey: string;
  jobId: string;
  requestId: string;
  tool: string;
  kind: string;
  guest?: { prompt: string; reference: Buffer; referenceFile: string };
};

/**
 * Selfie plus image 2, raw provider image, one call.
 * Returns null when the selected engine has no key, so the caller can show a demo preview.
 * The guest response is a JPEG. Cost and model stay on the ledger.
 */
async function runGuestEdit(args: GuestEditArgs): Promise<NextResponse | null> {
  const selected = (await readGuestEngine(args.tenantId)).engine;
  const openaiReady = await guestEngineReady("openai");
  const falReady = await guestEngineReady("fal");
  const engine = guestEngineToRun(engineForGuestTool(args.tool, selected), openaiReady, falReady);
  if (!engine) return null;
  const creditRef = `guest:${args.tenantId}:${args.requestId || args.jobId || "preview"}`;
  try {
    await reserveCredits(args.tenantId, 1, creditRef);
  } catch (error) {
    if (error instanceof CreditError) {
      await failGenerationJob(args.jobId, { outcome: "credits", message: guestLimitMessage("credits") });
      return NextResponse.json({ error: "CREDITS", message: guestLimitMessage("credits") }, { status: 402 });
    }
    throw error;
  }
  let executed: Awaited<ReturnType<typeof executeReferenceEdit>>;
  try {
    executed = await executeReferenceEdit({
      jpeg: args.jpeg,
      original: args.original,
      styleId: args.styleId,
      tenantId: args.tenantId,
      source: "tryon",
      tool: args.tool,
      modelId: guestEngineModel(engine),
      quality: "medium",
      guest: args.guest,
    });
    const fallback = guestEngineAfterFailure(selected, falReady, executed.ok ? { outcome: "ok" } : executed);
    if (fallback) {
      executed = await executeReferenceEdit({
        jpeg: args.jpeg,
        original: args.original,
        styleId: args.styleId,
        tenantId: args.tenantId,
        source: "tryon",
        tool: args.tool,
        modelId: guestEngineModel(fallback),
        quality: "medium",
        guest: args.guest,
      });
    }
  } catch (error) {
    await settleCredits(args.tenantId, creditRef, "REFUND");
    throw error;
  }
  const kind = args.kind;
  const framed = executed.ok ? await cropLetterbox(executed.framedPng) : null;
  if (executed.ok && args.tool === "colour" && framed) {
    const change = await hairChange(args.jpeg, framed).catch(() => null);
    if (change?.unchanged) {
      await settleCredits(args.tenantId, creditRef, "REFUND");
      await failGenerationJob(args.jobId, { outcome: "unchanged", message: COLOUR_UNCHANGED_MESSAGE, callId: executed.callId });
      await prisma.tryOn.create({
        data: {
          tenantId: args.tenantId,
          sessionId: args.sessionId,
          styleId: args.styleId,
          shadeId: args.styleId,
          kind,
          tier: args.tier,
          actorKey: args.actorKey,
          quality: "standard",
          status: "FAILED",
          credits: 0,
          latencyMs: executed.latencyMs,
        },
      });
      return NextResponse.json({ error: "UNCHANGED", message: COLOUR_UNCHANGED_MESSAGE }, { status: 422 });
    }
  }
  if (!executed.ok) {
    await settleCredits(args.tenantId, creditRef, "REFUND");
    await failGenerationJob(args.jobId, { outcome: executed.outcome, message: guestMessage(executed.outcome), callId: executed.callId });
    await prisma.tryOn.create({
      data: {
        tenantId: args.tenantId,
        sessionId: args.sessionId,
        styleId: args.styleId,
        shadeId: kind === "COLOUR" ? args.styleId : null,
        kind,
        tier: args.tier,
        actorKey: args.actorKey,
        quality: "standard",
        status: "FAILED",
        credits: 0,
      },
    });
    return NextResponse.json({ error: "PREVIEW", message: guestMessage(executed.outcome) }, { status: executed.httpStatus });
  }
  const jpegOut = await sharp(framed || executed.framedPng).jpeg({ quality: 90 }).toBuffer();
  const tryOn = await prisma.tryOn.create({
    data: {
      tenantId: args.tenantId,
      sessionId: args.sessionId,
      styleId: args.styleId,
      shadeId: kind === "COLOUR" ? args.styleId : null,
      kind,
      tier: args.tier,
      actorKey: args.actorKey,
      quality: "standard",
      status: "SUCCEEDED",
      latencyMs: executed.latencyMs,
      credits: 1,
    },
  });
  await settleCredits(args.tenantId, creditRef, "COMMIT");
  await logGenerateEvent({
    tenantId: args.tenantId,
    sessionId: args.sessionId,
    styleId: args.styleId,
    tool: args.tool,
    tryOnId: tryOn.id,
  });
  if (args.requestId) {
    await completeGenerationJob(args.jobId, {
      tenantId: args.tenantId,
      requestId: args.requestId,
      image: jpegOut,
      demoReason: "",
      callId: executed.callId,
    });
  }
  const balance = await prisma.tenant.findUnique({ where: { id: args.tenantId }, select: { creditBalance: true } });
  return new NextResponse(new Uint8Array(jpegOut), {
    status: 200,
    headers: guestPreviewHeaders({
      tryOnId: tryOn.id,
      creditsLeft: balance?.creditBalance ?? 0,
      demoReason: "",
      lookShare: lookShareUrl(args.tenantId, args.requestId),
    }),
  });
}

export function runGuestHairstyleIfReady(args: Omit<GuestEditArgs, "tool" | "kind" | "guest">) {
  return runGuestEdit({ ...args, tool: "style", kind: "STYLE" });
}

export function runGuestLookIfReady(args: Omit<GuestEditArgs, "guest"> & { prompt: string; reference: Buffer; referenceFile: string }) {
  return runGuestEdit({
    ...args,
    guest: { prompt: args.prompt, reference: args.reference, referenceFile: args.referenceFile },
  });
}

/** No engine key. A labelled card, not a provider call and not a masked paste. */
export async function demoGuestPreview(args: Omit<GuestEditArgs, "guest" | "original"> & { styleName: string }) {
  const image = args.tool === "bridal" || args.tool === "mehendi"
    ? await demoBridalSample(args.jpeg, args.styleName)
    : await demoStyleComposite(args.jpeg, args.styleId, args.styleName, thumbnailFolder(args.tool));
  const tryOn = await prisma.tryOn.create({
    data: {
      tenantId: args.tenantId,
      sessionId: args.sessionId,
      styleId: args.styleId,
      shadeId: args.kind === "COLOUR" ? args.styleId : null,
      kind: args.kind,
      tier: args.tier,
      actorKey: args.actorKey,
      quality: "standard",
      status: "DEMO",
      credits: 0,
    },
  });
  if (args.requestId) {
    await completeGenerationJob(args.jobId, {
      tenantId: args.tenantId,
      requestId: args.requestId,
      image,
      demoReason: "no-key",
    });
  }
  const balance = await prisma.tenant.findUnique({ where: { id: args.tenantId }, select: { creditBalance: true } });
  return new NextResponse(new Uint8Array(image), {
    status: 200,
    headers: guestPreviewHeaders({
      tryOnId: tryOn.id,
      creditsLeft: balance?.creditBalance ?? 0,
      demoReason: "no-key",
      lookShare: lookShareUrl(args.tenantId, args.requestId),
    }),
  });
}
