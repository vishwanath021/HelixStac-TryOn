/**
 * One-time bridal catalogue photos.
 * Uses FAL_KEY (fal-ai/flux/dev) or OPENAI_API_KEY (gpt-image-1).
 * Writes public/bridal/{id}.webp. Does not draw icons.
 *
 *   node scripts/generate-bridal-thumbs.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const LOOKS = [
  ["telugu-muhurtham", "medium wheatish South Indian skin", "Telugu bride, full jasmine-rose poola jada braid with gold jada billalu, HD full-coverage base, gold-copper eyeshadow, thick kohl, berry lip, round red bindi, nethichutti, temple gold necklace, red-green pattu saree"],
  ["telugu-jasmine-bun", "warm medium brown skin", "South Indian bride, low round bun wrapped in jasmine, gold shimmer lids, kohl, classic red matte lip, red bindi, gold maang tikka, jhumkas, Kanjeevaram saree"],
  ["tamil-kanjeevaram", "deep brown skin", "Tamil bride, long braid with jasmine strands, dramatic kohl top and bottom, gold eyes, maroon lip, red bindi, nethichutti, temple jewellery, kanjeevaram silk"],
  ["kerala-kasavu", "light brown Indian skin", "Kerala bride, jasmine bun, dewy natural skin, kohl-lined eyes, nude-pink lip, small bindi, gold-bordered off-white kasavu saree, palakka necklace"],
  ["punjabi-glam", "warm medium brown skin", "Punjabi bride, sleek updo under red embroidered dupatta, glittery gold eyes, winged liner, false lashes, red lip, dewy highlight, large maang tikka, big nath with chain"],
  ["bengali-chandan", "medium wheatish skin", "Bengali bride, red bindi with white chandan dot pattern on forehead, winged liner, gold-red eyeshadow, red lip, dewy skin, white shola topor, red Benarasi saree"],
  ["marathi-nauvari", "medium brown skin", "Maharashtrian bride, bun with mogra gajra, pearl mundavalya across forehead, crescent bindi, kohl, soft gold eyes, crimson lip, Maharashtrian nath, Paithani nauvari saree"],
  ["gujarati-panetar", "wheatish medium skin", "Gujarati bride, neat bun, bold kohl and shimmer eyes, deep red lip, kundan maang tikka and choker, white-red panetar saree in seedha pallu drape"],
  ["nikah-kohl", "deep warm brown skin", "Muslim bride for nikah, side-swept hair with jhoomar passa, dark smudged kohl eyes, strong highlighter, dewy skin, rose-nude lip, heavy embroidered dupatta, velvet outfit"],
  ["christian-gown", "medium brown skin", "Christian bride, soft half-up curls, long white veil with tiara, luminous light base, soft brown smoky eye, peach blush, pink lip, white lace gown, diamond studs"],
  ["engagement-soft-glam", "light medium brown skin", "Indian bride at engagement, voluminous soft waves, dewy HD base, champagne shimmer eyes, nude-pink gloss lip, diamond earrings, pastel lehenga"],
  ["haldi-fresh", "warm medium brown skin", "Indian bride at haldi, messy side braid with yellow marigold flowers, no-makeup dewy skin, tinted lips, floral jewellery, yellow outfit"],
  ["mehendi-boho", "deep brown skin", "Indian bride at mehendi, loose braid with mixed flowers, warm bronze eyes, coral lip, floral maang tikka and earrings, green lehenga"],
  ["sangeet-smokey", "medium wheatish skin", "Indian bride at sangeet, glam open curls, black-bronze smokey eye with glitter, sculpted contour, nude-brown matte lip, statement earrings, sequinned lehenga"],
  ["reception-luxe", "deep warm brown skin", "Indian bride at reception, sleek low bun with accessory, flawless airbrush matte base, cut-crease eyes, wine lip, diamond necklace set, embellished saree gown"],
];

function promptFor(skin, look) {
  return `Photorealistic portrait photograph of one Indian woman, ${skin}, facing the camera, shoulders up, natural window light, wedding portrait. ${look}. No text, no watermark, no collage, no extra people.`;
}

async function falImage(prompt, key) {
  const submit = await fetch("https://queue.fal.run/fal-ai/flux/dev", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_size: "portrait_4_3", num_images: 1, enable_safety_checker: true }),
  });
  if (!submit.ok) throw new Error(`fal submit ${submit.status}`);
  const queued = await submit.json();
  const statusUrl = queued.status_url;
  const responseUrl = queued.response_url;
  if (!statusUrl || !responseUrl) throw new Error("fal did not return a queue url");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const status = await fetch(statusUrl, { headers: { Authorization: `Key ${key}` } });
    const body = await status.json();
    if (body.status === "COMPLETED") break;
    if (body.status === "FAILED") throw new Error("fal failed");
  }
  const done = await fetch(responseUrl, { headers: { Authorization: `Key ${key}` } });
  if (!done.ok) throw new Error(`fal result ${done.status}`);
  const payload = await done.json();
  const url = payload.images?.[0]?.url;
  if (!url) throw new Error("fal returned no image");
  const image = await fetch(url);
  if (!image.ok) throw new Error("fal image download failed");
  return Buffer.from(await image.arrayBuffer());
}

async function openaiImage(prompt, key) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1536", n: 1 }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const payload = await res.json();
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) throw new Error("openai returned no image");
  return Buffer.from(b64, "base64");
}

async function main() {
  const fal = process.env.FAL_KEY || "";
  const openai = process.env.OPENAI_API_KEY || "";
  if (!fal && !openai) {
    console.error("Bridal thumbnails were not generated.");
    console.error("Set FAL_KEY or OPENAI_API_KEY (the same keys as AI settings) and run: node scripts/generate-bridal-thumbs.mjs");
    console.error("Until public/bridal/{id}.webp exists, the guest sees a photo-less name card. Do not commit icons.");
    process.exitCode = 1;
    return;
  }
  const out = path.join(process.cwd(), "public", "bridal");
  await mkdir(out, { recursive: true });
  for (const [id, skin, look] of LOOKS) {
    const prompt = promptFor(skin, look);
    const raw = fal ? await falImage(prompt, fal) : await openaiImage(prompt, openai);
    const webp = await sharp(raw).resize(768, 1024, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
    await writeFile(path.join(out, `${id}.webp`), webp);
    console.log(`wrote public/bridal/${id}.webp`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
