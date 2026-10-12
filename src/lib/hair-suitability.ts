import { z } from "zod";
import { styleById, type FaceShape, type HairDensity, type HairTexture } from "@/data/styles";

export const DENSITIES = ["thin", "medium", "thick"] as const;
export const TEXTURES = ["straight", "wavy", "curly"] as const;
export const FACE_SHAPES = ["oval", "round", "square", "heart", "oblong", "diamond"] as const;

const densitySchema = z.enum(DENSITIES);
const textureSchema = z.enum(TEXTURES);
const faceSchema = z.enum(FACE_SHAPES);

export const hairReadingSchema = z.object({
  density: densitySchema,
  texture: textureSchema,
  hairline: z.enum(["low", "medium", "high", "receding"]),
  faceShape: faceSchema,
  confidence: z.number().min(0).max(1),
});

export type HairReading = z.infer<typeof hairReadingSchema>;

const overrideSchema = z.object({
  density: z.array(densitySchema).min(1).max(2),
  texture: z.array(textureSchema).min(1).max(2),
  faceShapes: z.array(faceSchema).max(6).optional(),
});

export type SuitabilityOverride = z.infer<typeof overrideSchema>;

export type TaggedStyle = {
  id: string;
  name: string;
  density: HairDensity[];
  texture: HairTexture[];
  faceShapes: FaceShape[];
  serviceKeys?: string[];
};

export function parseSuitability(raw: string): SuitabilityOverride | null {
  if (!raw) return null;
  try {
    const parsed = overrideSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function applySuitability<T extends TaggedStyle>(style: T, raw: string): T {
  const parsed = parseSuitability(raw);
  if (!parsed) return style;
  return {
    ...style,
    density: parsed.density,
    texture: parsed.texture,
    faceShapes: parsed.faceShapes ?? style.faceShapes,
  };
}

function sameSet(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const seen = new Set(right);
  return left.every((item) => seen.has(item));
}

/** Empty string keeps the catalog seed. A saved JSON string is the salon's override. */
export function suitabilityJsonFor(styleId: string, tags: SuitabilityOverride) {
  const seed = styleById(styleId);
  if (!seed) return "";
  const faces = tags.faceShapes ?? seed.faceShapes;
  const same = sameSet(tags.density, seed.density) && sameSet(tags.texture, seed.texture) && sameSet(faces, seed.faceShapes);
  if (same) return "";
  return JSON.stringify({ density: tags.density, texture: tags.texture, faceShapes: faces });
}

export function styleMatchesHair(style: { density: readonly string[]; texture: readonly string[] }, pick: { density?: string; texture?: string }) {
  if (pick.density && !style.density.includes(pick.density)) return false;
  if (pick.texture && !style.texture.includes(pick.texture)) return false;
  return true;
}

/** Matching photos first. Show all keeps the rest of the menu after them. */
export function orderStylesForPicker<T extends { name: string; density: readonly string[]; texture: readonly string[] }>(
  styles: T[],
  pick: { density: string; texture: string },
  showAll: boolean,
) {
  const active = Boolean(pick.density || pick.texture);
  if (!active) return styles;
  const matches: T[] = [];
  const rest: T[] = [];
  for (const style of styles) {
    if (styleMatchesHair(style, pick)) matches.push(style);
    else rest.push(style);
  }
  return showAll ? [...matches, ...rest] : matches;
}

export function suitabilityReason(density: HairDensity, texture: HairTexture, matched: { density: boolean; texture: boolean }) {
  if (matched.density && matched.texture) return `Suits ${density} ${texture} hair`;
  if (matched.texture) return `Suits ${texture} hair`;
  return `Suits ${density} hair`;
}

export type StyleSuggestion<T> = {
  style: T;
  reason: string;
};

/** Map a structured hair reading onto tagged menu photos. Three to five when the menu has them. */
export function suggestStyles<T extends TaggedStyle>(styles: T[], reading: Pick<HairReading, "density" | "texture" | "faceShape">, limit = 5): StyleSuggestion<T>[] {
  const cap = Math.min(5, Math.max(1, limit));
  const ranked = styles
    .map((style) => {
      const density = style.density.includes(reading.density);
      const texture = style.texture.includes(reading.texture);
      const face = style.faceShapes.includes(reading.faceShape);
      const score = (density ? 2 : 0) + (texture ? 2 : 0) + (face ? 1 : 0);
      return { style, score, density, texture };
    })
    .filter((row) => row.density || row.texture)
    .sort((a, b) => b.score - a.score || a.style.name.localeCompare(b.style.name));
  const both = ranked.filter((row) => row.density && row.texture);
  const picked = (both.length >= 3 ? both : ranked).slice(0, cap);
  return picked.map((row) => ({
    style: row.style,
    reason: suitabilityReason(reading.density, reading.texture, { density: row.density, texture: row.texture }),
  }));
}
