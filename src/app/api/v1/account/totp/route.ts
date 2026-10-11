import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { encryptSecret } from "@/lib/crypto/secret";
import { prisma } from "@/lib/prisma";
import { sharedRateLimit } from "@/lib/ratelimit";
import { newTotpSecret, otpauthUrl } from "@/lib/totp";

async function currentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({ where: { id: session.user.id } });
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  return NextResponse.json({
    enabled: user.totpEnabled,
    required: process.env.NODE_ENV === "production" && user.isSuperAdmin,
  });
}

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await sharedRateLimit(`totp-start:${user.id}`, 8, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE", message: "Wait before generating another authenticator secret." }, { status: 429 });
  const secret = newTotpSecret();
  await prisma.user.update({ where: { id: user.id }, data: { totpPendingCipher: encryptSecret(secret) } });
  const otpauth = otpauthUrl(user.email, secret);
  const qr = await QRCode.toDataURL(otpauth);
  return NextResponse.json({ secret, otpauth, qr });
}
