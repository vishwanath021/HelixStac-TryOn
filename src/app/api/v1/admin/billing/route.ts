import { NextResponse } from "next/server";
import { z } from "zod";
import { isPlanId } from "@/data/plans";
import { getBillingProvider } from "@/lib/billing";
import { requireOwner } from "@/lib/session";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), plan: z.string(), interval: z.enum(["monthly", "yearly"]) }),
  z.object({ action: z.literal("pack"), packId: z.string() }),
  z.object({ action: z.literal("cancel") }),
]);

export async function POST(req: Request) {
  const access = await requireOwner();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const billing = getBillingProvider();
  try {
    if (parsed.data.action === "subscribe") {
      if (!isPlanId(parsed.data.plan)) return NextResponse.json({ error: "PLAN" }, { status: 400 });
      const result = await billing.createSubscription({ tenantId: access.tenant.id, plan: parsed.data.plan, interval: parsed.data.interval });
      return NextResponse.json(result);
    }
    if (parsed.data.action === "pack") {
      const result = await billing.createCreditPackOrder({ tenantId: access.tenant.id, packId: parsed.data.packId });
      return NextResponse.json(result);
    }
    const sub = await import("@/lib/prisma").then((mod) => mod.prisma.subscription.findUnique({ where: { tenantId: access.tenant.id } }));
    if (sub?.externalId) await billing.cancelSubscription(sub.externalId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "BILLING", message: error instanceof Error ? error.message : "Billing failed" }, { status: 502 });
  }
}
