import sharp from "sharp";
import { bridalFinishById, bridalLipById, bridalMakeupById, type BridalMakeup } from "@/data/bridal";
import {
  OWN_LOOK_ITEM_EDGE,
  OWN_LOOK_MAX_BYTES,
  OWN_LOOK_MAX_IMAGES,
  OWN_LOOK_MODEL,
  OWN_LOOK_QUALITY,
  OWN_LOOK_SELFIE_EDGE,
  OWN_LOOK_SIZE,
  OWN_LOOK_SLOTS,
  ownLookSlot,
  type OwnLookSlotId,
} from "@/data/bridal-own";
import { estimateImageInputTokens, mediumOutputTokenAllowance } from "@/lib/ai/benchmark";
import { editFormFields, planImageEdit, type PlannedEdit } from "@/lib/ai/edit-request";
import { ImageError, sniffImage } from "@/lib/images";
import { numberEnv } from "@/lib/env";
import { bufferedInr, usdFromTokenCounts } from "@/lib/ai/tiers";

const TEXT_TOKEN_FLOOR = 400;

export class OwnLookError extends Error {
  constructor(
    readonly code: "MAKEUP" | "ITEM" | "QUOTE" | "CAP",
    message: string,
  ) {
    super(message);
    this.name = "OwnLookError";
  }
}

export type OwnLookQuote = {
  model: typeof OWN_LOOK_MODEL;
  quality: typeof OWN_LOOK_QUALITY;
  size: typeof OWN_LOOK_SIZE;
  imageCount: number;
  inputPixels: number;
  imageInputTokens: number;
  outputTokens: number;
  textInputTokens: number;
  estimateUsd: number;
  estimateInr: number;
};

/** Item photos live outside the public media prefixes. The media route refuses this key. */
export function ownLookItemKey(tenantId: string, requestId: string, slotId: string) {
  const tenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  const request = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return `bridal-own/${tenant || "salon"}/${request || "look"}/${slotId}.jpg`;
}

/** Signed media is only for finished previews and benchmarks. Item photos are not in either prefix. */
export function isPublicMediaKey(key: string) {
  return key.startsWith("generations/") || key.startsWith("benchmarks/");
}

export function ownLookCapInr() {
  return Math.max(0, numberEnv("OWN_LOOK_CAP_INR", 30));
}

/**
 * One portrait. Image 1 is her selfie. Each later image is named as the item it is.
 * The face stays hers. The items are copied. Telugu bridal styling, and no flowers in the hair.
 */
export function buildOwnLookPrompt(makeup: BridalMakeup, slots: { id: OwnLookSlotId; noun: string }[]) {
  const finish = bridalFinishById(makeup.finishId);
  const lip = bridalLipById(makeup.lipId);
  const labels = [
    "Image 1 is the bride's own selfie. Keep this exact person. Do not copy a face from any later image.",
  ];
  slots.forEach((slot, index) => {
    const number = index + 2;
    labels.push(
      `Image ${number} is her ${slot.noun}. Copy that ${slot.noun} exactly onto her. Do not invent a different ${slot.noun}, and do not swap it for a catalogue piece.`,
    );
  });
  const items = slots.length
    ? "Dress her in those exact photographed items and no other clothes or jewellery."
    : "She did not add item photos. Apply only the makeup. Do not invent a saree, blouse, or jewellery.";
  return [
    labels.join(" "),
    items,
    "Make one photo of her wearing that look.",
    makeup.prompt,
    finish?.prompt || "",
    lip ? `Lip colour: ${lip.name}.` : "",
    "Telugu bridal styling: silk drape, a round bindi, and the jewellery from her own photos when she added them.",
    "Keep her exact face. Keep the exact face shape, jaw, cheeks, nose, eyes, skin texture, pores, and age. Do not slim, lift, smooth, or beautify the face.",
    "Do not put flowers in her hair. No jasmine, marigold, gajra, or rose braid.",
    "A portrait, photorealistic, with natural light. No text, logos, watermarks, or extra people.",
    "This is a salon trial preview, not a guarantee of the finished makeup.",
  ].filter(Boolean).join(" ");
}

