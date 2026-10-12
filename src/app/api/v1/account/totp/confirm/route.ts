import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { decryptSecret } from "@/lib/crypto/secret";
import { prisma } from "@/lib/prisma";
import { sharedRateLimit } from "@/lib/ratelimit";
import { base32Decode, hashRecovery, recoveryCodes, verifyTotp } from "@/lib/totp";

const bodySchema = z.object({ code: z.string().min(6).max(12) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await sharedRateLimit(`totp-confirm:${session.user.id}`, 10, 15 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE" }, { status: 429 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID", message: "Enter the 6-digit code from the app." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.totpPendingCipher) return NextResponse.json({ error: "PENDING", message: "Start authenticator setup first." }, { status: 400 });
  let ok = false;
  try {
    ok = verifyTotp(base32Decode(decryptSecret(user.totpPendingCipher)), parsed.data.code);
  } catch {
    ok = false;
  }
  if (!ok) return NextResponse.json({ error: "CODE", message: "That code was not accepted. Check the clock and try the next code." }, { status: 400 });
  const codes = recoveryCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpSecretCipher: user.totpPendingCipher,
      totpPendingCipher: "",
      totpEnabled: true,
      recoveryCodeHashes: JSON.stringify(codes.map(hashRecovery)),
    },
  });
  return NextResponse.json({
    ok: true,
    recoveryCodes: codes,
    message: "Save these recovery codes now. They are shown once. Each code works a single time.",
  });
}
