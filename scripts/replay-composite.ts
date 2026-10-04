import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { composeHairOnly } from "@/lib/face/compose-hair";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function contactSheet(panels: { label: string; image: Buffer }[]) {
  const targetHeight = 640;
  const framed: Buffer[] = [];
  for (const panel of panels) {
    const resized = await sharp(panel.image, { failOn: "none" }).rotate().resize({ height: targetHeight, fit: "inside" }).png().toBuffer();
    const meta = await sharp(resized).metadata();
    const width = meta.width || 1;
    const height = meta.height || targetHeight;
    const labelHeight = 40;
    const svg = Buffer.from(
      `<svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#14110e"/><text x="50%" y="26" text-anchor="middle" fill="#ffffff" font-size="18" font-family="sans-serif">${panel.label.replace(/[<>&]/g, "")}</text></svg>`,
    );
    framed.push(
      await sharp({ create: { width, height: height + labelHeight, channels: 3, background: "#14110e" } })
        .composite([
          { input: svg, top: 0, left: 0 },
          { input: resized, top: labelHeight, left: 0 },
        ])
        .png()
        .toBuffer(),
    );
  }
  const metas = await Promise.all(framed.map(async (image) => sharp(image).metadata()));
  const height = Math.max(...metas.map((meta) => meta.height || 0));
  const padded = await Promise.all(
    framed.map(async (image, index) => {
      const width = metas[index].width || 1;
      const current = metas[index].height || height;
      if (current === height) return image;
      return sharp({ create: { width, height, channels: 3, background: "#14110e" } })
        .composite([{ input: image, top: 0, left: 0 }])
        .png()
        .toBuffer();
    }),
  );
  const widths = await Promise.all(padded.map(async (image) => (await sharp(image).metadata()).width || 0));
  const total = widths.reduce((sum, width) => sum + width, 0);
  let left = 0;
  const layers = padded.map((image, index) => {
    const layer = { input: image, top: 0, left };
    left += widths[index];
    return layer;
  });
  return sharp({ create: { width: total, height, channels: 3, background: "#14110e" } }).composite(layers).png().toBuffer();
}

async function main() {
  const originalPath = arg("--original");
  const rawPath = arg("--raw");
  const outDir = arg("--out");
  const label = arg("--label") || "replay";
  if (!originalPath || !rawPath || !outDir) {
    console.error("Usage: tsx scripts/replay-composite.ts --original selfie --raw generated --out dir [--label name]");
    process.exit(1);
  }
  const original = await readFile(originalPath);
  const raw = await readFile(rawPath);
  await mkdir(outDir, { recursive: true });
  const result = await composeHairOnly(original, raw);
  await writeFile(path.join(outDir, "mask-overlay.png"), result.overlayPng);
  await writeFile(path.join(outDir, "hair-composite.png"), result.compositePng);
  await writeFile(path.join(outDir, "aligned-output.png"), result.alignedPng);
  const sheet = await contactSheet([
    { label: "Original", image: original },
    { label: "Raw", image: raw },
    { label: "Mask overlay", image: result.overlayPng },
    { label: "Composite", image: result.compositePng },
  ]);
  const sheetPath = path.join(outDir, "contact.png");
  await writeFile(sheetPath, sheet);
  const report = {
    label,
    rawFaceDrift: result.rawDrift,
    compositeFaceDrift: result.compositeDrift,
    compositeLandmarksDetected: result.compositeLandmarksDetected,
    wallBandDelta: result.wallBandDelta,
    contact: sheetPath,
    note: "Offline replay. No provider call. The composite is not the raw provider output.",
  };
  await writeFile(path.join(outDir, "validation.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
