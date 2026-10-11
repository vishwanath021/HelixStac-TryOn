import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness. Does not touch the database or name providers. */
export async function GET() {
  return NextResponse.json({ ok: true });
}
