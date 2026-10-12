import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appBaseUrl } from "@/lib/env";
import { tooMany } from "@/lib/http/guard";
import { MAIL_NOT_CONFIGURED, mailConfigured, sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const limited = await tooMany(req, "magic", 8, 15 * 60 * 1000);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const generic = { message: "If that account exists, we sent a sign-in link." };
  if (!mailConfigured() && process.env.NODE_ENV === "production") {
    return NextResponse.json({ configured: false, message: MAIL_NOT_CONFIGURED }, { status: 503 });
  }
  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json(generic);
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await prisma.magicLink.create({
    data: { email, tokenHash, expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
  });
  const link = `${appBaseUrl()}/login?token=${token}`;
  if (!mailConfigured()) {
    return NextResponse.json({ ...generic, devUrl: link, configured: false, message: "Email is not configured. Use the dev link on this screen. Set RESEND_API_KEY or SMTP_URL before production." });
  }
  const sent = await sendMail(email, "Your Lookuvi sign-in link", `Sign in: ${link}\nThis link expires in 15 minutes.`).catch(() => false);
  if (!sent) {
    await prisma.magicLink.delete({ where: { id: row.id } }).catch(() => undefined);
    return NextResponse.json({ configured: true, message: "The sign-in email could not be sent. Check RESEND_API_KEY or SMTP_URL and EMAIL_FROM." }, { status: 502 });
  }
  return NextResponse.json(generic);
}
