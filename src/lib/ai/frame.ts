import sharp from "sharp";
import type { EditSize } from "@/lib/ai/edit-request";

export type FrameTransform = {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  contentWidth: number;
  contentHeight: number;
  offsetX: number;
  offsetY: number;
  scale: number;
};

export function parseEditSize(size: EditSize) {
  const [width, height] = size.split("x").map((part) => Number(part));
  return { width, height };
}

/**
 * Fit the photo inside a supported edit size. The scale is uniform.
 * Bars use the border colour. The transform maps the padded canvas back to the source rectangle.
 */
export async function fitInsideCanvas(image: Buffer, size: EditSize): Promise<{ png: Buffer; transform: FrameTransform }> {
  const target = parseEditSize(size);
  const decoded = await sharp(image, { failOn: "none" }).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sourceWidth = decoded.info.width;
  const sourceHeight = decoded.info.height;
  const scale = Math.min(target.width / sourceWidth, target.height / sourceHeight);
  const contentWidth = Math.max(1, Math.round(sourceWidth * scale));
  const contentHeight = Math.max(1, Math.round(sourceHeight * scale));
  const offsetX = Math.floor((target.width - contentWidth) / 2);
  const offsetY = Math.floor((target.height - contentHeight) / 2);
  const resized = await sharp(decoded.data, { raw: { width: sourceWidth, height: sourceHeight, channels: 3 } })
    .resize(contentWidth, contentHeight, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const border = borderMean(decoded.data, sourceWidth, sourceHeight);
  const canvas = Buffer.alloc(target.width * target.height * 3);
  for (let i = 0; i < target.width * target.height; i += 1) {
    canvas[i * 3] = border.r;
    canvas[i * 3 + 1] = border.g;
    canvas[i * 3 + 2] = border.b;
  }
  for (let y = 0; y < contentHeight; y += 1) {
    resized.copy(canvas, ((y + offsetY) * target.width + offsetX) * 3, y * contentWidth * 3, (y + 1) * contentWidth * 3);
  }
  const png = await sharp(canvas, { raw: { width: target.width, height: target.height, channels: 3 } }).png().toBuffer();
  return {
    png,
    transform: {
      sourceWidth,
      sourceHeight,
      targetWidth: target.width,
      targetHeight: target.height,
      contentWidth,
      contentHeight,
      offsetX,
      offsetY,
      scale,
    },
  };
}

function borderMean(rgb: Buffer, width: number, height: number) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 3;
    r += rgb[i];
    g += rgb[i + 1];
    b += rgb[i + 2];
    n += 1;
  };
  for (let x = 0; x < width; x += 1) {
    add(x, 0);
    if (height > 1) add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(0, y);
    if (width > 1) add(width - 1, y);
  }
  if (!n) return { r: 0, g: 0, b: 0 };
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

/** Crop the recorded content window. This is not the provider response. */
export async function restoreFrame(image: Buffer, transform: FrameTransform) {
  const meta = await sharp(image, { failOn: "none" }).rotate().metadata();
  const width = meta.width || transform.targetWidth;
  const height = meta.height || transform.targetHeight;
  const scaleX = width / transform.targetWidth;
  const scaleY = height / transform.targetHeight;
  const left = Math.max(0, Math.round(transform.offsetX * scaleX));
  const top = Math.max(0, Math.round(transform.offsetY * scaleY));
  const boxWidth = Math.max(1, Math.min(width - left, Math.round(transform.contentWidth * scaleX)));
  const boxHeight = Math.max(1, Math.min(height - top, Math.round(transform.contentHeight * scaleY)));
  return sharp(image, { failOn: "none" })
    .rotate()
    .extract({ left, top, width: boxWidth, height: boxHeight })
    .png()
    .toBuffer();
}
