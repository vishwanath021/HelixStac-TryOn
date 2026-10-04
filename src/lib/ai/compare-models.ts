import path from "node:path";
import sharp from "sharp";
import { styleById } from "@/data/styles";
import { benchmarkQuality, benchmarkQuoteNote, benchmarkRunCapInr, quoteModelEdit } from "@/lib/ai/benchmark";
import { imageEditModel, planImageEdit, type EditQuality } from "@/lib/ai/edit-request";
import { fitInsideCanvas } from "@/lib/ai/frame";
import { parseAskedTexture, selectReferenceVariant, type AskedTexture } from "@/lib/ai/reference-texture";
import { existingHairstyleFiles, hairstyleReferenceFile, readHairstyleReference } from "@/lib/ai/style-reference";
import { buildReferencePrompt } from "@/lib/prompts";
import { bufferedInr, usdFromTokenCounts } from "@/lib/ai/tiers";

/**
 * Explicit comparison catalogue. Match the full id. Do not accept a prefix or a substring.
 * Gemini is not an OpenAI image-edit model and is not in IMAGE_EDIT_MODELS.
 *
 * gpt-image-2: https://developers.openai.com/api/docs/guides/image-prompting (4 Oct 2026)
 * says omit input_fidelity. Image inputs are always high fidelity.
 * gemini-3.1-flash-image is the stable image model (Nano Banana 2), preferred over the lite id.
 */
export const COMPARISON_MODELS = [
  {
    id: "gpt-image-1.5",
    provider: "openai" as const,
    label: "gpt-image-1.5",
  },
  {
    id: "gpt-image-2",
    provider: "openai" as const,
    label: "gpt-image-2",
  },
  {
    id: "gemini-3.1-flash-image",
    provider: "gemini" as const,
    label: "gemini-3.1-flash-image",
  },
] as const;

export type ComparisonProvider = (typeof COMPARISON_MODELS)[number]["provider"];

/** Documented input-image and 1K output size for gemini-3.1-flash-image. */
export const GEMINI_IMAGE_TOKENS = 1120;
const GEMINI_TEXT_ALLOWANCE = 400;

export function comparisonChoices() {
  return COMPARISON_MODELS.map((row) => ({ id: row.id, label: row.label, provider: row.provider }));
}

export function comparisonModel(id: string) {
  return COMPARISON_MODELS.find((row) => row.id === id) ?? null;
}

function quoteGemini(modelId: string) {
  const textIn = GEMINI_TEXT_ALLOWANCE;
  const imageIn = GEMINI_IMAGE_TOKENS * 2;
  const output = GEMINI_IMAGE_TOKENS;
  const estimateUsd = usdFromTokenCounts(modelId, { textIn, imageIn, output });
  if (estimateUsd == null) {
    return { ok: false as const, message: `No token rates for ${modelId}. The request was not sent.` };
  }
  const estimateInr = bufferedInr(estimateUsd);
  const capInr = benchmarkRunCapInr();
  if (estimateInr > capInr) {
    return {
      ok: false as const,
      message: `This comparison is about ₹${estimateInr.toFixed(2)}, above the ₹${capInr.toFixed(0)} run cap. It was not sent.`,
    };
  }
  const outputUsd = usdFromTokenCounts(modelId, { textIn: 0, imageIn: 0, output }) ?? 0;
  const imageInputUsd = usdFromTokenCounts(modelId, { textIn: 0, imageIn, output: 0 }) ?? 0;
  const textInputUsd = usdFromTokenCounts(modelId, { textIn, imageIn: 0, output: 0 }) ?? 0;
  return {
    ok: true as const,
    provider: "gemini" as const,
    model: modelId,
    quality: "1K",
    size: "1K",
    outputFormat: "png" as const,
    inputFidelity: null,
    n: 1 as const,
    estimateUsd,
    estimateInr,
    capInr,
    outputTokens: output,
    outputUsd,
    imageInputTokens: imageIn,
    imageInputUsd,
    textInputTokens: textIn,
    textInputUsd,
    inputSizeMode: "native" as const,
    note: "Estimate for this Gemini model only. Two input images at 1,120 tokens each, a 1K output at 1,120 tokens, and a text allowance. Not an invoice. This comparison does not call OpenAI.",
  };
}