export function planOwnLook(makeupId: string, slotIds: string[]) {
  const makeup = bridalMakeupById(makeupId);
  if (!makeup) return { ok: false as const, message: "Choose a bridal makeup look." };
  if (slotIds.length > OWN_LOOK_SLOTS.length) {
    return { ok: false as const, message: "Too many item photos. Remove one and try again." };
  }
  const chosen: { id: OwnLookSlotId; noun: string; label: string }[] = [];
  for (const id of slotIds) {
    const slot = ownLookSlot(id);
    if (!slot) return { ok: false as const, message: "That item is not on the list." };
    if (chosen.some((item) => item.id === slot.id)) {
      return { ok: false as const, message: "Each item can be added once." };
    }
    chosen.push(slot);
  }
  const ordered = OWN_LOOK_SLOTS.filter((slot) => chosen.some((item) => item.id === slot.id));
  const prompt = buildOwnLookPrompt(makeup, ordered.map((slot) => ({ id: slot.id, noun: slot.noun })));
  const imageOrder = ["selfie.jpg", ...ordered.map((slot) => `${slot.id}.jpg`)];
  if (imageOrder.length > OWN_LOOK_MAX_IMAGES) {
    return { ok: false as const, message: "Too many photos for one preview." };
  }
  const planned = planImageEdit({
    model: OWN_LOOK_MODEL,
    prompt,
    quality: OWN_LOOK_QUALITY,
    size: OWN_LOOK_SIZE,
    outputFormat: "jpeg",
    inputFidelity: null,
    imageOrder,
    mask: false,
  });
  if (!planned.ok) return planned;
  return { ok: true as const, makeup, ordered, prompt, plan: planned.plan };
}

/** Fields posted to the image edit. input_fidelity is omitted for this model. */
export function ownLookForm(plan: PlannedEdit, images: { name: string; jpeg: Buffer }[]) {
  const fields = editFormFields(plan);
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  for (const image of images) {
    form.append("image[]", new Blob([new Uint8Array(image.jpeg)], { type: "image/jpeg" }), image.name);
  }
  return form;
}

