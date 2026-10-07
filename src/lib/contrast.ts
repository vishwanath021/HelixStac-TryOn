const LIGHT = "#fffaf6";
const INK = "#241c16";

function normalize(hex: string) {
  const raw = hex.trim().replace("#", "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw.split("").map((char) => char + char).join("").toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return "#c4622d";
}

function channel(hex: string, index: number) {
  return Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

function linear(value: number) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const color = normalize(hex);
  return 0.2126 * linear(channel(color, 0)) + 0.7152 * linear(channel(color, 1)) + 0.0722 * linear(channel(color, 2));
}

export function contrastRatio(a: string, b: string) {
  const left = luminance(a);
  const right = luminance(b);
  const hi = Math.max(left, right);
  const lo = Math.min(left, right);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(from: string, toward: string, amount: number) {
  const parts = [0, 1, 2].map((index) => Math.round(channel(from, index) + (channel(toward, index) - channel(from, index)) * amount));
  return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function shiftUntil(brand: string, toward: string, ink: string) {
  if (contrastRatio(brand, ink) >= 4.5) return { background: brand, shift: 0 };
  let lo = 0;
  let hi = 1;
  let background = mix(brand, toward, 1);
  for (let step = 0; step < 20; step += 1) {
    const mid = (lo + hi) / 2;
    const next = mix(brand, toward, mid);
    if (contrastRatio(next, ink) >= 4.5) {
      background = next;
      hi = mid;
    } else lo = mid;
  }
  if (contrastRatio(background, ink) < 4.5) background = mix(brand, toward, 1);
  return { background, shift: hi };
}

/** Button fill and text that meet WCAG AA (4.5:1) for any salon hex. */
export function brandButtonColors(brand: string) {
  const background = normalize(brand);
  if (contrastRatio(background, LIGHT) >= 4.5) return { background, color: LIGHT };
  if (contrastRatio(background, INK) >= 4.5) return { background, color: INK };
  const darker = shiftUntil(background, "#000000", LIGHT);
  const lighter = shiftUntil(background, "#ffffff", INK);
  return darker.shift <= lighter.shift
    ? { background: darker.background, color: LIGHT }
    : { background: lighter.background, color: INK };
}

export function brandStyle(primary: string, accent?: string) {
  const button = brandButtonColors(primary);
  return {
    ["--brand" as string]: normalize(primary),
    ["--accent" as string]: accent ? normalize(accent) : "#241c16",
    ["--brand-btn" as string]: button.background,
    ["--on-brand" as string]: button.color,
  };
}
