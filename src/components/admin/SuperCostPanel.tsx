"use client";

import { useEffect, useRef, useState } from "react";

type Call = {
  id: string;
  at: string;
  tenantName: string;
  tool: string;
  model: string;
  imageSize: string;
  costUsd: number;
  costInr: number;
  estimateInr: number;
  actualKnown: boolean;
  sourceLabel: string;
  costNote: string;
  providerRequestId: string;
};

type Report = {
  capInr: number;
  spentInr: number;
  sessionInr: number;
  dayInr: number;
  monthInr: number;
  usingEstimate: boolean;
  averageInr: number;
  imagesPerMonth: number;
  page: number;
  pageSize: number;
  totalCount: number;
  pageCount: number;
  providers: string[];
  totals: { estimateInr: number; actualInr: number; actualCount: number };
  last: { costInr: number; sourceLabel: string; actualKnown: boolean; status: string } | null;
  averages: { tool: string; tier: string; count: number; avgInr: number }[];
  calls: Call[];
  plans: { id: string; name: string; priceInr: number; projectedInr: number; marginInr: number }[];
};

function money(value: number) {
  return `₹${value.toFixed(2)}`;
}

function when(value: string) {
  return value.slice(0, 16).replace("T", " ");
}

export function SuperCostPanel({ initial }: { initial: Report }) {
  const [report, setReport] = useState(initial);
  const [images, setImages] = useState(initial.imagesPerMonth);
  const [since, setSince] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(initial.page || 1);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [draft, setDraft] = useState({ provider: "", model: "", from: "", to: "" });
  const [ready, setReady] = useState(false);
  const firstLoad = useRef(true);

  async function load(sessionStart: string, count: number, nextPage: number, filters = draft) {
    const params = new URLSearchParams({ imagesPerMonth: String(count), page: String(nextPage) });
    if (sessionStart) params.set("since", sessionStart);
    if (filters.provider) params.set("provider", filters.provider);
    if (filters.model.trim()) params.set("model", filters.model.trim());
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    const res = await fetch(`/api/v1/super/ai/costs?${params}`);
    if (!res.ok) return;
    const data = (await res.json()) as Report;
    setReport(data);
    setPage(data.page);
  }

  useEffect(() => {
    const key = "helix-ai-cost-session";
    let sessionStart = sessionStorage.getItem(key);
    if (!sessionStart) {
      sessionStart = new Date().toISOString();
      sessionStorage.setItem(key, sessionStart);
    }
    setSince(sessionStart);
    setReady(true);
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    void load(sessionStart, images, 1, draft);
    // The first paint uses the server report. Later image-count edits reload page 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  async function syncFal() {
    setNotice("Reading fal billing events…");
    const res = await fetch("/api/v1/super/ai/costs/sync-fal", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    setNotice(data.message || "fal billing sync did not finish.");
    if (res.ok && since) await load(since, images, page, draft);
  }

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    setDraft({ provider, model, from, to });
    void load(since, images, 1, { provider, model, from, to });
  }

  const last = report.last;
  const totals = report.totals || { estimateInr: 0, actualInr: 0, actualCount: 0 };
  const totalCount = report.totalCount ?? report.calls.length;
  const pageCount = report.pageCount || 1;

  return (
    <section id="image-costs" data-ready={ready ? "yes" : "no"} className="card mt-6 grid gap-4 p-4 sm:p-5" aria-labelledby="image-costs-title">
      <div>
        <h2 id="image-costs-title" className="font-serif text-2xl">Image costs</h2>
        <p className="mt-1 text-sm text-muted">Newest first. Twenty rows on each page. Totals follow the filters.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[14px] border border-line bg-sand p-4">
          <p className="text-sm text-muted">Estimate</p>
          <p className="font-serif text-2xl">{money(totals.estimateInr)}</p>
        </div>
        <div className="rounded-[14px] border border-line bg-sand p-4">
          <p className="text-sm text-muted">Actual</p>
          <p className="font-serif text-2xl">{money(totals.actualInr)}</p>
          <p className="text-sm text-muted">{totals.actualCount} with a known actual</p>
        </div>
      </div>
      <p className="text-sm">
        Last image: {last ? (last.actualKnown ? `${money(last.costInr)} (${last.sourceLabel}, ${last.status})` : `no actual yet (${last.sourceLabel}, ${last.status})`) : "none yet"}.
        {" "}Session {money(report.sessionInr)} · today {money(report.dayInr)} · month {money(report.monthInr)} · cap {money(report.spentInr)} of ₹{report.capInr.toFixed(0)}.
      </p>
      {report.usingEstimate && <p className="text-sm text-muted">No billed image yet. The projection uses the selected tier estimate.</p>}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={applyFilters}>
        <label className="text-sm">Provider
          <select className="field mt-1" value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="">All providers</option>
            {(report.providers || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-sm">Model
          <input className="field mt-1" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Contains" />
        </label>
        <label className="text-sm">From
          <input className="field mt-1" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="text-sm">To
          <input className="field mt-1" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="btn sm:col-span-2" type="submit">Apply filters</button>
      </form>
      <div>
        <h3 className="text-sm font-medium">Average by tool and tier</h3>
        {report.averages.length === 0 ? (
          <p className="text-sm text-muted">No billed images yet.</p>
        ) : (
          <ul className="mt-1 text-sm">
            {report.averages.map((row) => (
              <li key={`${row.tool}-${row.tier}`}>{row.tool} · {row.tier} · {money(row.avgInr)} · {row.count}</li>
            ))}
          </ul>
        )}
      </div>
      <label className="text-sm">Images per salon per month
        <input className="field mt-1 max-w-[8rem]" type="number" min={0} value={images} onChange={(event) => setImages(Math.max(0, Number(event.target.value) || 0))} />
      </label>
      <p className="text-sm">Projected cost {money(report.plans[0]?.projectedInr ?? 0)} at {money(report.averageInr)} average.</p>
      <ul className="text-sm">
        {report.plans.map((plan) => (
          <li key={plan.id}>{plan.name} ₹{plan.priceInr} · projected cost {money(plan.projectedInr)} · margin {money(plan.marginInr)}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn secondary" type="button" onClick={() => void syncFal()}>Sync real cost from fal</button>
        <p className="text-sm text-muted">Uses the saved fal key. Billing events need an ADMIN-scoped key. An API-scoped key can run models and is refused here.</p>
      </div>
      {notice && <p className="text-sm" role="status">{notice}</p>}
      <p className="text-sm">{totalCount} {totalCount === 1 ? "image" : "images"}</p>
      <ul className="grid gap-3 md:hidden">
        {report.calls.map((row) => (
          <li key={row.id} className="rounded-[14px] border border-line p-3 text-sm">
            <p className="font-medium">{when(row.at)}</p>
            <p className="break-all">{row.model || "—"}</p>
            {row.providerRequestId ? <p className="break-all text-muted">{row.providerRequestId}</p> : null}
            <p>{row.imageSize || "—"} · {row.tenantName}</p>
            <p>Estimate (reserved) {money(row.estimateInr)}</p>
            <p>Actual {row.actualKnown ? `$${row.costUsd.toFixed(3)} (${money(row.costInr)})` : "—"}</p>
            <p>Source {row.sourceLabel}</p>
            {row.costNote ? <p className="text-muted">{row.costNote}</p> : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-3">When</th>
              <th scope="col" className="py-2 pr-3">Model</th>
              <th scope="col" className="py-2 pr-3">Size</th>
              <th scope="col" className="py-2 pr-3">Estimate (reserved)</th>
              <th scope="col" className="py-2 pr-3">Actual</th>
              <th scope="col" className="py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {report.calls.map((row) => (
              <tr key={row.id} className="border-t border-line align-top">
                <td className="py-2 pr-3">{when(row.at)}</td>
                <td className="py-2 pr-3">
                  {row.model}
                  {row.providerRequestId ? <span className="block break-all text-muted">{row.providerRequestId}</span> : null}
                </td>
                <td className="py-2 pr-3">{row.imageSize}</td>
                <td className="py-2 pr-3">{money(row.estimateInr)}</td>
                <td className="py-2 pr-3">{row.actualKnown ? `$${row.costUsd.toFixed(3)} (${money(row.costInr)})` : "—"}</td>
                <td className="py-2">
                  <div>{row.sourceLabel}</div>
                  {row.costNote ? <div className="text-muted">{row.costNote}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn secondary" type="button" disabled={page <= 1} onClick={() => void load(since, images, page - 1, draft)}>Previous</button>
        <p className="text-sm">Page {page} of {pageCount}</p>
        <button className="btn secondary" type="button" disabled={page >= pageCount} onClick={() => void load(since, images, page + 1, draft)}>Next</button>
      </div>
      {since && <p className="text-sm text-muted">Session started {when(since)}.</p>}
    </section>
  );
}
