import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { tooMany } from "@/lib/http/guard";
import { prisma } from "@/lib/prisma";
import { revokeUserSessions } from "@/lib/session-revocation";

const DEMO_PASSWORDS = new Set(["DemoSalon#2026", "DemoStaff#2026", "SuperAdmin#2026"]);

const bodySchema = z.object({
  token: z.string().min(20),
  password: z.string().min(12).max(200),
});

export async function POST(req: Request) {
  const limited = await tooMany(req, "reset", 10, 15 * 60 * 1000);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID", message: "Use a reset link and a password of at least 12 characters." }, { status: 400 });
  if (DEMO_PASSWORDS.has(parsed.data.password)) {
    return NextResponse.json({ error: "PASSWORD", message: "Choose a password that is not a demo login." }, { status: 400 });
  }
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const row = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!row || row.used || row.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "TOKEN", message: "That reset link has expired." }, { status: 400 });
  }
  const passwordHash = await hash(parsed.data.password, 12);
  const user = await prisma.user.update({ where: { email: row.email }, data: { passwordHash } });
  await revokeUserSessions(user.id);
  await prisma.passwordReset.update({ where: { id: row.id }, data: { used: true } });
  return NextResponse.json({ ok: true, message: "Password updated. Sign in with the new password." });
}
