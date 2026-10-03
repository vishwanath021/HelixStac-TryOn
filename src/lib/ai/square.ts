import sharp from "sharp";

export type SquarePad = {
  image: Buffer;
  mask?: Buffer;
  size: number;
  contentWidth: number;
  contentHeight: number;
  offsetX: number;
  offsetY: number;
};

/** Mean colour of the outer pixel ring. Used to fill the bars of a square canvas. */
export function borderFill(rgb: Buffer, width: number, height: number) {
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

/** Place raw RGB on a centered square. The content pixels are copied, not resampled. */
export function padRgb(rgb: Buffer, width: number, height: number) {
  const size = Math.max(width, height);
  const offsetX = Math.floor((size - width) / 2);
  const offsetY = Math.floor((size - height) / 2);
  const fill = borderFill(rgb, width, height);
  const data = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i += 1) {
    data[i * 3] = fill.r;
    data[i * 3 + 1] = fill.g;
    data[i * 3 + 2] = fill.b;
  }
  for (let y = 0; y < height; y += 1) {
    rgb.copy(data, ((y + offsetY) * size + offsetX) * 3, y * width * 3, (y + 1) * width * 3);
  }
  return { data, size, offsetX, offsetY, width, height };
}

/** Copy the centered content window back out of a square raw buffer. */
export function cropRgb(square: Buffer, size: number, offsetX: number, offsetY: number, width: number, height: number) {
  const out = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    square.copy(out, y * width * 3, ((y + offsetY) * size + offsetX) * 3, ((y + offsetY) * size + offsetX + width) * 3);
  }
  return out;
}

/**
 * Pad a photo, and its mask when present, onto one centered square.
 * Mask bars are opaque white so the provider treats them as "keep".
 */
export async function padImageAndMask(image: Buffer, mask?: Buffer): Promise<SquarePad> {
  const decoded = await sharp(image, { failOn: "none" }).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = decoded.info.width;
  const height = decoded.info.height;
  const placed = padRgb(decoded.data, width, height);
  const jpeg = await sharp(placed.data, { raw: { width: placed.size, height: placed.size, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  if (!mask) {
    return {
      image: jpeg,
      size: placed.size,
      contentWidth: width,
      contentHeight: height,
      offsetX: placed.offsetX,
      offsetY: placed.offsetY,
    };
  }
  const fitted = await sharp(mask, { failOn: "none" })
    .ensureAlpha()
    .resize(width, height, { fit: "fill", kernel: "nearest" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(placed.size * placed.size * 4, 255);
  const channels = fitted.info.channels;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * channels;
      const dst = ((y + placed.offsetY) * placed.size + (x + placed.offsetX)) * 4;
      rgba[dst] = fitted.data[src];
      rgba[dst + 1] = fitted.data[src + 1];
      rgba[dst + 2] = fitted.data[src + 2];
      rgba[dst + 3] = channels >= 4 ? fitted.data[src + 3] : 255;
    }
  }
  const maskPng = await sharp(rgba, { raw: { width: placed.size, height: placed.size, channels: 4 } }).png().toBuffer();
  return {
    image: jpeg,
    mask: maskPng,
    size: placed.size,
    contentWidth: width,
    contentHeight: height,
    offsetX: placed.offsetX,
    offsetY: placed.offsetY,
  };
}

/**
 * Map a provider image back to the pre-pad rectangle.
 * A square result is scaled uniformly onto the padded canvas, then the content window is cropped.
 * A result that already has the content aspect is scaled uniformly. Neither path stretches.
 */
export async function restoreSquareContent(image: Buffer, pad: Pick<SquarePad, "size" | "contentWidth" | "contentHeight" | "offsetX" | "offsetY">) {
  const meta = await sharp(image, { failOn: "none" }).rotate().metadata();
  const w = meta.width || pad.size;
  const h = meta.height || pad.size;
  const aspect = w / Math.max(1, h);
  const contentAspect = pad.contentWidth / Math.max(1, pad.contentHeight);
  if (Math.abs(aspect - contentAspect) <= 0.02) {
    return sharp(image, { failOn: "none" }).rotate().resize(pad.contentWidth, pad.contentHeight, { fit: "fill" }).jpeg({ quality: 90 }).toBuffer();
  }
  const raw = await sharp(image, { failOn: "none" })
    .rotate()
    .resize(pad.size, pad.size, { fit: "cover", position: "centre" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const cropped = cropRgb(raw, pad.size, pad.offsetX, pad.offsetY, pad.contentWidth, pad.contentHeight);
  return sharp(cropped, { raw: { width: pad.contentWidth, height: pad.contentHeight, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}
