import { NextResponse } from "next/server";
import { resolveFalKey } from "@/lib/ai/credentials";
import { syncFalBillingCosts } from "@/lib/ai/fal-billing";
import { requireSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const key = await resolveFalKey();
  if (!key.ok) {
    const message = key.reason === "off"
      ? "The fal key is saved and comparisons are off. Enable it, then sync. Billing events still need an ADMIN-scoped key."
      : "Add a fal key on AI settings and enable it. Billing events need an ADMIN-scoped key.";
    return NextResponse.json({ error: "NO_FAL_KEY", message }, { status: 400 });
  }
  const result = await syncFalBillingCosts({ apiKey: key.apiKey });
  if (!result.ok) return NextResponse.json({ error: "FAL_BILLING", message: result.message }, { status: result.status });
  return NextResponse.json({ updated: result.updated, message: result.message });
}
