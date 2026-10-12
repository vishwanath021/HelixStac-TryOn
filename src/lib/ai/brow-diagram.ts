import sharp from "sharp";
import { browDiagramSvg } from "@/data/brow-shapes";

/** 512 JPEG of the brow diagram. This is image 2 for a brow preview. */
export async function browDiagramJpeg(id: string) {
  const svg = browDiagramSvg(id);
  if (!svg) return null;
  return sharp(Buffer.from(svg)).resize(512, 512).jpeg({ quality: 90 }).toBuffer();
}
