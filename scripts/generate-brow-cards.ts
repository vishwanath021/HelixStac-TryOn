/**
 * One-off brow card photos.
 *
 * Draws one Indian woman and one Indian man, then edits only the brows so every
 * card of that person shares the face, lighting, and crop. Men's catalogue types
 * use the man. Women and unisex types use the woman. The edit uses BROW_CARD_CUES,
 * which exaggerate each shape for a small card. Guest try-on keeps brow.prompt.
 *
 *   OPENAI_API_KEY=... npm run brows:cards
 *
 * Model: gpt-image-2.5-sunburst, quality low, 1024×1024. Spend stops before ₹40
 * (FX_INR_PER_USD, default 96). A missing key exits before any request.
 * Existing public/brows/cards/<id>.webp files are skipped unless BROW_CARDS_FORCE=1.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { BROWS, type BrowDef } from "../src/data/brows";
import { BROW_CARD_CUES } from "../src/data/brow-cards";
import { costUsdFromUsage, type UsageNumbers } from "../src/lib/ai/tiers";

const MODEL = "gpt-image-2.5-sunburst";
const QUALITY = "low";
const SIZE = "1024x1024";
const CAP_INR = 40;
const FX = Number(process.env.FX_INR_PER_USD || 96);
const RESERVE_USD = 0.025;
const OUT_DIR = path.join(process.cwd(), "public", "brows", "cards");
const LIST_FILE = path.join(process.cwd(), "src", "data", "brow-cards.ts");

const WOMAN = [
  "Photoreal square close-up of one Indian woman in her late twenties.",
  "Crop from just above the eyebrows to just under the eyes, both eyes looking straight at the camera.",
  "Even soft daylight, plain warm-grey background, no jewellery, no eye makeup, visible skin texture.",
  "Natural dark brown-black eyebrows with a low soft arch.",
  "No text and no watermark.",
].join(" ");

const MAN = [
  "Photoreal square close-up of one Indian man in his early thirties.",
  "Crop from just above the eyebrows to just under the eyes, both eyes looking straight at the camera.",
  "Even soft daylight, plain warm-grey background, no glasses, short dark hair at the edge of the frame, visible skin texture.",
  "Natural dark brown-black eyebrows, short and nearly straight.",
  "No text and no watermark.",
].join(" ");

function modelFor(brow: BrowDef) {
  return brow.audience === "men" ? "man" : "woman";
}

function editPrompt(brow: BrowDef) {
  const cue = BROW_CARD_CUES[brow.id];
  if (!cue) throw new Error(`No card cue for ${brow.id}. No image was requested.`);
  return [
    "Change only the eyebrows of this same person.",
    "Keep the face, identity, eyes, skin, hair, lighting, crop, and plain background identical.",
    "Exaggerate this brow shape so a customer can tell it apart at thumbnail size. Keep the brows a natural dark brown-black.",
    cue,
  ].join(" ");
}

function inr(usd: number) {
  return Math.round(usd * FX * 100) / 100;
}

type ImagePayload = {
  data?: { b64_json?: string }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { text_tokens?: number; image_tokens?: number };
  };
};

function usageOf(payload: ImagePayload): UsageNumbers | undefined {
  const usage = payload.usage;
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
    textTokens: usage.input_tokens_details?.text_tokens,
    imageTokens: usage.input_tokens_details?.image_tokens,
  };
}

async function cardWebp(jpeg: Buffer) {
  const resized = await sharp(jpeg).resize(512, 512, { fit: "cover", position: "centre" }).toBuffer();
  let quality = 70;
  let out = await sharp(resized).webp({ quality }).toBuffer();
  while (out.length > 60 * 1024 && quality > 42) {
    quality -= 4;
    out = await sharp(resized).webp({ quality }).toBuffer();
  }
  while (out.length < 30 * 1024 && quality < 90) {
    const nextQuality = quality + 4;
    const next = await sharp(resized).webp({ quality: nextQuality }).toBuffer();
    if (next.length > 60 * 1024) break;
    quality = nextQuality;
    out = next;
  }
  return out;
}

function writePhotoList(ids: string[]) {
  const body = ids.map((id) => `  "${id}",`).join("\n");
  const source = readFileSync(LIST_FILE, "utf8");
  const next = source.replace(
    /export const BROW_CARD_PHOTO_IDS: readonly string\[\] = \[[\s\S]*?\];/,
    `export const BROW_CARD_PHOTO_IDS: readonly string[] = [\n${body}\n];`,
  );
  if (next === source) throw new Error("Could not update BROW_CARD_PHOTO_IDS.");
  writeFileSync(LIST_FILE, next);
}

async function postJson(apiKey: string, prompt: string) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, n: 1, size: SIZE, quality: QUALITY, output_format: "jpeg" }),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`generation failed (${response.status}) ${text.slice(0, 180).replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")}`);
  }
  return JSON.parse(text) as ImagePayload;
}

async function postEdit(apiKey: string, prompt: string, jpeg: Buffer) {
  const form = new FormData();
  form.set("model", MODEL);
  form.set("prompt", prompt);
  form.set("quality", QUALITY);
  form.set("size", SIZE);
  form.set("output_format", "jpeg");
  form.set("n", "1");
  form.append("image[]", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "base.jpg");
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`edit failed (${response.status}) ${text.slice(0, 180).replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")}`);
  }
  return JSON.parse(text) as ImagePayload;
}

function jpegFrom(payload: ImagePayload) {
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) throw new Error("The provider returned no image. No further call was made.");
  return Buffer.from(b64, "base64");
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const force = process.env.BROW_CARDS_FORCE === "1";
  const apiKey = process.env.OPENAI_API_KEY || "";
  console.log(`model ${MODEL} quality ${QUALITY} size ${SIZE} cap ₹${CAP_INR} fx ${FX}`);
  for (const brow of BROWS) {
    console.log(`${brow.id} (${modelFor(brow)}): ${editPrompt(brow)}`);
  }
  if (dry) {
    console.log("Dry run. No image was requested.");
    return;
  }
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set. No image was requested. Diagrams stay on the cards until you run: OPENAI_API_KEY=... npm run brows:cards");
    process.exitCode = 1;
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  let spentUsd = 0;
  const written: string[] = [];
  const bases = new Map<string, Buffer>();

  async function charge(payload: ImagePayload, label: string) {
    const usd = costUsdFromUsage(MODEL, usageOf(payload));
    const add = usd == null ? RESERVE_USD : usd;
    spentUsd += add;
    console.log(`${label} +$${add.toFixed(4)} running ₹${inr(spentUsd)}${usd == null ? " (usage missing, reserved)" : ""}`);
  }

  function roomForAnother() {
    return (spentUsd + RESERVE_USD) * FX <= CAP_INR;
  }

  async function baseFor(who: "woman" | "man") {
    const cached = bases.get(who);
    if (cached) return cached;
    if (!roomForAnother()) {
      console.log(`Stopped before the ${who} base. Running spend ₹${inr(spentUsd)} would pass ₹${CAP_INR}.`);
      return null;
    }
    const payload = await postJson(apiKey, who === "woman" ? WOMAN : MAN);
    await charge(payload, `${who} base`);
    const jpeg = jpegFrom(payload);
    bases.set(who, jpeg);
    return jpeg;
  }

  for (const brow of BROWS) {
    const file = path.join(OUT_DIR, `${brow.id}.webp`);
    if (!force && existsSync(file)) {
      written.push(brow.id);
      console.log(`${brow.id} already exists, skipped`);
      continue;
    }
    if (!roomForAnother()) {
      console.log(`Stopped before ${brow.id}. Running spend ₹${inr(spentUsd)} would pass ₹${CAP_INR}.`);
      break;
    }
    const who = modelFor(brow);
    const base = await baseFor(who);
    if (!base) break;
    if (!roomForAnother()) {
      console.log(`Stopped before the ${brow.id} edit. Running spend ₹${inr(spentUsd)} would pass ₹${CAP_INR}.`);
      break;
    }
    const payload = await postEdit(apiKey, editPrompt(brow), base);
    await charge(payload, brow.id);
    const webp = await cardWebp(jpegFrom(payload));
    writeFileSync(file, webp);
    written.push(brow.id);
    console.log(`wrote ${path.relative(process.cwd(), file)} ${webp.length} bytes`);
  }

  const ordered = BROWS.map((brow) => brow.id).filter((id) => written.includes(id) && existsSync(path.join(OUT_DIR, `${id}.webp`)));
  writePhotoList(ordered);
  console.log(`TOTAL_INR ${inr(spentUsd)}`);
  console.log(`cards ${ordered.length}/${BROWS.length}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Brow card generation failed.";
  console.error(message);
  process.exit(1);
});
