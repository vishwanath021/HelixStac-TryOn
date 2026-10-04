import { benchmarkRunCapInr } from "@/lib/ai/benchmark";
import { editSizeForAspect, type EditSize } from "@/lib/ai/edit-request";
import { bufferedInr, exactInr } from "@/lib/ai/tiers";

/**
 * Explicit fal edit endpoints. Match the full id. Prices from each model's llms.txt page, fetched 4 Oct 2026.
 * Where the page does not say whether inputs are billed, the quote keeps both ends and the cap uses the higher one.
 */
const OUTPUT_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;

export type FalSizeMode = "image_size" | "aspect_ratio";

export type FalModelRow = {
  id: string;
  label: string;
  experimental: boolean;
  /** The schema lists enable_safety_checker. nano-banana uses safety_tolerance and does not get this field. */
  safetyChecker: boolean;
  sizeMode: FalSizeMode;
  /** Documented maximum image_urls. 0 means the fetched page did not state a maximum. */
  maxInputs: number;
};

export const FAL_COMPARISON_MODELS: readonly FalModelRow[] = [
  {
    id: "fal-ai/flux-2/edit",
    label: "fal-ai/flux-2/edit",
    experimental: false,
    safetyChecker: true,
    sizeMode: "image_size",
    maxInputs: 4,
  },
  {
    id: "fal-ai/flux-2-pro/edit",
    label: "fal-ai/flux-2-pro/edit",
    experimental: false,
    safetyChecker: true,
    sizeMode: "image_size",
    maxInputs: 0,
  },
  {
    id: "fal-ai/qwen-image-edit-2511",
    label: "fal-ai/qwen-image-edit-2511",
    experimental: false,
    safetyChecker: true,
    sizeMode: "image_size",
    maxInputs: 0,
  },
  {
    id: "fal-ai/bytedance/seedream/v4/edit",
    label: "fal-ai/bytedance/seedream/v4/edit (experimental)",
    experimental: true,
    safetyChecker: true,
    sizeMode: "image_size",
    maxInputs: 10,
  },
  {
    id: "fal-ai/flux-2/klein/9b/edit",
    label: "fal-ai/flux-2/klein/9b/edit (experimental)",
    experimental: true,
    safetyChecker: true,
    sizeMode: "image_size",
    maxInputs: 4,
  },
  {
    id: "fal-ai/flux-2/klein/4b/edit",
    label: "fal-ai/flux-2/klein/4b/edit (experimental)",
    experimental: true,
    safetyChecker: true,
    sizeMode: "image_size",
    maxInputs: 4,
  },
  {
    id: "fal-ai/nano-banana/edit",
    label: "fal-ai/nano-banana/edit (experimental)",
    experimental: true,
    safetyChecker: false,
    sizeMode: "aspect_ratio",
    maxInputs: 0,
  },
];

export function falModel(id: string) {
  return FAL_COMPARISON_MODELS.find((row) => row.id === id) ?? null;
}

export function falOutputSize(width: number, height: number): EditSize {
  return editSizeForAspect(width, height, OUTPUT_SIZES);
}

function megapixels(width: number, height: number) {
  return (Math.max(1, width) * Math.max(1, height)) / 1_000_000;
}

function roundUpMp(value: number) {
  return Math.max(1, Math.ceil(value - 1e-9));
}

export type FalUsdRange = {
  lowUsd: number;
  highUsd: number;
  detail: string;
};

/**
 * Dollar range before the 8% INR buffer.
 * A model that resizes each input to 1MP uses 1 MP as the low input reading and one MP per input as the high reading.
 * A page that only says "per megapixel" uses output-only as the low end and the higher of actual pixels or 1 MP per input as the high end.
 */
