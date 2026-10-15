"use client";

import { useState } from "react";
import { CREDIT_PACKS, PLANS } from "@/data/plans";
import { OWNER_PLAN_MESSAGE } from "@/lib/billing/access";
import { formatInr } from "@/lib/json";
import { withGst } from "@/lib/pricing";

export function BillingPanel({ plan, status, credits, locked }: { plan: string; status: string; credits: number; provider?: string; locked?: boolean }) {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [message, setMessage] = useState("");

  async function subscribe(nextPlan: string) {
    const res = await fetch("/api/v1/admin/billing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "subscribe", plan: nextPlan, interval }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Plan updated. Invoice path: ${data.checkoutUrl}` : data.message || "Billing failed");
    if (res.ok) window.location.reload();
  }

  async function pack(packId: string) {
    const res = await fetch("/api/v1/admin/billing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "pack", packId }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Try-ons added." : data.message || "Could not add try-ons");
    if (res.ok) window.location.reload();
  }

  return (
    <div>
      <p className="text-sm">Current plan <strong>{plan}</strong> · {status} · {credits.toLocaleString("en-IN")} try-ons left. Prices below are ex-GST. GST 18% is added on the invoice.</p>
      {locked && <p className="mt-3 text-sm" role="status">{OWNER_PLAN_MESSAGE}</p>}
      {!locked && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={interval === "yearly"} onChange={(event) => setInterval(event.target.checked ? "yearly" : "monthly")} />
          Annual (two months free)
        </label>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {Object.values(PLANS).map((item) => (
          <article key={item.id} className="card p-4">
            <h2 className="font-serif text-2xl">{item.name}</h2>
            <p>{formatInr(item.monthlyExGst)} ex-GST · {item.credits} try-ons</p>
            <p className="text-sm text-muted">{formatInr(withGst(item.monthlyExGst).totalInr)} incl. GST</p>
            {!locked && <button className="btn mt-3" type="button" onClick={() => void subscribe(item.id)}>Choose</button>}
          </article>
        ))}
      </div>
      {!locked && (
        <>
          <h2 className="mb-2 mt-6 font-serif text-2xl">Try-on packs</h2>
          <div className="flex flex-wrap gap-2">
            {CREDIT_PACKS.map((item) => (
              <button key={item.id} className="btn secondary" type="button" onClick={() => void pack(item.id)}>
                {item.credits} · {formatInr(item.priceExGst)}
              </button>
            ))}
          </div>
        </>
      )}
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </div>
  );
}
