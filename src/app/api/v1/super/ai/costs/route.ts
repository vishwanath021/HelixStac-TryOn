import { NextResponse } from "next/server";
import { costReport } from "@/lib/ai/cost-report";
import { platformAiView } from "@/lib/ai/settings-store";
import { requireSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const url = new URL(req.url);
  const sinceRaw = url.searchParams.get("since");
  const images = Number(url.searchParams.get("imagesPerMonth") || "100");
  const view = await platformAiView();
  return NextResponse.json(
    await costReport({
      since: sinceRaw ? new Date(sinceRaw) : undefined,
      imagesPerMonth: Number.isFinite(images) ? images : 100,
      provider: view.provider,
      tier: view.tier,
    }),
  );
}
