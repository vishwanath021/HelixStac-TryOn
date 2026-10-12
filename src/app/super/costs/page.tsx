import { SuperCostPanel } from "@/components/admin/SuperCostPanel";
import { costReport } from "@/lib/ai/cost-report";
import { platformAiView } from "@/lib/ai/settings-store";
import { pageSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SpendPage() {
  await pageSuper();
  const initial = await platformAiView();
  const costs = await costReport({ provider: initial.provider, tier: initial.tier, imagesPerMonth: 100 });
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="page-title">Spend & costs</h1>
      <p className="mt-2 text-sm text-muted">Cost ledger for image calls, plus the month total.</p>
      <SuperCostPanel initial={costs} />
    </main>
  );
}
