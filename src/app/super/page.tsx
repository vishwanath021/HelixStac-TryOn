import { Hint } from "@/components/ui/tooltip";
import { spendSummary } from "@/lib/ai/spend";
import { numberEnv } from "@/lib/env";
import { auditLabel, listAudit } from "@/lib/super/audit";
import { loadSalons, salonStats } from "@/lib/super/directory";
import { pageSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

function inr(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function when(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SuperPage() {
  await pageSuper();
  const [rows, spend, activity] = await Promise.all([loadSalons(), spendSummary(), listAudit({ page: 1 })]);
  const stats = salonStats(rows);
  const standardInr = numberEnv("AI_COST_INR_STANDARD", 3.5);
  const hdInr = numberEnv("AI_COST_INR_HD", 7);
  const cap = spend.capInr > 0 ? Math.min(100, (spend.spentInr / spend.capInr) * 100) : 0;
  const recent = activity.items.slice(0, 8);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="page-title">Lookuvi</h1>
      <p className="mt-2 text-sm text-muted">Platform snapshot for this month.</p>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article className="card p-4">
          <p className="text-sm text-muted">Active salons</p>
          <p className="mt-1 font-serif text-3xl">{stats.active}</p>
        </article>
        <article className="card p-4">
          <p className="text-sm text-muted">Trials</p>
          <p className="mt-1 font-serif text-3xl">{stats.trials}</p>
        </article>
        <article className="card p-4">
          <div className="flex items-center gap-1">
            <p className="text-sm text-muted">MRR</p>
            <Hint label="About MRR">Active plans only, ex-GST. Trials are not included.</Hint>
          </div>
          <p className="font-serif text-3xl">{inr(stats.mrr)}</p>
        </article>
        <article className="card p-4">
          <div className="flex items-center gap-1">
            <p className="text-sm text-muted">Previews this month</p>
            <Hint label="About preview counts">Succeeded previews since the start of the month in Asia/Kolkata.</Hint>
          </div>
          <p className="font-serif text-3xl">{stats.previews.toLocaleString("en-IN")}</p>
        </article>
        <article className="card p-4">
          <div className="flex items-center gap-1">
            <p className="text-sm text-muted">AI spend vs cap</p>
            <Hint label="About AI spend">
              ₹{standardInr} per standard preview and ₹{hdInr} per HD preview. The cap uses the same kind of estimate.
            </Hint>
          </div>
          <p className="font-serif text-3xl">
            ₹{spend.spentInr.toFixed(0)}
            <span className="text-base text-muted"> / ₹{spend.capInr.toFixed(0)}</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand" aria-hidden>
            <div className="h-full bg-aubergine" style={{ width: `${cap}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{spend.calls} calls</p>
        </article>
        <article className="card p-4">
          <div className="flex items-center gap-1">
            <p className="text-sm text-muted">Credits outstanding</p>
            <Hint label="About credits">Sum of salon credit balances.</Hint>
          </div>
          <p className="font-serif text-3xl">{stats.credits.toLocaleString("en-IN")}</p>
        </article>
      </section>
      <p className="mt-4 text-sm text-muted">Preview cost is an assumption, not a provider bill.</p>
      <section className="card mt-6 p-4">
        <h2 className="text-base font-semibold">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No activity yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {recent.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span>
                  {auditLabel(item.action)}
                  <span className="ml-2 text-muted">{item.target}</span>
                </span>
                <time className="shrink-0 text-xs text-muted" dateTime={item.createdAt}>{when(item.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
