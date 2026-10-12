import sharp from "sharp";
import { NextResponse } from "next/server";
import { beardById } from "@/data/beards";
import { browById, type BrowVariation } from "@/data/brows";
import { nailById } from "@/data/nails";
import { shadeById } from "@/data/shades";
import { browDiagramJpeg } from "@/lib/ai/brow-diagram";
import { demoStyleComposite } from "@/lib/ai/composite";
import { resolveFalKey, resolveOpenAIKey } from "@/lib/ai/credentials";
import { completeGenerationJob, failGenerationJob } from "@/lib/ai/dedupe";
import { guestPreviewHeaders } from "@/lib/ai/guest-response";
import { executeReferenceEdit } from "@/lib/ai/reference-run";
import { readHairstyleReference, thumbnailFolder } from "@/lib/ai/style-reference";
import { CreditError, reserveCredits, settleCredits } from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import { buildBeardPrompt, buildBrowPrompt, buildColourPrompt, buildNailPrompt } from "@/lib/prompts";
import { guestLimitMessage } from "@/lib/tools";

/** Guest hairstyles. Model ids stay in this module so the guest route does not name them. */
export const GUEST_FAL_MODEL = "blackforestlabs/flux-3/edit-image";
export const GUEST_OPENAI_MODEL = "gpt-image-2.5-sunburst";

export type GuestEngine = "fal" | "openai";

export function parseGuestEngine(value: string): GuestEngine | null {
  if (value === "fal" || value === "openai") return value;
  return null;
}

export function guestEngineModel(engine: GuestEngine) {
  return engine === "openai" ? GUEST_OPENAI_MODEL : GUEST_FAL_MODEL;
}

/** Brows stay on sunburst. Style, beard, colour, and nails follow the admin default. */
export function engineForGuestTool(tool: string, selected: GuestEngine): GuestEngine {
  return tool === "brows" ? "openai" : selected;
}

/**
 * sunburst: an OpenAI key is saved, so brows call gpt-image-2.5-sunburst.
 * message: another engine is ready, so refusing avoids a charged FLUX.3 call.
 * demo: nothing is ready, so the unbilled sample card can still show.
 */
export function browsRoute(args: { openaiReady: boolean; selected: GuestEngine; selectedReady: boolean }): "sunburst" | "message" | "demo" {
  if (args.openaiReady) return "sunburst";
  if (args.selected !== "openai" && args.selectedReady) return "message";
  return "demo";
}

export const BROWS_NEED_OPENAI = "Brows use OpenAI sunburst. Add an OpenAI key on AI settings. This preview was not sent.";

async function setting(key: string) {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return row?.value ?? "";
}

/** Salon override wins. An empty override uses the platform default, which is fal. */
export async function readGuestEngine(tenantId: string): Promise<{ engine: GuestEngine; source: "salon" | "platform" }> {
  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { hairstyleEngine: true } });
    const override = parseGuestEngine(tenant?.hairstyleEngine || "");
    if (override) return { engine: override, source: "salon" };
  }
  return { engine: parseGuestEngine(await setting("guest_hairstyle_engine")) || "fal", source: "platform" };
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
  const engine = engineForGuestTool(args.tool, selected);
  if (!(await guestEngineReady(engine))) return null;
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
  } catch (error) {
    await settleCredits(args.tenantId, creditRef, "REFUND");
    throw error;
  }
  const kind = args.kind;
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
  const jpegOut = await sharp(executed.imagePng).jpeg({ quality: 90 }).toBuffer();
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
    headers: guestPreviewHeaders({ tryOnId: tryOn.id, creditsLeft: balance?.creditBalance ?? 0, demoReason: "" }),
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
  const image = await demoStyleComposite(args.jpeg, args.styleId, args.styleName, thumbnailFolder(args.tool));
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
    headers: guestPreviewHeaders({ tryOnId: tryOn.id, creditsLeft: balance?.creditBalance ?? 0, demoReason: "no-key" }),
  });
}
