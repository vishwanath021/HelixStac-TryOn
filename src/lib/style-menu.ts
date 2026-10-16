import { STYLES, styleById } from "@/data/styles";
import { prisma } from "@/lib/prisma";

/** Missing catalogue rows are on the menu. A row turns a style off only when enabled is false. */
export function styleOnMenu(row: { enabled: boolean } | undefined | null) {
  return row ? row.enabled : true;
}

/** Insert catalogue styles that this salon has never saved, turned on. */
export async function ensureCatalogueStyles(tenantId: string) {
  const existing = await prisma.tenantStyle.findMany({ where: { tenantId }, select: { styleId: true } });
  const have = new Set(existing.map((row) => row.styleId));
  const missing = STYLES.filter((style) => !have.has(style.id));
  if (!missing.length) return 0;
  await prisma.tenantStyle.createMany({
    data: missing.map((style) => ({ tenantId, styleId: style.id, enabled: true, serviceIds: "[]" })),
  });
  return missing.length;
}

/**
 * The guest menu and generate use this together.
 * A brand-new catalogue style is enabled, and the row is written so the owner can turn it off later.
 */
export async function styleEnabledForTenant(tenantId: string, styleId: string) {
  if (!styleById(styleId)) return false;
  const row = await prisma.tenantStyle.findUnique({ where: { tenantId_styleId: { tenantId, styleId } } });
  if (!row) {
    await prisma.tenantStyle.create({
      data: { tenantId, styleId, enabled: true, serviceIds: "[]" },
    }).catch(() => undefined);
    return true;
  }
  return row.enabled;
}
