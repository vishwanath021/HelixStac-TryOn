import sharp from "sharp";
import { NextResponse } from "next/server";
import { resolveFalKey, resolveOpenAIKey } from "@/lib/ai/credentials";
import { completeGenerationJob, failGenerationJob } from "@/lib/ai/dedupe";
import { guestPreviewHeaders } from "@/lib/ai/guest-response";
import { executeReferenceEdit } from "@/lib/ai/reference-run";
import { prisma } from "@/lib/prisma";

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

/**
 * Hairstyle path: selfie plus the style photo, raw provider image, one call.
 * Returns null when the selected engine has no key, so the caller can show a demo preview.
 * The guest response is a JPEG. Cost and model stay on the ledger.
 */
export async function runGuestHairstyleIfReady(args: {
  jpeg: Buffer;
  original: Buffer;
  styleId: string;
  tenantId: string;
  sessionId: string;
  tier: string;
  actorKey: string;
  jobId: string;
  requestId: string;
}): Promise<NextResponse | null> {
  const { engine } = await readGuestEngine(args.tenantId);
  if (!(await guestEngineReady(engine))) return null;
  const executed = await executeReferenceEdit({
    jpeg: args.jpeg,
    original: args.original,
    styleId: args.styleId,
    tenantId: args.tenantId,
    source: "tryon",
    tool: "style",
    modelId: guestEngineModel(engine),
    quality: "medium",
  });
  if (!executed.ok) {
    await failGenerationJob(args.jobId, { outcome: executed.outcome, message: guestMessage(executed.outcome), callId: executed.callId });
    await prisma.tryOn.create({
      data: {
        tenantId: args.tenantId,
        sessionId: args.sessionId,
        styleId: args.styleId,
        kind: "STYLE",
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
      kind: "STYLE",
      tier: args.tier,
      actorKey: args.actorKey,
      quality: "standard",
      status: "SUCCEEDED",
      latencyMs: executed.latencyMs,
      credits: 0,
    },
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
    headers: guestPreviewHeaders({ tryOnId: tryOn.id, creditsLeft: balance?.creditBalance ?? 0, demoReason: "" }),
  });
}
