/**
 * Upright live-look fixtures from the synthetic catalogue already in this repo.
 * public/styles portraits are generated for Lookuvi, not customer photos and not web downloads.
 * Run: node scripts/build-live-fixtures.mjs
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outDir = path.join(process.cwd(), "tests/fixtures/live");
const jobs = [
  ["public/styles/sleek-straight.jpg", "woman-long-dark.jpg"],
  ["public/styles/bro-flow.jpg", "man-beard-dark.jpg"],
];

await mkdir(outDir, { recursive: true });
for (const [source, name] of jobs) {
  const dest = path.join(outDir, name);
  await sharp(path.join(process.cwd(), source))
    .rotate()
    .resize(768, 1024, { fit: "cover", position: "centre" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(dest);
  const meta = await sharp(dest).metadata();
  console.log(`${name} ${meta.width}x${meta.height} from ${source}`);
}
