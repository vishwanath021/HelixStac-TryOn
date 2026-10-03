import sharp from "sharp";

const MAX_BYTES = 2 * 1024 * 1024;

export class ImageError extends Error {
  constructor(public code: "TYPE" | "SIZE" | "DECODE" | "DIMENSIONS") {
    super(code);
  }
}

export function sniffImage(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Re-encode to JPEG. Sharp's rotate() applies orientation and the re-encode drops EXIF. */
export async function sanitizeSelfie(input: Buffer) {
  if (input.length > MAX_BYTES) throw new ImageError("SIZE");
  if (!sniffImage(input)) throw new ImageError("TYPE");
  try {
    const pipeline = sharp(input, { failOn: "none", animated: false }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) throw new ImageError("DECODE");
    if (meta.width < 64 || meta.height < 64 || meta.width > 8000 || meta.height > 8000) throw new ImageError("DIMENSIONS");
    const jpeg = await pipeline
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return jpeg;
  } catch (error) {
    if (error instanceof ImageError) throw error;
    throw new ImageError("DECODE");
  }
}
