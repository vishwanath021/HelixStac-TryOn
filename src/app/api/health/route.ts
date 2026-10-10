import { NextResponse } from "next/server";
import { aiProviderName, billingProviderName } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  let db = false;
  try {
    await prisma.tenant.count();
    db = true;
  } catch {
    db = false;
  }
  return NextResponse.json({
    ok: db,
    db,
    ai: aiProviderName(),
    billing: billingProviderName(),
    time: new Date().toISOString(),
  });
}
