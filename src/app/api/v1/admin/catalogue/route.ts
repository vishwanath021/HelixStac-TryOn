import { NextResponse } from "next/server";
import { z } from "zod";
import { planById } from "@/data/plans";
import { SHADES } from "@/data/shades";
import { STYLES } from "@/data/styles";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";

const schema = z.object({
  styles: z.array(z.object({ styleId: z.string(), enabled: z.boolean(), customName: z.string().max(80).optional().nullable() })),
  shades: z.array(z.object({ shadeId: z.string(), enabled: z.boolean() })),
});

export async function PUT(req: Request) {
  const access = await requireMembership();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const knownStyles = new Set(STYLES.map((style) => style.id));
  const knownShades = new Set(SHADES.map((shade) => shade.id));
  const enabledCount = parsed.data.styles.filter((style) => style.enabled && knownStyles.has(style.styleId)).length;
  const limit = planById(access.tenant.plan).styleLimit;
  if (limit && enabledCount > limit) {
    return NextResponse.json({ error: "PLAN", message: `Starter includes ${limit} styles. Upgrade to enable more.` }, { status: 403 });
  }
  for (const style of parsed.data.styles) {
    if (!knownStyles.has(style.styleId)) continue;
    await prisma.tenantStyle.upsert({
      where: { tenantId_styleId: { tenantId: access.tenant.id, styleId: style.styleId } },
      update: { enabled: style.enabled, customName: style.customName || null },
      create: { tenantId: access.tenant.id, styleId: style.styleId, enabled: style.enabled, customName: style.customName || null },
    });
  }
  for (const shade of parsed.data.shades) {
    if (!knownShades.has(shade.shadeId)) continue;
    await prisma.tenantShade.upsert({
      where: { tenantId_shadeId: { tenantId: access.tenant.id, shadeId: shade.shadeId } },
      update: { enabled: shade.enabled },
      create: { tenantId: access.tenant.id, shadeId: shade.shadeId, enabled: shade.enabled },
    });
  }
  return NextResponse.json({ ok: true });
}
