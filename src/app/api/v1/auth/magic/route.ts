import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/env";

const bodySchema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
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
  const devUrl = `${appBaseUrl()}/login?token=${token}`;
  const allowDev = process.env.NODE_ENV !== "production";
  if (!process.env.SMTP_URL && allowDev) {
    return NextResponse.json({ ...generic, devUrl, message: "Email is not configured. Use the dev link on this screen. Do not enable this in production." });
  }
  return NextResponse.json(generic);
}
