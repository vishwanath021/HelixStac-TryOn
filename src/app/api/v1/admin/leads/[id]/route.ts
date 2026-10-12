import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";

const schema = z.object({ status: z.enum(["NEW", "CONTACTED", "BOOKED", "CLOSED"]) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireMembership();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const result = await prisma.lead.updateMany({ where: { id, tenantId: access.tenant.id }, data: { status: parsed.data.status } });
  if (!result.count) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
