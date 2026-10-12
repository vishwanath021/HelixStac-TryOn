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
  const page = Number(url.searchParams.get("page") || "1");
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const view = await platformAiView();
  return NextResponse.json(
    await costReport({
      since: sinceRaw ? new Date(sinceRaw) : undefined,
      imagesPerMonth: Number.isFinite(images) ? images : 100,
      provider: view.provider,
      tier: view.tier,
      page: Number.isFinite(page) ? page : 1,
      pageSize: 20,
      filterProvider: url.searchParams.get("provider") || undefined,
      filterModel: url.searchParams.get("model") || undefined,
      from: fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : undefined,
      to: toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : undefined,
    }),
  );
}
