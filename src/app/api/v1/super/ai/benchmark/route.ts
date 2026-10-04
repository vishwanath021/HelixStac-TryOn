import { NextResponse } from "next/server";
import sharp from "sharp";
import { quoteBenchmark } from "@/lib/ai/benchmark";
import { readHairstyleReference } from "@/lib/ai/style-reference";
import { executeReferenceEdit } from "@/lib/ai/reference-run";
import { bufferedInr } from "@/lib/ai/tiers";
import { sanitizeSelfie, ImageError } from "@/lib/images";
import { requireSuper } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3780;

export async function GET(req: Request) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const url = new URL(req.url);
  const width = Number(url.searchParams.get("width") || 0);
  const height = Number(url.searchParams.get("height") || 0);
  if (width < 64 || height < 64) {
    return NextResponse.json({ error: "SIZE", message: "Width and height are required to quote a benchmark." }, { status: 400 });
  }
  const styleId = url.searchParams.get("styleId") || "";
  const referenceBytes = styleId ? readHairstyleReference(styleId) : null;
  const referenceMeta = referenceBytes ? await sharp(referenceBytes, { failOn: "none" }).metadata() : null;
  const quote = quoteBenchmark(width, height, {
    width: referenceMeta?.width || 512,
    height: referenceMeta?.height || 512,
  });
  if (!quote.ok) return NextResponse.json({ error: "QUOTE", message: quote.message }, { status: 400 });
  return NextResponse.json(quote);
}

export async function POST(req: Request) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "INVALID", message: "Send one selfie and one style." }, { status: 400 });
  if (String(form.get("confirm") || "") !== "yes") {
    return NextResponse.json({ error: "CONFIRM", message: "Confirm the estimated cost before the paid call." }, { status: 400 });
  }
  const styleId = String(form.get("styleId") || "");
  const photo = form.get("photo");
  const original = photo instanceof File ? Buffer.from(await photo.arrayBuffer()) : null;
  if (!original) return NextResponse.json({ error: "PHOTO", message: "Choose one selfie for this run." }, { status: 400 });
  let jpeg: Buffer;
  try {
    jpeg = await sanitizeSelfie(original);
  } catch (error) {
    const code = error instanceof ImageError ? error.code : "DECODE";
    return NextResponse.json({ error: code, message: "Use a JPEG, PNG, or WebP selfie under 2 MB." }, { status: 400 });
  }
  const executed = await executeReferenceEdit({
    jpeg,
    original,
    styleId,
    tenantId: "benchmark",
    source: "benchmark",
    tool: "benchmark",
  });
  if (!executed.ok) {
    return NextResponse.json({ error: executed.error === "PROVIDER" ? "BENCHMARK" : executed.error, message: executed.message, id: executed.id }, { status: executed.httpStatus });
  }
  return NextResponse.json({
    id: executed.id,
    status: "UNVALIDATED",
    model: executed.model,
    quality: executed.quality,
    size: executed.size,
    estimateInr: executed.estimateInr,
    estimateUsd: executed.estimateUsd,
    actualUsd: executed.actualUsd,
    actualInr: executed.actualInr,
    bufferedActualInr: bufferedInr(executed.actualUsd),
    latencyMs: executed.latencyMs,
    usage: executed.usage,
    clothingWarning: executed.clothingWarning || null,
    message: executed.message,
  });
}
