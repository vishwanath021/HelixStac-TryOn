import sharp from "sharp";
import { bridalFinishById, bridalLipById, bridalMakeupById, type BridalMakeup } from "@/data/bridal";
import {
  OWN_LOOK_MAX_BYTES,
  OWN_LOOK_MAX_IMAGES,
  OWN_LOOK_MODEL,
  OWN_LOOK_QUALITY,
  OWN_LOOK_SLOTS,
  OWN_LOOK_THREE_BY_FOUR,
  ownLookItemEdge,
  ownLookSlot,
  type OwnLookSlotId,
} from "@/data/bridal-own";
import { estimateImageInputTokens, mediumOutputTokenAllowance } from "@/lib/ai/benchmark";
import { editFormFields, editSizeForAspect, planImageEdit, type EditSize, type PlannedEdit } from "@/lib/ai/edit-request";
import { fitInsideCanvas, restoreFrame, type FrameTransform } from "@/lib/ai/frame";
import { ImageError, sniffImage } from "@/lib/images";
import { numberEnv } from "@/lib/env";
import { bufferedInr, usdFromTokenCounts } from "@/lib/ai/tiers";

const TEXT_TOKEN_FLOOR = 400;
const CATALOGUE_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const satisfies readonly EditSize[];

export type OwnLookSize = EditSize | typeof OWN_LOOK_THREE_BY_FOUR;
export type OwnLookPlan = Omit<PlannedEdit, "size"> & { size: OwnLookSize };

/** 3:4 selfies ask for 1024x1360. Every other aspect uses a catalogue size. */
export function ownLookFrameSize(width: number, height: number): OwnLookSize {
  const ratio = width / Math.max(1, height);
  if (Math.abs(ratio - 0.75) <= 0.02) return OWN_LOOK_THREE_BY_FOUR;
  return editSizeForAspect(width, height, CATALOGUE_SIZES);
}

function catalogueSize(size: OwnLookSize): EditSize {
  return size === OWN_LOOK_THREE_BY_FOUR ? "1024x1536" : size;
}

/** 1024x1360 is not in the shared output table. Scale the portrait medium allowance by height. */
export function ownLookOutputTokens(size: OwnLookSize) {
  if (size === OWN_LOOK_THREE_BY_FOUR) {
    return Math.ceil(mediumOutputTokenAllowance("1024x1536") * (1360 / 1536));
  }
  return mediumOutputTokenAllowance(size);
}

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
  size: OwnLookSize;
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

function lookDetails(makeup: BridalMakeup) {
  const finish = bridalFinishById(makeup.finishId);
  const lip = bridalLipById(makeup.lipId);
  return [makeup.prompt, finish?.prompt || "", lip ? `Lip colour: ${lip.name}` : ""]
    .map((part) => part.replace(/\.$/, "").trim())
    .filter(Boolean)
    .join(". ");
}

/**
 * One portrait. Makeup is named before any clothing line so the edit keeps it.
 * Image 1 is her selfie. Each later image is the item it is. Hair is neat, with no flowers.
 */
export function buildOwnLookPrompt(makeup: BridalMakeup, slots: { id: OwnLookSlotId; noun: string }[]) {
  const clothing = slots.map((slot, index) => {
    const number = index + 2;
    return `Image ${number} is her ${slot.noun}. Copy that ${slot.noun} exactly onto her. Do not invent a different ${slot.noun}, and do not swap it for a catalogue piece.`;
  });
  const items = slots.length
    ? "Dress her in those exact photographed items and no other clothes or jewellery."
    : "She did not add item photos. Apply only the makeup. Do not invent a saree, blouse, or jewellery.";
  return [
    "Image 1 is the bride's own selfie. Keep this exact person. Do not copy a face from any later image.",
    `Apply clearly visible bridal makeup: ${lookDetails(makeup)}.`,
    ...clothing,
    items,
    "Make one photo of her wearing that look.",
    "Style her hair neatly for a bride, as a smooth bun or a braid.",
    "Do not put flowers in her hair. No jasmine, marigold, gajra, or rose braid.",
    "Do not change face shape or features; makeup changes colour and finish only.",
    "Keep any nose pin already in her photo.",
    "Telugu bridal styling: silk drape, a round bindi, and the jewellery from her own photos when she added them.",
    "A portrait, photorealistic, with natural light. No text, logos, watermarks, or extra people.",
    "This is a salon trial preview, not a guarantee of the finished makeup.",
  ].filter(Boolean).join(" ");
}

