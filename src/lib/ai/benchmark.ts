import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { styleById } from "@/data/styles";
import { readHairstyleReference } from "@/lib/ai/style-reference";
import {
  BENCHMARK_MODEL,
  BENCHMARK_QUALITY,
  editSizeForAspect,
  imageEditModel,
  outputListUsd,
  planImageEdit,
  type EditQuality,
  type EditSize,
} from "@/lib/ai/edit-request";
import { fitInsideCanvas, restoreFrame, type FrameTransform } from "@/lib/ai/frame";
import { buildReferencePrompt } from "@/lib/prompts";
import { bufferedInr, usdFromTokenCounts } from "@/lib/ai/tiers";
import { numberEnv } from "@/lib/env";

/**
 * First paid run, 4 Oct 2026: gpt-image-1.5 medium, 1536×1024 selfie canvas plus a 512×512 reference.
 * The response reported 10,885 image-input tokens. Output tokens were 1,899 against the guide's 1,568
 * for medium landscape. The margin below keeps the quote on the high side of that run.
 */
export const CALIBRATED_IMAGE_INPUT_TOKENS = 10_885;
export const CALIBRATED_INPUT_PIXELS = 1536 * 1024 + 512 * 512;
const IMAGE_TOKEN_MARGIN = 1.15;
const OUTPUT_TOKEN_MARGIN = 1899 / 1568;
const TEXT_INPUT_TOKEN_ALLOWANCE = 400;

/** Guide table for models prior to gpt-image-2. https://developers.openai.com/api/docs/guides/image-generation */
const OUTPUT_TOKEN_TABLE: Record<EditQuality, Record<EditSize, number>> = {
  low: { "1024x1024": 272, "1024x1536": 408, "1536x1024": 400 },
  medium: { "1024x1024": 1056, "1024x1536": 1584, "1536x1024": 1568 },
  high: { "1024x1024": 4160, "1024x1536": 6240, "1536x1024": 6208 },
};

export function benchmarkInputSizeMode(): "full" | "tight" {
  const raw = (process.env.BENCHMARK_INPUT_SIZE || "").trim().toLowerCase();
  if (raw === "1024" || raw === "tight") return "tight";
  return "full";
}

/** Full mode uses the closest supported canvas, including 1536×1024. Tight mode stays on a 1024 edge. */
export function benchmarkCanvasSize(width: number, height: number, allowed: readonly EditSize[]): EditSize {
  if (benchmarkInputSizeMode() === "tight") {
    const ratio = width / Math.max(1, height);
    if (ratio < 1 / 1.15 && allowed.includes("1024x1536")) return "1024x1536";
    if (allowed.includes("1024x1024")) return "1024x1024";
  }
  return editSizeForAspect(width, height, allowed);
}

export function estimateImageInputTokens(canvasPixels: number, referencePixels: number) {
  const pixels = Math.max(1, canvasPixels + referencePixels);
  return Math.ceil(pixels * (CALIBRATED_IMAGE_INPUT_TOKENS / CALIBRATED_INPUT_PIXELS) * IMAGE_TOKEN_MARGIN);
}

export function benchmarkRunCapInr() {
  return Math.max(0, numberEnv("BENCHMARK_RUN_CAP_INR", 30));
}

export function benchmarkModelId() {
  return process.env.BENCHMARK_MODEL?.trim() || BENCHMARK_MODEL;
}

export function benchmarkQuality(): EditQuality {
  const raw = process.env.BENCHMARK_QUALITY?.trim() || BENCHMARK_QUALITY;
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return BENCHMARK_QUALITY;
}

export function quoteBenchmark(width: number, height: number, reference = { width: 512, height: 512 }) {
  const model = benchmarkModelId();
  const quality = benchmarkQuality();
  const caps = imageEditModel(model);
  if (!caps) {
    return { ok: false as const, message: `${model} is not a configured image-edit model. Benchmark mode did not substitute another model.` };
  }
  if (!caps.inputFidelity?.includes("high")) {
    return { ok: false as const, message: `${model} does not accept input_fidelity=high. Benchmark mode did not send the request.` };
  }
  const size = benchmarkCanvasSize(width, height, caps.sizes);
  const [canvasWidth, canvasHeight] = size.split("x").map((part) => Number(part));
  const outputTokens = Math.ceil(OUTPUT_TOKEN_TABLE[quality][size] * OUTPUT_TOKEN_MARGIN);
  const imageInputTokens = estimateImageInputTokens(canvasWidth * canvasHeight, Math.max(1, reference.width) * Math.max(1, reference.height));
  const textInputTokens = TEXT_INPUT_TOKEN_ALLOWANCE;
  const outputUsd = usdFromTokenCounts(model, { textIn: 0, imageIn: 0, output: outputTokens });
  const imageInputUsd = usdFromTokenCounts(model, { textIn: 0, imageIn: imageInputTokens, output: 0 });
  const textInputUsd = usdFromTokenCounts(model, { textIn: textInputTokens, imageIn: 0, output: 0 });
  const estimateUsd = usdFromTokenCounts(model, { textIn: textInputTokens, imageIn: imageInputTokens, output: outputTokens });
  if (outputUsd == null || imageInputUsd == null || textInputUsd == null || estimateUsd == null) {
    return { ok: false as const, message: `No token rates for ${model}. The request was not sent.` };
  }
  if (outputListUsd(model, quality, size) == null) {
    return { ok: false as const, message: `No published output price for ${model} ${quality} ${size}. The request was not sent.` };
  }
  const estimateInr = bufferedInr(estimateUsd);
  const capInr = benchmarkRunCapInr();
  if (estimateInr > capInr) {
    return {
      ok: false as const,
      message: `This benchmark is about ₹${estimateInr.toFixed(2)} including input tokens, above the ₹${capInr.toFixed(0)} run cap. It was not sent.`,
    };
  }
  const inputSizeMode = benchmarkInputSizeMode();
  return {
    ok: true as const,
    model,
    quality,
    size,
    outputFormat: "png" as const,
    inputFidelity: "high" as const,
    n: 1 as const,
    estimateUsd,
    estimateInr,
    capInr,
    outputTokens,
    outputUsd,
    imageInputTokens,
    imageInputUsd,
    textInputTokens,
    textInputUsd,
    inputSizeMode,
    note: inputSizeMode === "tight"
      ? "Estimate, actual from provider usage. Tight input (BENCHMARK_INPUT_SIZE) sends a 1024-edge selfie. A wide photo gets side bars and a smaller subject. The reference stays at its native size. Not an invoice."
      : "Estimate, actual from provider usage. Image-input tokens are scaled from the first 1536×1024 run (10,885 image tokens for that canvas plus a 512 reference) with a 15% margin. Not an invoice.",
  };
}

