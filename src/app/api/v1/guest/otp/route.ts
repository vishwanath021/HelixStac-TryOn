import { NextResponse } from "next/server";
import { z } from "zod";
import { CONSENT_HASH, CONSENT_VERSION } from "@/data/consent";
import { ownerFeatures } from "@/lib/features";
import { exposeDevOtp, otpSender, phoneLoginConfigured } from "@/lib/otp";
import { hashOtp, newOtpCode, normalizePhone } from "@/lib/preview-access";
import { prisma } from "@/lib/prisma";
import { requestClientIp, sharedRateLimit } from "@/lib/ratelimit";

const schema = z.object({ slug: z.string().min(1), phone: z.string().min(8).max(20) });

export async function POST(req: Request) {
  if (!ownerFeatures().guestHub) return NextResponse.json({ error: "OFF", message: "Guest login is not available." }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  if (!phoneLoginConfigured()) {
    return NextResponse.json(
      { error: "OTP_DISABLED", message: "Phone login is off until MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are set and OTP_PROVIDER=msg91." },
      { status: 503 },
    );
  }
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return NextResponse.json({ error: "PHONE", message: "Enter a mobile number with 10 digits, or include the country code." }, { status: 400 });
  const tenant = await prisma.tenant.findUnique({ where: { slug: parsed.data.slug } });
  if (!tenant || tenant.status === "SUSPENDED") return NextResponse.json({ error: "TENANT" }, { status: 404 });
  const phoneLimit = await sharedRateLimit(`otp:${tenant.id}:${phone}`, 5, 60 * 60 * 1000);
  const ipLimit = await sharedRateLimit(`otp-ip:${requestClientIp(req)}`, 20, 60 * 60 * 1000);
  if (!phoneLimit.ok || !ipLimit.ok) {
    return NextResponse.json({ error: "RATE", message: "Too many codes for this number. Wait and try again." }, { status: 429 });
  }
  const code = newOtpCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  try {
    await otpSender().send(phone, code);
  } catch {
    return NextResponse.json({ error: "OTP_SEND", message: "The text message could not be sent. Try again shortly." }, { status: 502 });
  }
  await prisma.otpChallenge.deleteMany({ where: { tenantId: tenant.id, phone } });
  await prisma.otpChallenge.create({ data: { tenantId: tenant.id, phone, codeHash: hashOtp(tenant.id, phone, code), expiresAt } });
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
