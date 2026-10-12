import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { tooMany } from "@/lib/http/guard";
import { passwordProblem } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().max(200),
  confirmPassword: z.string().max(200),
});

export async function POST(req: Request) {
  const limited = await tooMany(req, "password-change", 10, 15 * 60 * 1000);
  if (limited) return limited;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID", message: "Fill in all three fields." }, { status: 400 });
  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!(await compare(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "PASSWORD", message: "Your current password was not accepted." }, { status: 400 });
  }
  if (newPassword !== confirmPassword) return NextResponse.json({ error: "MISMATCH", message: "The new passwords do not match." }, { status: 400 });
  const problem = passwordProblem(newPassword);
  if (problem) return NextResponse.json({ error: "WEAK", message: problem }, { status: 400 });
  if (newPassword === currentPassword) return NextResponse.json({ error: "SAME", message: "Choose a password different from the current one." }, { status: 400 });
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hash(newPassword, 12) } });
  await prisma.auditLog.create({ data: { actorId: user.id, action: "PASSWORD_CHANGE", target: user.id, meta: "{}" } });
  return NextResponse.json({ ok: true, message: "Password changed. Use the new password next time you sign in." });
}
