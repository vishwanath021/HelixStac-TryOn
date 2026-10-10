import { NextResponse } from "next/server";
import { z } from "zod";
import { planById } from "@/data/plans";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";

const schema = z.object({
  name: z.string().min(2).max(80),
  whatsapp: z.string().max(20),
  address: z.string().max(200),
  mapsUrl: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const access = await requireOwner();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const plan = planById(access.tenant.plan);
  const count = await prisma.outlet.count({ where: { tenantId: access.tenant.id } });
  if (count >= plan.outlets) {
    return NextResponse.json({ error: "PLAN", message: `This plan includes ${plan.outlets} outlet${plan.outlets > 1 ? "s" : ""}.` }, { status: 403 });
  }
  const outlet = await prisma.outlet.create({ data: { tenantId: access.tenant.id, ...parsed.data, mapsUrl: parsed.data.mapsUrl || "" } });
  return NextResponse.json({ id: outlet.id });
}
