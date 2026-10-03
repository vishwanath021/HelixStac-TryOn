import { NextResponse } from "next/server";
import { getBillingProvider } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";
  try {
    const event = await getBillingProvider().handleWebhook(rawBody, signature);
    if (event.type === "subscription.halted") {
      await prisma.subscription.updateMany({ where: { externalId: event.externalId }, data: { status: "HALTED" } });
    }
    return NextResponse.json({ ok: true, type: event.type });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WEBHOOK";
    const status = message === "INVALID_SIGNATURE" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