export function quoteComparisonModel(modelId: string, width: number, height: number, reference = { width: 512, height: 512 }) {
  const row = comparisonModel(modelId);
  if (!row) {
    return { ok: false as const, message: `${modelId} is not a configured comparison model. No other model was substituted.` };
  }
  if (row.provider === "gemini") return quoteGemini(row.id);
  const caps = imageEditModel(row.id);
  if (!caps) {
    return { ok: false as const, message: `${row.id} has no image-edit capability row. No other model was substituted.` };
  }
  const inputFidelity = caps.inputFidelity?.includes("high") ? "high" as const : null;
  const note = inputFidelity
    ? benchmarkQuoteNote()
    : "Estimate, actual from provider usage. input_fidelity is omitted for this model. Image-input tokens use the 1536×1024 calibration with a 15% margin. Output tokens use the pre-gpt-image-2 guide table as an allowance, priced at this model's own rates. Not an invoice.";
  const quoted = quoteModelEdit({
    model: row.id,
    quality: benchmarkQuality(),
    width,
    height,
    reference,
    inputFidelity,
    note,
  });
  if (!quoted.ok) return quoted;
  return { ...quoted, provider: "openai" as const };
}

export async function prepareComparison(args: { jpeg: Buffer; styleId: string; colourName?: string; texture?: AskedTexture; modelId: string }) {
  const row = comparisonModel(args.modelId);
  if (!row) {
    return { ok: false as const, message: `${args.modelId} is not a configured comparison model. No other model was substituted.` };
  }
  const style = styleById(args.styleId);
  if (!style) return { ok: false as const, message: "That style is not in the catalogue." };
  const asked = parseAskedTexture(args.texture || "natural");
  const textureChoice = selectReferenceVariant({
    styleId: style.id,
    styleName: style.name,
    referenceTexture: style.referenceTexture,
    asked,
    files: existingHairstyleFiles(style.id),
  });
  const preferred = textureChoice.fileName === `${style.id}.jpg` ? undefined : textureChoice.fileName;
  const referencePath = hairstyleReferenceFile(style.id, "styles", preferred);
  const reference = referencePath ? readHairstyleReference(style.id, "styles", preferred) : null;
  if (!reference) {
    return {
      ok: false as const,
      message: `No reference image for ${style.id}. Add public/styles/${style.id}.jpg. Comparison mode does not fall back to a text-only edit.`,
    };
  }
  const selfieMeta = await sharp(args.jpeg, { failOn: "none" }).metadata();
  const referenceMeta = await sharp(reference, { failOn: "none" }).metadata();
  const width = selfieMeta.width || 0;
  const height = selfieMeta.height || 0;
  if (!width || !height) return { ok: false as const, message: "The selfie could not be read." };
  const quote = quoteComparisonModel(row.id, width, height, { width: referenceMeta.width || 512, height: referenceMeta.height || 512 });
  if (!quote.ok) return quote;
  const prompt = buildReferencePrompt(style, args.colourName, asked === "natural" ? undefined : asked);
  const shared = {
    style,
    quote,
    reference,
    referenceFile: referencePath ? path.basename(referencePath) : textureChoice.fileName,
    referenceWidth: referenceMeta.width || 0,
    referenceHeight: referenceMeta.height || 0,
    texture: asked,
    referenceTexture: textureChoice.referenceTexture,
    textureWarning: textureChoice.warning,
    prompt,
  };
  if (row.provider === "gemini") {
    const selfiePng = await sharp(args.jpeg, { failOn: "none" }).rotate().png().toBuffer();
    return { ok: true as const, provider: "gemini" as const, planned: null, selfiePng, fitted: null, ...shared };
  }
  const quality = quote.quality as EditQuality;
  const planned = planImageEdit({
    model: quote.model,
    prompt,
    quality,
    size: quote.size as "1024x1024" | "1024x1536" | "1536x1024",
    outputFormat: "png",
    inputFidelity: quote.inputFidelity,
    imageOrder: ["selfie.png", "style-reference.jpg"],
    mask: false,
  });
  if (!planned.ok) return planned;
  const fitted = await fitInsideCanvas(args.jpeg, planned.plan.size);
  return {
    ok: true as const,
    provider: "openai" as const,
    planned: planned.plan,
    selfiePng: fitted.png,
    fitted,
    ...shared,
  };
}
