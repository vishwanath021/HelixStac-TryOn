import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appBaseUrl } from "@/lib/env";
import { tooMany } from "@/lib/http/guard";
import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ email: z.string().email() });
const generic = { message: "If that account exists, we sent a reset link." };

export async function POST(req: Request) {
  const limited = await tooMany(req, "forgot", 8, 15 * 60 * 1000);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json(generic);
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.passwordReset.create({
    data: { email, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
  });
  const link = `${appBaseUrl()}/login/reset?token=${token}`;
  if (process.env.SMTP_URL) {
    await sendMail(email, "Reset your Lookuvi password", `Choose a new password: ${link}\nThis link expires in 30 minutes.`).catch(() => undefined);
  }
  if (!process.env.SMTP_URL && process.env.NODE_ENV !== "production") {
    return NextResponse.json({ ...generic, devUrl: link });
  }
  return NextResponse.json(generic);
}
