/**
 * Explicit image-edit capabilities. Do not infer support from a substring of the model id.
 *
 * Sources checked 4 Oct 2026:
 * - https://developers.openai.com/api/docs/models/gpt-image-1.5
 * - https://developers.openai.com/api/docs/guides/image-generation
 *
 * The guide says `input_fidelity` controls how strongly an edit keeps the input, and that
 * `gpt-image-2` must omit it. It does not say `gpt-image-1.5` must omit it. Mini is omitted
 * because the Images edit reference for that snapshot does not accept the parameter.
 * Prices below are the published per-image output table. Input tokens are extra and are not
 * included. They are list prices, not invoices.
 */

export type EditQuality = "low" | "medium" | "high";
export type EditSize = "1024x1024" | "1024x1536" | "1536x1024";
export type EditFormat = "png" | "jpeg" | "webp";

export type ImageEditCaps = {
  id: string;
  qualities: readonly EditQuality[];
  sizes: readonly EditSize[];
  outputFormats: readonly EditFormat[];
  /** Null means the parameter must not be sent. */
  inputFidelity: readonly ("high" | "low")[] | null;
  /** Published output price in USD for one image. Null when this table has no cell. Input tokens are extra. */
  outputUsd: Partial<Record<EditQuality, Partial<Record<EditSize, number>>>>;
};

const SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;
const QUALITIES = ["low", "medium", "high"] as const;
const FORMATS = ["png", "jpeg", "webp"] as const;

function cells(low: number, medium: number, high: number, portrait: { low: number; medium: number; high: number }): ImageEditCaps["outputUsd"] {
  return {
    low: { "1024x1024": low, "1024x1536": portrait.low, "1536x1024": portrait.low },
    medium: { "1024x1024": medium, "1024x1536": portrait.medium, "1536x1024": portrait.medium },
    high: { "1024x1024": high, "1024x1536": portrait.high, "1536x1024": portrait.high },
  };
}

export const IMAGE_EDIT_MODELS: Record<string, ImageEditCaps> = {
  "gpt-image-1-mini": {
    id: "gpt-image-1-mini",
    qualities: QUALITIES,
    sizes: SIZES,
    outputFormats: FORMATS,
    inputFidelity: null,
    outputUsd: cells(0.005, 0.011, 0.036, { low: 0.006, medium: 0.015, high: 0.052 }),
  },
  "gpt-image-1": {
    id: "gpt-image-1",
    qualities: QUALITIES,
    sizes: SIZES,
    outputFormats: FORMATS,
    inputFidelity: ["high", "low"],
    outputUsd: cells(0.011, 0.042, 0.167, { low: 0.016, medium: 0.063, high: 0.25 }),
  },
  "gpt-image-1.5": {
    id: "gpt-image-1.5",
    qualities: QUALITIES,
    sizes: SIZES,
    outputFormats: FORMATS,
    inputFidelity: ["high", "low"],
    outputUsd: cells(0.009, 0.034, 0.133, { low: 0.013, medium: 0.05, high: 0.2 }),
  },
  "gpt-image-2": {
    id: "gpt-image-2",
    qualities: QUALITIES,
    sizes: SIZES,
    outputFormats: FORMATS,
    inputFidelity: null,
    outputUsd: cells(0.006, 0.053, 0.211, { low: 0.005, medium: 0.041, high: 0.165 }),
  },
};

export const BENCHMARK_MODEL = "gpt-image-1.5";
export const BENCHMARK_QUALITY: EditQuality = "medium";
export const FORBIDDEN_EDIT_FIELDS = ["seed", "strength", "guidance", "guidance_scale"] as const;

export function imageEditModel(id: string): ImageEditCaps | null {
  return IMAGE_EDIT_MODELS[id] ?? null;
}

export type PlannedEdit = {
  model: string;
  prompt: string;
  quality: EditQuality;
  size: EditSize;
  outputFormat: EditFormat;
  n: 1;
  inputFidelity: "high" | "low" | null;
  imageOrder: string[];
  mask: boolean;
};

export function editSizeForAspect(width: number, height: number, allowed: readonly EditSize[]): EditSize {
  const ratio = width / Math.max(1, height);
  if (ratio > 1.15 && allowed.includes("1536x1024")) return "1536x1024";
  if (ratio < 1 / 1.15 && allowed.includes("1024x1536")) return "1024x1536";
  if (allowed.includes("1024x1024")) return "1024x1024";
  return allowed[0];
}

export function planImageEdit(args: {
  model: string;
  prompt: string;
  quality: EditQuality;
  size: EditSize;
  outputFormat: EditFormat;
  inputFidelity: "high" | "low" | null;
  imageOrder: string[];
  mask: boolean;
}): { ok: true; plan: PlannedEdit } | { ok: false; message: string } {
  const caps = imageEditModel(args.model);
  if (!caps) {
    return { ok: false, message: `${args.model} is not a configured image-edit model. No other model was substituted.` };
  }
  if (!caps.qualities.includes(args.quality)) {
    return { ok: false, message: `${args.model} does not support quality ${args.quality}.` };
  }
  if (!caps.sizes.includes(args.size)) {
    return { ok: false, message: `${args.model} does not support size ${args.size}.` };
  }
  if (!caps.outputFormats.includes(args.outputFormat)) {
    return { ok: false, message: `${args.model} does not support output format ${args.outputFormat}.` };
  }
  if (args.inputFidelity && !caps.inputFidelity) {
    return { ok: false, message: `${args.model} does not accept input_fidelity. The request was not sent.` };
  }
  if (args.inputFidelity && caps.inputFidelity && !caps.inputFidelity.includes(args.inputFidelity)) {
    return { ok: false, message: `${args.model} does not accept input_fidelity=${args.inputFidelity}.` };
  }
  if (args.imageOrder.length < 1) return { ok: false, message: "An image edit needs the selfie as the first image." };
  return {
    ok: true,
    plan: {
      model: caps.id,
      prompt: args.prompt,
      quality: args.quality,
      size: args.size,
      outputFormat: args.outputFormat,
      n: 1,
      inputFidelity: args.inputFidelity,
      imageOrder: args.imageOrder,
      mask: args.mask,
    },
  };
}

/** Fields that will be posted. Forbidden parameters are never included. */
export function editFormFields(plan: PlannedEdit): Record<string, string> {
  const fields: Record<string, string> = {
    model: plan.model,
    prompt: plan.prompt.slice(0, 32000),
    quality: plan.quality,
    size: plan.size,
    output_format: plan.outputFormat,
    n: "1",
  };
  if (plan.inputFidelity) fields.input_fidelity = plan.inputFidelity;
  for (const name of FORBIDDEN_EDIT_FIELDS) {
    if (name in fields) delete fields[name];
  }
  return fields;
}

export function outputListUsd(model: string, quality: EditQuality, size: EditSize): number | null {
  const caps = imageEditModel(model);
  return caps?.outputUsd[quality]?.[size] ?? null;
}
