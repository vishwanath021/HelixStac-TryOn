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
    const tint = input.colour ? "#8d4b32" : "#6b3a2a";
    const label = escapeXml(input.prompt.split(".").slice(0, 1).join("").slice(0, 72));
    const svg = Buffer.from(`<svg width="768" height="1024" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="768" height="300" fill="${tint}" fill-opacity="0.38"/>
      <rect x="48" y="860" width="672" height="120" rx="16" fill="#241c16" fill-opacity="0.88"/>
      <text x="384" y="915" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#fffdfb">DEMO</text>
      <text x="384" y="952" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#f3ece3">${label}</text>
    </svg>`);
    const image = await sharp(base).composite([{ input: svg }]).jpeg({ quality: 82 }).toBuffer();
    return { image, mime: "image/jpeg", provider: this.name, providerCostUsd: 0, latencyMs: Date.now() - started };
  }
}
