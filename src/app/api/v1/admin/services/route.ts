import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";

const schema = z.object({
  key: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(80),
  priceInr: z.number().int().min(0).max(500000),
  durationMin: z.number().int().min(5).max(480).optional().nullable(),
});

export async function POST(req: Request) {
  const access = await requireMembership();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const service = await prisma.service.upsert({
    where: { tenantId_key: { tenantId: access.tenant.id, key: parsed.data.key } },
    update: { name: parsed.data.name, priceInr: parsed.data.priceInr, durationMin: parsed.data.durationMin ?? null, active: true },
    create: { tenantId: access.tenant.id, ...parsed.data, durationMin: parsed.data.durationMin ?? null },
  });
  return NextResponse.json({ id: service.id });
}
