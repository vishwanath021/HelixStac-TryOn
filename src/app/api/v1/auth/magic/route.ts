import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appBaseUrl } from "@/lib/env";
import { tooMany } from "@/lib/http/guard";
import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const limited = await tooMany(req, "magic", 8, 15 * 60 * 1000);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  const generic = { message: "If that account exists, we sent a sign-in link." };
  if (!user) return NextResponse.json(generic);
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.magicLink.create({
    data: { email, tokenHash, expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
  });
  const link = `${appBaseUrl()}/login?token=${token}`;
  if (process.env.SMTP_URL) {
    await sendMail(email, "Your Lookuvi sign-in link", `Sign in: ${link}\nThis link expires in 15 minutes.`).catch(() => undefined);
  }
  const allowDev = process.env.NODE_ENV !== "production";
  if (!process.env.SMTP_URL && allowDev) {
    return NextResponse.json({ ...generic, devUrl: link, message: "Email is not configured. Use the dev link on this screen. Do not enable this in production." });
  }
  return NextResponse.json(generic);
}
