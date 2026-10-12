import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readGuestToken } from "@/lib/preview-access";
import { prisma } from "@/lib/prisma";

async function customerFor(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  const guest = readGuestToken((await cookies()).get("helix_guest")?.value);
  if (!tenant || !guest || guest.tenantId !== tenant.id) return null;
  return prisma.customer.findFirst({ where: { id: guest.customerId, tenantId: tenant.id } });
}

const schema = z.object({
  slug: z.string(),
  label: z.string().min(1).max(40),
  audience: z.enum(["women", "men", "kids"]),
  hairLength: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const customer = await customerFor(parsed.data.slug);
  if (!customer) return NextResponse.json({ error: "AUTH" }, { status: 401 });
  const count = await prisma.guestPerson.count({ where: { customerId: customer.id } });
  if (count >= 6) return NextResponse.json({ error: "LIMIT", message: "Six people is the limit on this account." }, { status: 400 });
  const person = await prisma.guestPerson.create({
    data: {
      customerId: customer.id,
      label: parsed.data.label,
      audience: parsed.data.audience,
      hairLength: parsed.data.hairLength || "",
    },
  });
  return NextResponse.json({ person });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const customer = await customerFor(url.searchParams.get("slug") || "");
  const id = url.searchParams.get("id") || "";
  if (!customer) return NextResponse.json({ error: "AUTH" }, { status: 401 });
  await prisma.guestPerson.deleteMany({ where: { id, customerId: customer.id } });
  return NextResponse.json({ ok: true });
}
