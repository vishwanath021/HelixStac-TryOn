import sharp from "sharp";
import { readStyleThumbnail, type ThumbFolder } from "@/lib/ai/style-reference";

export const DEMO_STYLE_BANNER = "Demo mode: connect an AI key to see this style on your own face";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char);
}

async function referenceCard(styleId: string, styleName: string, folder: ThumbFolder) {
  const cardW = 236;
  const cardH = 292;
  const thumb = readStyleThumbnail(styleId, folder);
  const photo = thumb
    ? await sharp(thumb).resize(204, 204, { fit: "cover" }).jpeg().toBuffer()
    : null;
  const title = escapeXml((styleName || styleId || "Style").slice(0, 28));
  const svg = Buffer.from(`<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${cardW}" height="${cardH}" rx="18" fill="#f4f1ec"/>
    <rect x="1" y="1" width="${cardW - 2}" height="${cardH - 2}" rx="17" fill="none" stroke="#e4ddd4" stroke-width="2"/>
    ${photo ? "" : `<text x="${cardW / 2}" y="128" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#3a342e">${title}</text>`}
    <text x="${cardW / 2}" y="248" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="700" fill="#241c16">Style preview</text>
    <text x="${cardW / 2}" y="270" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#6b625b">${title}</text>
  </svg>`);
  if (!photo) return sharp(svg).png().toBuffer();
  return sharp(svg)
    .composite([{ input: photo, top: 16, left: 16 }])
    .png()
    .toBuffer();
}

/** Guest photo, with the chosen style's portrait in a labelled card. Not a flat colour block. */
export async function demoStyleComposite(userJpeg: Buffer, styleId: string, styleName: string, folder: ThumbFolder = "styles") {
  const width = 768;
  const height = 1024;
  const base = await sharp(userJpeg).rotate().resize(width, height, { fit: "cover" }).jpeg({ quality: 86 }).toBuffer();
  const card = await referenceCard(styleId, styleName, folder);
  const place = folder === "nails" ? "hand" : "face";
  const banner = Buffer.from(`<svg width="${width}" height="96" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="96" fill="#241c16"/>
    <text x="28" y="40" font-family="sans-serif" font-size="20" fill="#fffdfb">Demo mode: connect an AI key</text>
    <text x="28" y="70" font-family="sans-serif" font-size="20" fill="#fffdfb">to see this style on your own ${place}</text>
  </svg>`);
  return sharp(base)
    .composite([
      { input: card, top: 28, left: width - 236 - 28 },
      { input: banner, top: height - 96, left: 0 },
    ])
    .jpeg({ quality: 84 })
    .toBuffer();
}
