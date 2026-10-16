import sharp from "sharp";

/**
 * Drop a flat edge strip, such as the grey bars a fixed canvas adds around a 3:4 photo.
 * A strip counts only when it is quiet and the pixels just inside it are not.
 */
export async function cropLetterbox(image: Buffer) {
  const decoded = await sharp(image, { failOn: "none" }).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = decoded.info.width;
  const height = decoded.info.height;
  const data = decoded.data;
  if (!width || !height) return image;

  const stats = (axis: "row" | "col", index: number) => {
    const count = axis === "row" ? width : height;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const step = Math.max(1, Math.floor(count / 48));
    for (let i = 0; i < count; i += step) {
      const x = axis === "row" ? i : index;
      const y = axis === "row" ? index : i;
      const p = (y * width + x) * 3;
      r += data[p];
      g += data[p + 1];
      b += data[p + 2];
      n += 1;
    }
    const mr = r / n;
    const mg = g / n;
    const mb = b / n;
    let vary = 0;
    for (let i = 0; i < count; i += step) {
      const x = axis === "row" ? i : index;
      const y = axis === "row" ? index : i;
      const p = (y * width + x) * 3;
      vary += Math.abs(data[p] - mr) + Math.abs(data[p + 1] - mg) + Math.abs(data[p + 2] - mb);
    }
    return { mean: (mr + mg + mb) / 3, vary: vary / n };
  };

  const edge = (axis: "row" | "col", fromStart: boolean) => {
    const limit = axis === "row" ? height : width;
    const first = stats(axis, fromStart ? 0 : limit - 1);
    if (first.vary > 14) return 0;
    let thickness = 0;
    for (let i = 0; i < limit * 0.22; i += 1) {
      const index = fromStart ? i : limit - 1 - i;
      const row = stats(axis, index);
      if (row.vary > 14 || Math.abs(row.mean - first.mean) > 18) break;
      thickness = i + 1;
    }
    if (thickness < 8) return 0;
    const inside = stats(axis, fromStart ? thickness : limit - 1 - thickness);
    if (inside.vary < first.vary * 2.5 + 8) return 0;
    return thickness;
  };

  const top = edge("row", true);
  const bottom = edge("row", false);
  const left = edge("col", true);
  const right = edge("col", false);
  if (!top && !bottom && !left && !right) return image;
  const cropWidth = width - left - right;
  const cropHeight = height - top - bottom;
  if (cropWidth < width * 0.7 || cropHeight < height * 0.7) return image;
  return sharp(data, { raw: { width, height, channels: 3 } })
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();
}