export async function prepareBenchmark(args: { jpeg: Buffer; styleId: string; colourName?: string }) {
  const style = styleById(args.styleId);
  if (!style) return { ok: false as const, message: "That style is not in the catalogue." };
  const reference = readHairstyleReference(style.id);
  if (!reference) {
    return {
      ok: false as const,
      message: `No reference image for ${style.id}. Add public/styles/${style.id}.jpg. Benchmark mode does not fall back to a text-only edit.`,
    };
  }
  const selfieMeta = await sharp(args.jpeg, { failOn: "none" }).metadata();
  const referenceMeta = await sharp(reference, { failOn: "none" }).metadata();
  const width = selfieMeta.width || 0;
  const height = selfieMeta.height || 0;
  if (!width || !height) return { ok: false as const, message: "The selfie could not be read." };
  const quote = quoteBenchmark(width, height, { width: referenceMeta.width || 512, height: referenceMeta.height || 512 });
  if (!quote.ok) return quote;
  const planned = planImageEdit({
    model: quote.model,
    prompt: buildReferencePrompt(style, args.colourName),
    quality: quote.quality,
    size: quote.size,
    outputFormat: "png",
    inputFidelity: "high",
    imageOrder: ["selfie.png", "style-reference.jpg"],
    mask: false,
  });
  if (!planned.ok) return planned;
  const fitted = await fitInsideCanvas(args.jpeg, quote.size);
  return {
    ok: true as const,
    style,
    quote,
    planned: planned.plan,
    reference,
    referenceWidth: referenceMeta.width || 0,
    referenceHeight: referenceMeta.height || 0,
    fitted,
  };
}

export async function writeBenchmarkStages(dir: string, stages: {
  original: Buffer;
  sanitized: Buffer;
  providerInput: Buffer;
  reference: Buffer;
  providerResponse?: Buffer;
  restored?: Buffer;
  aligned?: Buffer;
  maskOverlay?: Buffer;
  hairComposite?: Buffer;
  validation: unknown;
  transform: FrameTransform;
}) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "original-input.jpg"), stages.original);
  await writeFile(path.join(dir, "sanitized-input.jpg"), stages.sanitized);
  await writeFile(path.join(dir, "provider-input.png"), stages.providerInput);
  await writeFile(path.join(dir, "provider-reference.jpg"), stages.reference);
  await writeFile(path.join(dir, "transform.json"), JSON.stringify(stages.transform, null, 2));
  await writeFile(path.join(dir, "validation.json"), JSON.stringify(stages.validation, null, 2));
  if (stages.providerResponse) await writeFile(path.join(dir, "provider-response.png"), stages.providerResponse);
  if (stages.restored) await writeFile(path.join(dir, "restored-output.png"), stages.restored);
  if (stages.aligned) await writeFile(path.join(dir, "aligned-output.png"), stages.aligned);
  if (stages.maskOverlay) await writeFile(path.join(dir, "mask-overlay.png"), stages.maskOverlay);
  if (stages.hairComposite) await writeFile(path.join(dir, "hair-composite.png"), stages.hairComposite);
}

export async function restoredFromProvider(providerResponse: Buffer, transform: FrameTransform) {
  return restoreFrame(providerResponse, transform);
}

export const BENCHMARK_STAGES = [
  "original-input.jpg",
  "sanitized-input.jpg",
  "provider-input.png",
  "provider-reference.jpg",
  "provider-response.png",
  "restored-output.png",
  "aligned-output.png",
  "mask-overlay.png",
  "hair-composite.png",
  "transform.json",
  "validation.json",
] as const;

export function benchmarkDir(id: string) {
  return path.join(process.cwd(), "var", "benchmarks", id);
}

export type { EditSize };