export async function shrinkOwnLookJpeg(input: Buffer, longEdge: number) {
  if (input.length > OWN_LOOK_MAX_BYTES) throw new ImageError("SIZE");
  if (!sniffImage(input)) throw new ImageError("TYPE");
  try {
    const pipeline = sharp(input, { failOn: "none", animated: false }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) throw new ImageError("DECODE");
    if (meta.width < 64 || meta.height < 64 || meta.width > 8000 || meta.height > 8000) throw new ImageError("DIMENSIONS");
    const jpeg = await pipeline
      .resize({ width: longEdge, height: longEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    const sized = await sharp(jpeg).metadata();
    const width = sized.width || 1;
    const height = sized.height || 1;
    return { jpeg, width, height, pixels: width * height };
  } catch (error) {
    if (error instanceof ImageError) throw error;
    throw new ImageError("DECODE");
  }
}

export function quoteOwnLook(args: { prompt: string; selfiePixels: number; itemPixels: number[] }): { ok: true; quote: OwnLookQuote } | { ok: false; message: string } {
  const imageCount = 1 + args.itemPixels.length;
  if (imageCount > OWN_LOOK_MAX_IMAGES) {
    return { ok: false, message: "Too many photos for one preview." };
  }
  const inputPixels = Math.max(1, args.selfiePixels) + args.itemPixels.reduce((sum, pixels) => sum + Math.max(1, pixels), 0);
  const imageInputTokens = estimateImageInputTokens(inputPixels, 0);
  const outputTokens = mediumOutputTokenAllowance(OWN_LOOK_SIZE);
  const textInputTokens = Math.max(TEXT_TOKEN_FLOOR, Math.ceil(args.prompt.length / 4));
  const estimateUsd = usdFromTokenCounts(OWN_LOOK_MODEL, { textIn: textInputTokens, imageIn: imageInputTokens, output: outputTokens });
  if (estimateUsd == null) {
    return { ok: false, message: `No token rates for ${OWN_LOOK_MODEL}. The request was not sent.` };
  }
  const estimateInr = bufferedInr(estimateUsd);
  const capInr = ownLookCapInr();
  if (estimateInr > capInr) {
    return {
      ok: false,
      message: `This look is about ₹${estimateInr.toFixed(2)}, above the ₹${capInr.toFixed(0)} cap. It was not sent.`,
    };
  }
  return {
    ok: true,
    quote: {
      model: OWN_LOOK_MODEL,
      quality: OWN_LOOK_QUALITY,
      size: OWN_LOOK_SIZE,
      imageCount,
      inputPixels,
      imageInputTokens,
      outputTokens,
      textInputTokens,
      estimateUsd,
      estimateInr,
    },
  };
}

/** Log fields. Names stay off the redaction list so the rupee figure is visible. */
export function ownLookEstimateMeta(quote: OwnLookQuote, salonId: string) {
  return {
    provider: "openai",
    model: quote.model,
    quality: quote.quality,
    size: quote.size,
    count: quote.imageCount,
    estimateUsd: quote.estimateUsd,
    estimateInr: quote.estimateInr,
    salonId,
  };
}

export function logOwnLookEstimate(quote: OwnLookQuote, salonId: string) {
  const meta = ownLookEstimateMeta(quote, salonId);
  console.info(
    `[bridal-own] cost estimate $${meta.estimateUsd.toFixed(4)} (~₹${meta.estimateInr.toFixed(2)}) ${meta.model} quality ${meta.quality} size ${meta.size} count ${meta.count}. Not an invoice.`,
  );
  return meta;
}

export type PreparedOwnLook = {
  selfie: Buffer;
  selfiePixels: number;
  items: { id: OwnLookSlotId; jpeg: Buffer; pixels: number }[];
  prompt: string;
  plan: PlannedEdit;
  quote: OwnLookQuote;
};

export async function prepareOwnLook(args: { selfie: Buffer; items: { id: string; bytes: Buffer }[]; makeupId: string }) {
  const planned = planOwnLook(args.makeupId, args.items.map((item) => item.id));
  if (!planned.ok) throw new OwnLookError(planned.message.startsWith("Choose") ? "MAKEUP" : "ITEM", planned.message);
  const selfie = await shrinkOwnLookJpeg(args.selfie, OWN_LOOK_SELFIE_EDGE);
  const items = [];
  for (const slot of planned.ordered) {
    const source = args.items.find((item) => item.id === slot.id);
    if (!source) throw new OwnLookError("ITEM", "That item photo was missing.");
    const shrunk = await shrinkOwnLookJpeg(source.bytes, OWN_LOOK_ITEM_EDGE);
    items.push({ id: slot.id, jpeg: shrunk.jpeg, pixels: shrunk.pixels });
  }
  const quoted = quoteOwnLook({
    prompt: planned.prompt,
    selfiePixels: selfie.pixels,
    itemPixels: items.map((item) => item.pixels),
  });
  if (!quoted.ok) {
    console.info(`[bridal-own] cost estimate refused. ${quoted.message}`);
    throw new OwnLookError(quoted.message.includes("cap") ? "CAP" : "QUOTE", quoted.message);
  }
  return {
    selfie: selfie.jpeg,
    selfiePixels: selfie.pixels,
    items,
    prompt: planned.prompt,
    plan: planned.plan,
    quote: quoted.quote,
  } satisfies PreparedOwnLook;
}

/**
 * Store each item photo on a private key, run one edit, then delete those keys.
 * The selfie is sent to the model and is not written to storage.
 */
export async function generateOwnLook(args: {
  selfie: Buffer;
  items: { id: string; bytes: Buffer }[];
  makeupId: string;
  tenantId: string;
  requestId: string;
  put: (key: string, body: Buffer) => Promise<void>;
  remove: (key: string) => Promise<void>;
  beforeEdit?: (quote: OwnLookQuote) => Promise<void>;
  edit: (form: FormData) => Promise<Buffer>;
}): Promise<{ image: Buffer; quote: OwnLookQuote; keys: string[] }> {
  const prepared = await prepareOwnLook(args);
  logOwnLookEstimate(prepared.quote, args.tenantId);
  const keys: string[] = [];
  try {
    for (const item of prepared.items) {
      const key = ownLookItemKey(args.tenantId, args.requestId, item.id);
      if (isPublicMediaKey(key)) throw new OwnLookError("ITEM", "Item photos are not stored on a public path.");
      await args.put(key, item.jpeg);
      keys.push(key);
    }
    if (args.beforeEdit) await args.beforeEdit(prepared.quote);
    const form = ownLookForm(prepared.plan, [
      { name: "selfie.jpg", jpeg: prepared.selfie },
      ...prepared.items.map((item) => ({ name: `${item.id}.jpg`, jpeg: item.jpeg })),
    ]);
    const image = await args.edit(form);
    return { image, quote: prepared.quote, keys };
  } finally {
    await Promise.all(keys.map((key) => args.remove(key).catch(() => undefined)));
  }
}
