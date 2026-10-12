import sharp from "sharp";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char);
}

/** Original illustration. It is not a photo and not an edit of a guest. */
export async function sampleCard(side: "BEFORE" | "AFTER", caption: string) {
  const hair = side === "AFTER" ? "#3a2418" : "#d7b48a";
  const hairPath =
    side === "AFTER"
      ? "M250 430 C270 240 500 240 520 430 C470 340 300 340 250 430"
      : "M280 410 C310 280 460 280 490 410 C450 340 320 340 280 410";
  const label = escapeXml(caption.slice(0, 42));
  const svg = Buffer.from(`<svg width="768" height="1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="768" height="1024" fill="#f6efe6"/>
    <ellipse cx="384" cy="470" rx="150" ry="180" fill="#e7c2a4"/>
    <path d="${hairPath}" fill="${hair}"/>
    <ellipse cx="330" cy="450" rx="16" ry="10" fill="none" stroke="#9a6b52" stroke-width="3"/>
    <ellipse cx="438" cy="450" rx="16" ry="10" fill="none" stroke="#9a6b52" stroke-width="3"/>
    <rect x="48" y="780" width="672" height="180" rx="24" fill="#241c16"/>
    <text x="384" y="850" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#fffdfb">SAMPLE ${side}</text>
    <text x="384" y="900" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#f3ece3">${label}</text>
    <text x="384" y="936" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#e7d7c8">Not a real hairstyle preview</text>
  </svg>`);
  return sharp(svg).jpeg({ quality: 82 }).toBuffer();
}
