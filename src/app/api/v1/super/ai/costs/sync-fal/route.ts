import { NextResponse } from "next/server";
import { syncFalBillingCosts } from "@/lib/ai/fal-billing";
import { requireSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const result = await syncFalBillingCosts();
  if (!result.ok) {
    const error = result.status === 400 ? "NO_FAL_KEY" : "FAL_BILLING";
    return NextResponse.json({ error, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ updated: result.updated, message: result.message });
}
