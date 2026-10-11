import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { checkUserTotp } from "@/lib/account-totp";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  password: z.string().min(8).max(200),
  code: z.string().min(6).max(40),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (user.isSuperAdmin && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "REQUIRED", message: "Super-admin two-factor stays on in production. Use Start again to replace the authenticator." }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const passwordOk = await compare(parsed.data.password, user.passwordHash);
  if (!passwordOk) return NextResponse.json({ error: "PASSWORD", message: "That password was not accepted." }, { status: 400 });
  const totp = await checkUserTotp(user, parsed.data.code);
  if (totp !== "ok") return NextResponse.json({ error: "CODE", message: "That authenticator or recovery code was not accepted." }, { status: 400 });
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecretCipher: "", totpPendingCipher: "", recoveryCodeHashes: "[]" },
  });
  return NextResponse.json({ ok: true, message: "Authenticator turned off." });
}
