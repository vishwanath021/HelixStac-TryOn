import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ageYears, readGuestToken } from "@/lib/preview-access";
import { prisma } from "@/lib/prisma";

async function current(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return null;
  const token = (await cookies()).get("helix_guest")?.value;
  const guest = readGuestToken(token);
  if (!guest || guest.tenantId !== tenant.id) return { tenant, customer: null };
  const customer = await prisma.customer.findFirst({
    where: { id: guest.customerId, tenantId: tenant.id },
    include: { people: true, bookings: { orderBy: { createdAt: "desc" }, take: 20 }, looks: { orderBy: { createdAt: "desc" }, take: 12 } },
  });
  return { tenant, customer };
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") || "";
  const found = await current(slug);
  if (!found?.tenant) return NextResponse.json({ error: "TENANT" }, { status: 404 });
  if (!found.customer) return NextResponse.json({ customer: null });
  const { phone, ...rest } = found.customer;
  return NextResponse.json({ customer: { ...rest, phoneHint: `…${phone.slice(-4)}` } });
}

const profileSchema = z.object({
  slug: z.string(),
  name: z.string().min(2).max(80),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  audience: z.enum(["women", "men", "kids"]),
  hairLength: z.string().max(40).optional(),
});

export async function PUT(req: Request) {
  const parsed = profileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const found = await current(parsed.data.slug);
  if (!found?.customer) return NextResponse.json({ error: "AUTH" }, { status: 401 });
  const age = ageYears(parsed.data.dob);
  if (age === null || age < 13) {
    return NextResponse.json({ error: "AGE", message: "This hub is for guests aged 13 and above. A parent can book for a child." }, { status: 400 });
  }
  if (parsed.data.audience === "women" && !parsed.data.hairLength) {
    return NextResponse.json({ error: "HAIR", message: "Choose a hair length." }, { status: 400 });
  }
  const customer = await prisma.customer.update({
    where: { id: found.customer.id },
    data: {
      name: parsed.data.name,
      dob: parsed.data.dob,
      audience: parsed.data.audience,
      hairLength: parsed.data.audience === "women" ? parsed.data.hairLength || "" : "",
      onboarded: true,
    },
  });
  return NextResponse.json({ ok: true, onboarded: customer.onboarded });
}

export async function DELETE(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") || "";
  const found = await current(slug);
  if (!found?.customer) return NextResponse.json({ error: "AUTH" }, { status: 401 });
  await prisma.customer.delete({ where: { id: found.customer.id } });
  await prisma.dataRequest.create({
    data: { tenantId: found.tenant.id, kind: "DELETE", contact: "guest-hub", sessionId: found.customer.id, status: "DONE", note: "Guest deleted their hub data. Photos were never stored." },
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("helix_guest", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
