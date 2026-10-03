import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { STYLES } from "../src/data/styles";
import { generateWithFailover } from "../src/lib/ai/router";
import { aiProviderName } from "../src/lib/env";
import { spendSummary } from "../src/lib/ai/spend";
import { prisma } from "../src/lib/prisma";

const inputDir = path.resolve(process.argv[2] || "ai-samples");
const count = Math.max(1, Number(process.argv[3] || process.env.AI_SMOKE_N || 3));
const outDir = path.resolve("ai-smoke/out");

function photosIn(dir: string) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
    .map((name) => path.join(dir, name));
}

async function main() {
  const photos = photosIn(inputDir);
  if (!photos.length) {
    console.error(`Put JPEG, PNG, or WebP files in ${inputDir} (gitignored) and run npm run ai:smoke.`);
    process.exit(1);
  }
  const styles = STYLES.slice(0, count);
  fs.mkdirSync(outDir, { recursive: true });
  const before = await spendSummary();
  console.log(`Provider: ${aiProviderName()}`);
  console.log(`Spend so far: ₹${before.spentInr.toFixed(2)} of ₹${before.capInr.toFixed(0)} (${before.calls} charged calls).`);
  console.log(`Running ${styles.length} styles on ${photos.length} photo(s). Outputs: ${outDir}`);
  let paid = 0;
  let samples = 0;
  for (const photo of photos) {
    const jpeg = await sharp(fs.readFileSync(photo)).rotate().resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
    const base = path.basename(photo, path.extname(photo));
    for (const style of styles) {
      const result = await generateWithFailover({
        image: jpeg,
        styleId: style.id,
        gender: style.gender,
        prompt: style.prompt,
        tenantId: "ai-smoke",
        quality: "standard",
        kind: "style",
      });
      const file = path.join(outDir, `${base}-${style.id}.jpg`);
      fs.writeFileSync(file, result.image);
      const estimate = result.estimateInr ?? 0;
      if (result.demoReason === "spend-cap" || result.demoReason === "no-key") samples += 1;
      else paid += estimate;
      console.log(`${path.basename(file)}  ${result.provider}  ₹${estimate.toFixed(2)}  ${result.demoReason || "paid"}`);
    }
  }
  const after = await spendSummary();
  console.log(`This run paid estimate: ₹${paid.toFixed(2)}. Sample fallbacks: ${samples}.`);
  console.log(`Cumulative estimate: ₹${after.spentInr.toFixed(2)} of ₹${after.capInr.toFixed(0)}.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
