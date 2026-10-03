import Link from "next/link";
import { SuperAiForm } from "@/components/admin/SuperAiForm";
import { SuperCostPanel } from "@/components/admin/SuperCostPanel";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { costReport } from "@/lib/ai/cost-report";
import { platformAiView } from "@/lib/ai/settings-store";
import { pageSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SuperAiPage() {
  await pageSuper();
  const initial = await platformAiView();
  const costs = await costReport({ provider: initial.provider, tier: initial.tier, imagesPerMonth: 100 });
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Super admin</p>
          <h1 className="font-serif text-4xl">AI settings</h1>
        </div>
        <SignOutButton />
      </div>
      <p className="mb-4 text-sm">
        <Link className="underline" href="/super">Back to salons</Link>
      </p>
      <p className="mb-4 max-w-xl text-sm leading-6">
        Test is the default for a new key and for every calibration run. Medium turns on only after you approve it. High stays off until you enable it. Guests use Test until a salon or this page selects a higher tier that is allowed.
      </p>
      <SuperAiForm initial={initial} />
      <SuperCostPanel initial={costs} />
    </main>
  );
}