export function falUsdRange(
  id: string,
  output: EditSize,
  inputs: { width: number; height: number }[],
): FalUsdRange | null {
  const [outW, outH] = output.split("x").map((part) => Number(part));
  const outMp = megapixels(outW, outH);
  const count = Math.max(1, inputs.length);
  const actualIn = inputs.reduce((sum, image) => sum + megapixels(image.width, image.height), 0);
  if (id === "fal-ai/flux-2/edit" || id === "fal-ai/flux-2/klein/9b/edit") {
    const rate = id.endsWith("/9b/edit") ? 0.011 : 0.012;
    return {
      lowUsd: (1 + outMp) * rate,
      highUsd: (count + outMp) * rate,
      detail: `$${rate} per megapixel of input and output. The page resizes each input to 1MP. The low end counts the inputs as 1MP together. The high end counts ${count} input megapixels. Which of those fal bills was not stated beyond the one-input example.`,
    };
  }
  if (id === "fal-ai/flux-2-pro/edit") {
    const outUnits = roundUpMp(outMp);
    const outputUsd = 0.03 + Math.max(0, outUnits - 1) * 0.015;
    const inputUnits = inputs.reduce((sum, image) => sum + roundUpMp(megapixels(image.width, image.height)), 0);
    return {
      lowUsd: outputUsd,
      highUsd: outputUsd + inputUnits * 0.015,
      detail: "$0.03 for the first output megapixel, then $0.015 per extra megapixel of input and output, rounded up. The low end is output only. The high end rounds up each input image. The fetched page did not state a maximum of 9 references.",
    };
  }
  if (id === "fal-ai/qwen-image-edit-2511" || id === "fal-ai/flux-2/klein/4b/edit") {
    const rate = id.endsWith("/4b/edit") ? 0.01 : 0.03;
    const billedIn = Math.max(count, actualIn);
    return {
      lowUsd: outMp * rate,
      highUsd: (billedIn + outMp) * rate,
      detail: `$${rate} per megapixel. The page does not say whether inputs are included. The low end is the output only. The high end bills the larger of actual input pixels or 1MP for each input.`,
    };
  }
  if (id === "fal-ai/bytedance/seedream/v4/edit") {
    return {
      lowUsd: 0.03,
      highUsd: 0.03,
      detail: "$0.03 per image. The page prices the output image, not extra megapixels. image_size is sent explicitly so the 2048 default is not used. Minimum area is 921,600 pixels.",
    };
  }
  if (id === "fal-ai/nano-banana/edit") {
    return {
      lowUsd: 0.039,
      highUsd: 0.039,
      detail: "$0.039 per image. aspect_ratio is sent (2:3, 3:2, or 1:1). The page does not add an input megapixel term.",
    };
  }
  return null;
}

export function quoteFalModel(id: string, width: number, height: number, reference = { width: 512, height: 512 }) {
  const row = falModel(id);
  if (!row) return { ok: false as const, message: `${id} is not a configured comparison model. No other model was substituted.` };
  const size = falOutputSize(width, height);
  const range = falUsdRange(id, size, [
    { width, height },
    reference,
  ]);
  if (!range) return { ok: false as const, message: `${id} has no documented price. The request was not sent.` };
  const estimateUsd = range.highUsd;
  const estimateInr = bufferedInr(estimateUsd);
  const capInr = benchmarkRunCapInr();
  if (estimateInr > capInr) {
    return {
      ok: false as const,
      message: `This comparison is about ₹${estimateInr.toFixed(2)}, above the ₹${capInr.toFixed(0)} run cap. It was not sent.`,
    };
  }
  const [outW, outH] = size.split("x").map((part) => Number(part));
  if (id === "fal-ai/bytedance/seedream/v4/edit" && outW * outH < 921_600) {
    return { ok: false as const, message: `${id} needs an output of at least 921,600 pixels. The request was not sent.` };
  }
  const lowInr = exactInr(range.lowUsd);
  const highInr = exactInr(range.highUsd);
  const rangeText = lowInr === highInr ? `about ₹${highInr.toFixed(2)}` : `₹${lowInr.toFixed(2)}–₹${highInr.toFixed(2)}`;
  return {
    ok: true as const,
    provider: "fal" as const,
    model: row.id,
    quality: "edit",
    size,
    outputFormat: "png" as const,
    inputFidelity: null,
    n: 1 as const,
    estimateUsd,
    estimateInr,
    capInr,
    outputTokens: 0,
    outputUsd: range.highUsd,
    imageInputTokens: 0,
    imageInputUsd: 0,
    textInputTokens: 0,
    textInputUsd: 0,
    inputSizeMode: "native" as const,
    rangeLowInr: lowInr,
    rangeHighInr: highInr,
    note: `Estimate ${rangeText} at FX 96 before the 8% buffer. The figure used for the ₹${capInr.toFixed(0)} cap is the higher end with that buffer (₹${estimateInr.toFixed(2)}). ${range.detail} fal does not report token usage, so a finished call is billed at this estimate. Not an invoice.`,
  };
}

export function falAspectRatio(size: EditSize) {
  if (size === "1024x1536") return "2:3";
  if (size === "1536x1024") return "3:2";
  return "1:1";
}

/** JSON body for one edit. image_urls is selfie then the hairstyle reference. Seed, mask, and guidance are omitted. */
export function buildFalEditBody(id: string, args: { prompt: string; selfieUrl: string; referenceUrl: string; size: EditSize }) {
  const row = falModel(id);
  if (!row) return null;
  if (row.maxInputs > 0 && row.maxInputs < 2) return null;
  const [width, height] = args.size.split("x").map((part) => Number(part));
  const body: Record<string, unknown> = {
    prompt: args.prompt,
    image_urls: [args.selfieUrl, args.referenceUrl],
    num_images: 1,
  };
  if (row.sizeMode === "aspect_ratio") body.aspect_ratio = falAspectRatio(args.size);
  else body.image_size = { width, height };
  if (row.id === "fal-ai/bytedance/seedream/v4/edit") body.max_images = 1;
  if (row.safetyChecker) body.enable_safety_checker = true;
  if (row.id !== "fal-ai/bytedance/seedream/v4/edit") body.output_format = "png";
  return body;
}
