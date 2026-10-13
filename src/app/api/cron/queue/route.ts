import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sweepAllQueues } from "@/lib/queue/service";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const expected = process.env.CRON_SECRET || "";
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (expected.length < 16 || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const result = await sweepAllQueues();
  return NextResponse.json({ ok: true, ...result });
}
