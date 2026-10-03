import { NextResponse } from "next/server";
import { z } from "zod";
import { CONSENT_HASH, CONSENT_VERSION } from "@/data/consent";
import { exposeDevOtp, otpSender } from "@/lib/otp";
import { hashOtp, newOtpCode, normalizePhone } from "@/lib/preview-access";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";

const schema = z.object({ slug: z.string().min(1), phone: z.string().min(8).max(20) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return NextResponse.json({ error: "PHONE", message: "Enter a mobile number with 10 digits, or include the country code." }, { status: 400 });
  const tenant = await prisma.tenant.findUnique({ where: { slug: parsed.data.slug } });
  if (!tenant || tenant.status === "SUSPENDED") return NextResponse.json({ error: "TENANT" }, { status: 404 });
  if (!rateLimit(`otp:${tenant.id}:${phone}`, 5, 60 * 60 * 1000).ok) {
    return NextResponse.json({ error: "RATE", message: "Too many codes for this number. Wait and try again." }, { status: 429 });
  }
  const code = newOtpCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.otpChallenge.deleteMany({ where: { tenantId: tenant.id, phone } });
  await prisma.otpChallenge.create({ data: { tenantId: tenant.id, phone, codeHash: hashOtp(tenant.id, phone, code), expiresAt } });
  await otpSender().send(phone, code);
  await prisma.consentLog.create({
    data: {
      tenantId: tenant.id,
      sessionId: `otp:${phone.slice(-4)}`,
      purpose: "Send a one-time code to this phone for booking. The photo is not part of this step.",
      textVersion: CONSENT_VERSION,
      textHash: CONSENT_HASH,
      lang: "en",
      accepted: true,
      ageGate: false,
    },
  });
  return NextResponse.json({ ok: true, devCode: exposeDevOtp() ? code : undefined });
}
