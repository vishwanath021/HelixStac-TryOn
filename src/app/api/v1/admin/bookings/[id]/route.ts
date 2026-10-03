import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMembership } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buildWhatsAppLink } from "@/lib/whatsapp";

const schema = z.object({ status: z.enum(["CONFIRMED", "DECLINED"]) });

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireMembership();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const { id } = await context.params;
  const booking = await prisma.booking.findFirst({ where: { id, tenantId: access.tenant.id }, include: { customer: true } });
  if (!booking) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  await prisma.booking.update({ where: { id }, data: { status: parsed.data.status } });
  const text = parsed.data.status === "CONFIRMED"
    ? `Hi ${booking.customer.name || ""}, ${access.tenant.name} can take your request (${booking.lookName || "a visit"}) around ${booking.preferredAt}. Reply to confirm.`
    : `Hi ${booking.customer.name || ""}, ${access.tenant.name} cannot take ${booking.preferredAt}. Reply with another time.`;
  const link = buildWhatsAppLink({
    phone: booking.customer.phone,
    salonName: access.tenant.name,
    lookName: booking.lookName || "Visit",
    services: [],
    lang: "en",
  });
  const url = link.phone ? `https://wa.me/${link.phone}?text=${encodeURIComponent(text)}` : "";
  return NextResponse.json({ ok: true, whatsappUrl: url });
}
