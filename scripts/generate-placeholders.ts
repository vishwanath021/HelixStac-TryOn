import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
  <rect width="768" height="1024" fill="#e7d7c6"/>
  <rect x="0" y="620" width="768" height="404" fill="#cbb59f"/>
  <ellipse cx="384" cy="430" rx="150" ry="180" fill="#e4b894"/>
  <path d="M180 390c30-180 380-190 420 10 10 80-20 120-70 140 20 80-30 160-90 170-40-70-90-80-130-40-50 40-90-20-100-90-40 10-50-40-30-190z" fill="#3a241c"/>
  <circle cx="330" cy="430" r="8" fill="#241c16"/>
  <circle cx="438" cy="430" r="8" fill="#241c16"/>
  <path d="M350 500c20 16 48 16 68 0" fill="none" stroke="#8d5a48" stroke-width="6" stroke-linecap="round"/>
  <text x="384" y="960" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#241c16">Sample portrait · illustration</text>
</svg>`;

async function main() {
  await mkdir("public/samples", { recursive: true });
  await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toFile("public/samples/portrait.jpg");
  console.log("wrote public/samples/portrait.jpg");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
