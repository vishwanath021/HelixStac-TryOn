"use client";

import { useEffect, useState } from "react";

type Report = {
  capInr: number;
  spentInr: number;
  sessionInr: number;
  dayInr: number;
  monthInr: number;
  usingEstimate: boolean;
  averageInr: number;
  imagesPerMonth: number;
  last: { costInr: number; costSource: string; status: string } | null;
  averages: { tool: string; tier: string; count: number; avgInr: number }[];
  calls: {
    id: string;
    at: string;
    tenantName: string;
    tool: string;
    model: string;
    tier: string;
    quality: string;
    imageSize: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    costInr: number;
    chargedInr: number;
    charged: boolean;
  }[];
  plans: { id: string; name: string; priceInr: number; projectedInr: number; marginInr: number }[];
};

export function SuperCostPanel({ initial }: { initial: Report }) {
  const [report, setReport] = useState(initial);
  const [images, setImages] = useState(initial.imagesPerMonth);
  const [since, setSince] = useState("");

  async function load(sessionStart: string, count: number) {
    const params = new URLSearchParams({ imagesPerMonth: String(count) });
    if (sessionStart) params.set("since", sessionStart);
    const res = await fetch(`/api/v1/super/ai/costs?${params}`);
    if (!res.ok) return;
    const data = (await res.json()) as Report;
    setReport(data);
  }

  useEffect(() => {
    const key = "helix-ai-cost-session";
    let sessionStart = sessionStorage.getItem(key);
    if (!sessionStart) {
      sessionStart = new Date().toISOString();
      sessionStorage.setItem(key, sessionStart);
    }
    setSince(sessionStart);
    void load(sessionStart, images);
  }, [images]);

  const last = report.last;

  return (
    <section className="card mt-6 grid max-w-3xl gap-4 p-5">
      <h2 className="font-serif text-2xl">Image costs</h2>
      <p className="text-sm">
        Last image: {last ? `₹${last.costInr.toFixed(2)} (${last.costSource}, ${last.status})` : "none yet"}.
        {" "}Session ₹{report.sessionInr.toFixed(2)} · today ₹{report.dayInr.toFixed(2)} · month ₹{report.monthInr.toFixed(2)} · cap ₹{report.spentInr.toFixed(2)} of ₹{report.capInr.toFixed(0)}.
      </p>
      {report.usingEstimate && <p className="text-xs text-muted">No billed image yet. The projection uses the selected tier estimate.</p>}
      <div>
        <h3 className="text-sm font-medium">Average by tool and tier</h3>
        {report.averages.length === 0 ? (
          <p className="text-sm text-muted">No billed images yet.</p>
        ) : (
          <ul className="mt-1 text-sm">
            {report.averages.map((row) => (
              <li key={`${row.tool}-${row.tier}`}>{row.tool} · {row.tier} · ₹{row.avgInr.toFixed(2)} · {row.count}</li>
            ))}
          </ul>
        )}
      </div>
      <label className="text-sm">
        Images per salon per month
        <input
          className="field mt-1 max-w-[8rem]"
          type="number"
          min={0}
          value={images}
          onChange={(event) => setImages(Math.max(0, Number(event.target.value) || 0))}
        />
      </label>
      <p className="text-sm">Projected cost ₹{report.plans[0]?.projectedInr.toFixed(2) ?? "0.00"} at ₹{report.averageInr.toFixed(2)} average.</p>
      <ul className="text-sm">
        {report.plans.map((plan) => (
          <li key={plan.id}>
            {plan.name} ₹{plan.priceInr} · projected cost ₹{plan.projectedInr.toFixed(2)} · margin ₹{plan.marginInr.toFixed(2)}
          </li>
        ))}
      </ul>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr>
              <th className="py-1 pr-2">When</th>
              <th className="py-1 pr-2">Salon</th>
              <th className="py-1 pr-2">Tool</th>
              <th className="py-1 pr-2">Model</th>
              <th className="py-1 pr-2">Tier</th>
              <th className="py-1 pr-2">Size</th>
              <th className="py-1 pr-2">Tokens</th>
              <th className="py-1 pr-2">USD</th>
              <th className="py-1 pr-2">INR</th>
              <th className="py-1">Charged</th>
            </tr>
          </thead>
          <tbody>
            {report.calls.map((row) => (
              <tr key={row.id} className="border-t border-black/10">
                <td className="py-1 pr-2">{row.at.slice(0, 16).replace("T", " ")}</td>
                <td className="py-1 pr-2">{row.tenantName}</td>
                <td className="py-1 pr-2">{row.tool}</td>
                <td className="py-1 pr-2">{row.model}</td>
                <td className="py-1 pr-2">{row.tier} {row.quality}</td>
                <td className="py-1 pr-2">{row.imageSize}</td>
                <td className="py-1 pr-2">{row.totalTokens || `${row.inputTokens}/${row.outputTokens}`}</td>
                <td className="py-1 pr-2">{row.costUsd.toFixed(4)}</td>
                <td className="py-1 pr-2">{row.costInr.toFixed(2)}</td>
                <td className="py-1">{row.charged ? row.chargedInr.toFixed(2) : "0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {since && <p className="text-xs text-muted">Session started {since.slice(0, 16).replace("T", " ")}.</p>}
    </section>
  );
}
