import { NextResponse } from "next/server";
import sharp from "sharp";
import { quoteBenchmark } from "@/lib/ai/benchmark";
import { quoteComparisonModel } from "@/lib/ai/compare-models";
import { readHairstyleReference } from "@/lib/ai/style-reference";
import { requireSuper } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Super-admin quote for the salon try-on switch. Field names stay off the guest preview. */
export async function GET(req: Request) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const url = new URL(req.url);
  const width = Number(url.searchParams.get("width") || 0);
  const height = Number(url.searchParams.get("height") || 0);
  const styleId = url.searchParams.get("styleId") || "";
  if (width < 64 || height < 64 || !styleId) {
    return NextResponse.json({ error: "SIZE", message: "A style and photo size are required to quote this try-on." }, { status: 400 });
  }
  const referenceBytes = readHairstyleReference(styleId);
  const referenceMeta = referenceBytes ? await sharp(referenceBytes, { failOn: "none" }).metadata() : null;
  const requested = url.searchParams.get("model") || "";
  const referenceSize = { width: referenceMeta?.width || 512, height: referenceMeta?.height || 512 };
  const quote = requested ? quoteComparisonModel(requested, width, height, referenceSize) : quoteBenchmark(width, height, referenceSize);
  if (!quote.ok) return NextResponse.json({ error: "QUOTE", message: quote.message }, { status: 400 });
  return NextResponse.json({
    model: quote.model,
    provider: "provider" in quote ? quote.provider : "openai",
    quality: quote.quality,
    size: quote.size,
    rupees: quote.estimateInr,
    dollars: quote.estimateUsd,
    note: quote.note,
    warning: "warning" in quote ? quote.warning || "" : "",
    rangeLowInr: "rangeLowInr" in quote ? quote.rangeLowInr : null,
    rangeHighInr: "rangeHighInr" in quote ? quote.rangeHighInr : null,
  });
}
