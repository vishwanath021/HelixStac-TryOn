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
import { bufferedInr } from "@/lib/ai/tiers";
import { numberEnv } from "@/lib/env";

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

export function quoteBenchmark(width: number, height: number) {
  const model = benchmarkModelId();
  const quality = benchmarkQuality();
  const caps = imageEditModel(model);
  if (!caps) {
    return { ok: false as const, message: `${model} is not a configured image-edit model. Benchmark mode did not substitute another model.` };
  }
  if (!caps.inputFidelity?.includes("high")) {
    return { ok: false as const, message: `${model} does not accept input_fidelity=high. Benchmark mode did not send the request.` };
  }
  const size = editSizeForAspect(width, height, caps.sizes);
  const usd = outputListUsd(model, quality, size);
  if (usd == null) {
    return { ok: false as const, message: `No published output price for ${model} ${quality} ${size}. The request was not sent.` };
  }
  const estimateInr = bufferedInr(usd);
  const capInr = benchmarkRunCapInr();
  if (estimateInr > capInr) {
    return {
      ok: false as const,
      message: `This benchmark is about ₹${estimateInr.toFixed(2)} before input tokens, above the ₹${capInr.toFixed(0)} run cap. It was not sent.`,
    };
  }
  return {
    ok: true as const,
    model,
    quality,
    size,
    outputFormat: "png" as const,
    inputFidelity: "high" as const,
    n: 1 as const,
    estimateUsd: usd,
    estimateInr,
    capInr,
    note: "List-price output estimate from the OpenAI image table. Image and text input tokens are extra and unknown until the response. Not an invoice.",
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
  const quote = quoteBenchmark(width, height);
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
  "transform.json",
  "validation.json",
] as const;

export function benchmarkDir(id: string) {
  return path.join(process.cwd(), "var", "benchmarks", id);
}

export type { EditSize };
