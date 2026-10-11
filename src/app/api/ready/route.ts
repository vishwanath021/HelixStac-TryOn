import { NextResponse } from "next/server";
import { isDraining } from "@/lib/lifecycle";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Readiness for the load balancer. 503 while draining or when Postgres is down. */
export async function GET() {
  if (isDraining()) return NextResponse.json({ ok: false, db: false }, { status: 503 });
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ ok: true, db: true });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}