export function planOwnLook(makeupId: string, slotIds: string[], size: OwnLookSize = "1024x1536") {
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
    size: catalogueSize(size),
    outputFormat: "jpeg",
    inputFidelity: null,
    imageOrder,
    mask: false,
  });
  if (!planned.ok) return planned;
  const plan: OwnLookPlan = { ...planned.plan, size };
  return { ok: true as const, makeup, ordered, prompt, plan };
}

/** Fields posted to the image edit. input_fidelity is omitted for this model. Size is the selfie frame, including 1024x1360. */
export function ownLookForm(plan: OwnLookPlan, images: { name: string; jpeg: Buffer }[]) {
  const fields = editFormFields({ ...plan, size: catalogueSize(plan.size) });
  fields.size = plan.size;
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

export function quoteOwnLook(args: { prompt: string; selfiePixels: number; itemPixels: number[]; size: OwnLookSize }): { ok: true; quote: OwnLookQuote } | { ok: false; message: string } {
  const imageCount = 1 + args.itemPixels.length;
  if (imageCount > OWN_LOOK_MAX_IMAGES) {
    return { ok: false, message: "Too many photos for one preview." };
  }
  const inputPixels = Math.max(1, args.selfiePixels) + args.itemPixels.reduce((sum, pixels) => sum + Math.max(1, pixels), 0);
  const imageInputTokens = estimateImageInputTokens(inputPixels, 0);
  const outputTokens = ownLookOutputTokens(args.size);
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
      size: args.size,
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
  transform: FrameTransform;
  items: { id: OwnLookSlotId; jpeg: Buffer; pixels: number }[];
  prompt: string;
  plan: OwnLookPlan;
  quote: OwnLookQuote;
};

/** Oriented selfie dimensions, then a canvas that matches that aspect. */
export async function frameOwnLookSelfie(input: Buffer) {
  if (input.length > OWN_LOOK_MAX_BYTES) throw new ImageError("SIZE");
  if (!sniffImage(input)) throw new ImageError("TYPE");
  let width = 0;
  let height = 0;
  try {
    const oriented = await sharp(input, { failOn: "none", animated: false }).rotate().toBuffer({ resolveWithObject: true });
    width = oriented.info.width;
    height = oriented.info.height;
  } catch {
    throw new ImageError("DECODE");
  }
  if (!width || !height) throw new ImageError("DECODE");
  if (width < 64 || height < 64 || width > 8000 || height > 8000) throw new ImageError("DIMENSIONS");
  const size = ownLookFrameSize(width, height);
  const fitted = await fitInsideCanvas(input, size);
  const jpeg = await sharp(fitted.png).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  const sized = await sharp(jpeg).metadata();
  const outWidth = sized.width || size.split("x").map(Number)[0];
  const outHeight = sized.height || size.split("x").map(Number)[1];
  return { jpeg, width: outWidth, height: outHeight, pixels: outWidth * outHeight, size, transform: fitted.transform };
}

export async function prepareOwnLook(args: { selfie: Buffer; items: { id: string; bytes: Buffer }[]; makeupId: string }) {
  const selfie = await frameOwnLookSelfie(args.selfie);
  const planned = planOwnLook(args.makeupId, args.items.map((item) => item.id), selfie.size);
  if (!planned.ok) throw new OwnLookError(planned.message.startsWith("Choose") ? "MAKEUP" : "ITEM", planned.message);
  const items = [];
  for (const slot of planned.ordered) {
    const source = args.items.find((item) => item.id === slot.id);
    if (!source) throw new OwnLookError("ITEM", "That item photo was missing.");
    const shrunk = await shrinkOwnLookJpeg(source.bytes, ownLookItemEdge(slot.id));
    items.push({ id: slot.id, jpeg: shrunk.jpeg, pixels: shrunk.pixels });
  }
  const quoted = quoteOwnLook({
    prompt: planned.prompt,
    selfiePixels: selfie.pixels,
    itemPixels: items.map((item) => item.pixels),
    size: selfie.size,
  });
  if (!quoted.ok) {
    console.info(`[bridal-own] cost estimate refused. ${quoted.message}`);
    throw new OwnLookError(quoted.message.includes("cap") ? "CAP" : "QUOTE", quoted.message);
  }
  return {
    selfie: selfie.jpeg,
    selfiePixels: selfie.pixels,
    transform: selfie.transform,
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
    const restored = await restoreFrame(image, prepared.transform);
    return { image: restored, quote: prepared.quote, keys };
  } finally {
    await Promise.all(keys.map((key) => args.remove(key).catch(() => undefined)));
  }
}
