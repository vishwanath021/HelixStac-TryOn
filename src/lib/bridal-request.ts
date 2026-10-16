import { z } from "zod";

const optionalId = z.string().trim().max(80).optional().catch(undefined);
const flag = z.enum(["0", "1"]).optional().catch(undefined);

/** Bridal form fields. Unknown or oversized values are dropped before the catalogue lookup. */
export const bridalGenerateSchema = z.object({
  finish: optionalId,
  lip: optionalId,
  makeup: optionalId,
  hair: optionalId,
  mehendiCard: optionalId,
  mehendiStyle: optionalId,
  coverage: optionalId,
  mehendiShade: optionalId,
  density: optionalId,
  kajal: flag,
  lashes: flag,
  blush: flag,
  browTint: flag,
});

function field(form: FormData, key: string) {
  const value = form.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function readBridalGenerateFields(form: FormData) {
  const parsed = bridalGenerateSchema.safeParse({
    finish: field(form, "finish"),
    lip: field(form, "lip"),
    makeup: field(form, "makeup"),
    hair: field(form, "hair"),
    mehendiCard: field(form, "mehendiCard"),
    mehendiStyle: field(form, "mehendiStyle"),
    coverage: field(form, "coverage"),
    mehendiShade: field(form, "mehendiShade"),
    density: field(form, "density"),
    kajal: field(form, "kajal"),
    lashes: field(form, "lashes"),
    blush: field(form, "blush"),
    browTint: field(form, "browTint"),
  });
  return parsed.success ? parsed.data : {};
}
