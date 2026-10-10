import { NextResponse } from "next/server";
import { z } from "zod";
import { otpMatches, signGuestToken, normalizePhone } from "@/lib/preview-access";
import { prisma } from "@/lib/prisma";

const schema = z.object({ slug: z.string().min(1), phone: z.string(), code: z.string().regex(/^\d{4,6}$/) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID", message: "Enter the code from the message." }, { status: 400 });
  const phone = normalizePhone(parsed.data.phone);
  const tenant = await prisma.tenant.findUnique({ where: { slug: parsed.data.slug } });
  if (!tenant || !phone) return NextResponse.json({ error: "TENANT" }, { status: 404 });
  const challenge = await prisma.otpChallenge.findFirst({ where: { tenantId: tenant.id, phone }, orderBy: { createdAt: "desc" } });
  if (!challenge || challenge.expiresAt.getTime() < Date.now() || challenge.attempts >= 5) {
    return NextResponse.json({ error: "OTP", message: "That code has expired. Request a new one." }, { status: 400 });
  }
  if (!otpMatches(tenant.id, phone, parsed.data.code, challenge.codeHash)) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return NextResponse.json({ error: "OTP", message: "That code does not match." }, { status: 400 });
  }
  await prisma.otpChallenge.deleteMany({ where: { tenantId: tenant.id, phone } });
  const customer = await prisma.customer.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone } },
    update: {},
    create: { tenantId: tenant.id, phone },
  });
  const res = NextResponse.json({ ok: true, onboarded: customer.onboarded, customerId: customer.id });
  res.cookies.set("helix_guest", signGuestToken(customer.id, tenant.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
