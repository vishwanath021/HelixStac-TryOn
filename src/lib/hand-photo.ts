/** Cheap skin-region check. A clear portrait is rejected for nail try-on. Anything else is allowed. */

function skin(r: number, g: number, b: number) {
  return r > 90 && g > 40 && b > 20 && r > g && r > b && r - g > 12 && r - b > 12;
}

export function classifySkinPhoto(pixels: ArrayLike<number>, width: number, height: number, channels = 3): "face" | "hand" | "unclear" {
  if (width < 8 || height < 8 || channels < 3) return "unclear";
  let left = 0;
  let leftN = 0;
  let right = 0;
  let rightN = 0;
  let center = 0;
  let centerN = 0;
  const x0 = width * 0.15;
  const x1 = width * 0.85;
  const cx0 = width * 0.3;
  const cx1 = width * 0.7;
  const cy0 = height * 0.25;
  const cy1 = height * 0.8;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const hit = skin(pixels[i], pixels[i + 1], pixels[i + 2]) ? 1 : 0;
      if (x < x0) {
        left += hit;
        leftN += 1;
      } else if (x > x1) {
        right += hit;
        rightN += 1;
      }
      if (x > cx0 && x < cx1 && y > cy0 && y < cy1) {
        center += hit;
        centerN += 1;
      }
    }
  }
  const leftRatio = leftN ? left / leftN : 0;
  const rightRatio = rightN ? right / rightN : 0;
  const centerRatio = centerN ? center / centerN : 0;
  if (leftRatio > 0.22 && rightRatio > 0.22 && centerRatio > 0.18) return "hand";
  if (centerRatio > 0.38 && leftRatio < 0.12 && rightRatio < 0.12) return "face";
  return "unclear";
}
