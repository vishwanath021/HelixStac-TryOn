import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { HD_CREDIT_COST, STANDARD_CREDIT_COST } from "@/data/plans";
import { shadeById } from "@/data/shades";
import { styleById } from "@/data/styles";
import { generateWithFailover } from "@/lib/ai/router";
import { CreditError, refundStaleReserves, reserveCredits, settleCredits } from "@/lib/credits";
import { numberEnv } from "@/lib/env";
import { sanitizeSelfie, ImageError } from "@/lib/images";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { buildStylePrompt } from "@/lib/prompts";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "INVALID", message: "Send a photo and a style." }, { status: 400 });
  const slug = String(form.get("slug") || "");
  const styleId = String(form.get("styleId") || "");
  const sessionId = String(form.get("sessionId") || "");
  const consentId = String(form.get("consentId") || "");
  const quality = form.get("quality") === "hd" ? "hd" : "standard";
  const shadeId = form.get("shadeId") ? String(form.get("shadeId")) : null;
  const photo = form.get("photo");
  if (!slug || !styleId || sessionId.length < 8 || !(photo instanceof File)) {
    return NextResponse.json({ error: "INVALID", message: "Photo, style, and session are required." }, { status: 400 });
  }
  if (photo.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "SIZE", message: "Please use a photo under 2 MB." }, { status: 413 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return NextResponse.json({ error: "TENANT", message: "Salon not found." }, { status: 404 });
  if (tenant.status === "SUSPENDED") {
    return NextResponse.json({ error: "SUSPENDED", message: "This salon's try-on is paused." }, { status: 403 });
  }

  const consent = await prisma.consentLog.findFirst({
    where: { id: consentId, tenantId: tenant.id, sessionId, accepted: true, ageGate: true },
  });
  if (!consent || Date.now() - consent.createdAt.getTime() > 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "CONSENT", message: "Agree to the preview notice before a style preview." }, { status: 403 });
  }

  const ip = clientIp(req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"));
  const hour = rateLimit(`gen:ip:h:${ip}`, numberEnv("GENERATE_PER_IP_HOUR", 6), 60 * 60 * 1000);
  const day = rateLimit(`gen:ip:d:${ip}`, numberEnv("GENERATE_PER_IP_DAY", 20), 24 * 60 * 60 * 1000);
  const burst = rateLimit(`gen:tenant:m:${tenant.id}`, numberEnv("GENERATE_PER_TENANT_MINUTE", 30), 60 * 1000);
  if (!hour.ok || !day.ok || !burst.ok) {
    return NextResponse.json({ error: "RATE", message: "Too many previews from this connection. Live colour is still free." }, { status: 429 });
  }

  const usedToday = await prisma.tryOn.count({
    where: { tenantId: tenant.id, kind: "STYLE", status: "SUCCEEDED", createdAt: { gte: startOfToday() } },
  });
  if (usedToday >= tenant.dailyCap) {
    return NextResponse.json({ error: "DAILY_CAP", message: "This salon has reached today's preview limit. Live colour is still free." }, { status: 429 });
  }

  const style = styleById(styleId);
  const enabled = await prisma.tenantStyle.findUnique({ where: { tenantId_styleId: { tenantId: tenant.id, styleId } } });
  if (!style || !enabled?.enabled) {
    return NextResponse.json({ error: "STYLE", message: "That style is not on this salon's menu." }, { status: 400 });
  }

  let jpeg: Buffer;
  try {
    jpeg = await sanitizeSelfie(Buffer.from(await photo.arrayBuffer()));
  } catch (error) {
    const code = error instanceof ImageError ? error.code : "DECODE";
    return NextResponse.json({ error: code, message: "Use a JPEG, PNG, or WebP selfie under 2 MB." }, { status: 400 });
  }

  const credits = quality === "hd" ? HD_CREDIT_COST : STANDARD_CREDIT_COST;
  const refId = randomUUID();
  await refundStaleReserves(tenant.id);
  try {
    await reserveCredits(tenant.id, credits, refId);
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "CREDITS", message: "This salon has used its preview credits. Live colour is still free. Message them on WhatsApp to book." },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: "SUSPENDED", message: "This salon's try-on is paused." }, { status: 403 });
  }

  const shade = shadeById(shadeId);
  const tryOn = await prisma.tryOn.create({
    data: {
      tenantId: tenant.id,
      sessionId,
      styleId,
      shadeId: shade?.id,
      kind: "STYLE",
      quality,
      status: "PENDING",
      credits,
    },
  });

  try {
    const result = await generateWithFailover({
      image: jpeg,
      styleId,
      gender: style.gender,
      prompt: buildStylePrompt(style, shade?.name),
      colour: shade?.name,
      tenantId: tenant.id,
      quality,
    });
    await settleCredits(tenant.id, refId, "COMMIT");
    const balance = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { creditBalance: true } });
    await prisma.tryOn.update({
      where: { id: tryOn.id },
      data: {
        status: "SUCCEEDED",
        provider: result.provider,
        latencyMs: result.latencyMs,
        costMicroUsd: Math.round(result.providerCostUsd * 1_000_000),
      },
    });
    await prisma.usageEvent.create({
      data: {
        tenantId: tenant.id,
        sessionId,
        name: "generate_succeeded",
        props: JSON.stringify({ styleId, quality, provider: result.provider, latencyMs: result.latencyMs }),
      },
    });
    return new NextResponse(new Uint8Array(result.image), {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "no-store",
        "x-tryon-id": tryOn.id,
        "x-credits-left": String(balance?.creditBalance ?? 0),
        "x-provider": result.provider,
      },
    });
  } catch (error) {
    await settleCredits(tenant.id, refId, "REFUND");
    await prisma.tryOn.update({ where: { id: tryOn.id }, data: { status: "FAILED" } });
    logError("generate failed", { tryOnId: tryOn.id, tenantId: tenant.id, message: error instanceof Error ? error.message : "error" });
    return NextResponse.json({ error: "PROVIDER", message: "The preview did not finish. The credit was returned. Please try again." }, { status: 502 });
  }
}
