import sharp from "sharp";
import type { GenerateInput, GenerateOutput, ImageStyleProvider } from "@/lib/ai/types";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char);
}

export class MockProvider implements ImageStyleProvider {
  name = "mock";

  async health() {
    return true;
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const started = Date.now();
    const delay = Number(process.env.MOCK_DELAY_MS ?? 900);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const base = await sharp(input.image, { failOn: "none" })
      .rotate()
      .resize(768, 1024, { fit: "cover" })
      .jpeg()
      .toBuffer();
    const tint = input.kind === "nails" ? "#9a3040" : input.kind === "beard" ? "#3a2418" : input.kind === "brows" ? "#4a3428" : input.colour ? "#8d4b32" : "#6b3a2a";
    const label = escapeXml(input.prompt.split(".").slice(0, 1).join("").slice(0, 72));
    const mark =
      input.kind === "brows"
        ? `<path d="M210 340 C260 300 330 300 370 336" fill="none" stroke="${tint}" stroke-width="10" stroke-linecap="round"/>
         <path d="M400 336 C440 300 510 300 560 340" fill="none" stroke="${tint}" stroke-width="10" stroke-linecap="round"/>`
        : input.kind === "beard"
          ? `<path d="M250 560 C300 620 468 620 518 560 C480 640 290 640 250 560" fill="${tint}" fill-opacity="0.55"/>`
          : input.kind === "nails"
            ? `<rect x="180" y="700" width="408" height="36" rx="10" fill="${tint}" fill-opacity="0.8"/>`
            : `<rect x="0" y="0" width="768" height="300" fill="${tint}" fill-opacity="0.38"/>`;
    const svg = Buffer.from(`<svg width="768" height="1024" xmlns="http://www.w3.org/2000/svg">
      ${mark}
      <rect x="48" y="860" width="672" height="120" rx="16" fill="#241c16" fill-opacity="0.88"/>
      <text x="384" y="915" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#fffdfb">DEMO</text>
      <text x="384" y="952" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#f3ece3">${label}</text>
    </svg>`);
    const image = await sharp(base).composite([{ input: svg }]).jpeg({ quality: 82 }).toBuffer();
    return { image, mime: "image/jpeg", provider: this.name, providerCostUsd: 0, latencyMs: Date.now() - started };
  }
}
