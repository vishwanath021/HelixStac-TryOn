import { NextResponse } from "next/server";
import { z } from "zod";
import { isPlanId, planById } from "@/data/plans";
import { grantCredits } from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import { requireSuper } from "@/lib/session";

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  status: z.enum(["TRIAL", "ACTIVE", "SUSPENDED"]).optional(),
  plan: z.string().optional(),
  creditDelta: z.number().int().min(-100000).max(100000).optional(),
  note: z.string().max(200).optional(),
  productTryOn: z.boolean().optional(),
  productQueue: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  if (!("session" in access)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (parsed.data.plan && !isPlanId(parsed.data.plan)) return NextResponse.json({ error: "PLAN" }, { status: 400 });
  const plan = parsed.data.plan && isPlanId(parsed.data.plan) ? planById(parsed.data.plan) : null;
  await prisma.tenant.update({
    where: { id },
    data: {
      name: parsed.data.name,
      status: parsed.data.status,
      ...(plan ? { plan: plan.id, dailyCap: plan.credits } : {}),
      ...(parsed.data.productTryOn !== undefined ? { productTryOn: parsed.data.productTryOn } : {}),
      ...(parsed.data.productQueue !== undefined ? { productQueue: parsed.data.productQueue } : {}),
    },
  });
  if (plan) {
    await grantCredits(id, plan.credits, "PLAN_ASSIGN", "super");
    await prisma.auditLog.create({
      data: {
        actorId: access.session.user.id,
        action: "PLAN_ASSIGN",
        target: id,
        meta: JSON.stringify({ plan: plan.id, credits: plan.credits }),
      },
    });
  }
  if (parsed.data.creditDelta) {
    const balance = await grantCredits(id, parsed.data.creditDelta, "ADJUSTMENT", "super");
    await prisma.auditLog.create({
      data: {
        actorId: access.session.user.id,
        action: "CREDIT_ADJUST",
        target: id,
        meta: JSON.stringify({ creditDelta: parsed.data.creditDelta, balanceAfter: balance, note: parsed.data.note || "" }),
      },
    });
  }
  const productChange = parsed.data.productTryOn !== undefined || parsed.data.productQueue !== undefined;
  if (!plan && !parsed.data.creditDelta) {
    await prisma.auditLog.create({
      data: {
        actorId: access.session.user.id,
        action: "TENANT_UPDATE",
        target: id,
        meta: JSON.stringify(parsed.data),
      },
    });
  } else if (productChange) {
    await prisma.auditLog.create({
      data: {
        actorId: access.session.user.id,
        action: "TENANT_UPDATE",
        target: id,
        meta: JSON.stringify({ productTryOn: parsed.data.productTryOn, productQueue: parsed.data.productQueue }),
      },
    });
  }
  return NextResponse.json({ ok: true, ...(plan ? { plan: plan.id, credits: plan.credits } : {}) });
}
