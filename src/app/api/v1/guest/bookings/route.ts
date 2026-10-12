import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readGuestToken } from "@/lib/preview-access";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  slug: z.string(),
  lookName: z.string().max(80).optional(),
  lookId: z.string().max(80).optional(),
  tool: z.string().max(20).optional(),
  serviceKey: z.string().max(40).optional(),
  preferredAt: z.string().min(4).max(40),
  note: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID", message: "Choose a date and time." }, { status: 400 });
  const tenant = await prisma.tenant.findUnique({ where: { slug: parsed.data.slug }, include: { services: true } });
  const guest = readGuestToken((await cookies()).get("helix_guest")?.value);
  if (!tenant || !guest || guest.tenantId !== tenant.id) return NextResponse.json({ error: "AUTH", message: "Log in with your phone to request a booking." }, { status: 401 });
  const customer = await prisma.customer.findFirst({ where: { id: guest.customerId, tenantId: tenant.id } });
  if (!customer?.onboarded) return NextResponse.json({ error: "PROFILE", message: "Finish the short profile first." }, { status: 400 });
  const service = tenant.services.find((item) => item.key === parsed.data.serviceKey) || tenant.services[0];
  const services = service ? [{ name: service.name, priceInr: service.priceInr }] : [];
  const booking = await prisma.booking.create({
    data: {
      tenantId: tenant.id,
      customerId: customer.id,
      lookName: parsed.data.lookName || "",
      lookId: parsed.data.lookId || "",
      tool: parsed.data.tool || "",
      services: JSON.stringify(services),
      preferredAt: parsed.data.preferredAt,
      note: parsed.data.note || "",
      status: "PENDING",
    },
  });
  if (parsed.data.lookId && parsed.data.lookName) {
    await prisma.savedLook.create({
      data: { customerId: customer.id, tenantId: tenant.id, tool: parsed.data.tool || "style", lookId: parsed.data.lookId, lookName: parsed.data.lookName },
    });
  }
  return NextResponse.json({ bookingId: booking.id, status: booking.status });
}
