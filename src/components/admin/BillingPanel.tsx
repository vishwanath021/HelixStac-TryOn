"use client";

import { useState } from "react";
import { CREDIT_PACKS, PLANS } from "@/data/plans";
import { formatInr } from "@/lib/json";

export function BillingPanel({ plan, status, credits, provider }: { plan: string; status: string; credits: number; provider: string }) {
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
    setMessage(res.ok ? "Credits added." : data.message || "Could not add credits");
    if (res.ok) window.location.reload();
  }

  return (
    <div>
      <p className="text-sm">Current plan <strong>{plan}</strong> · {status} · {credits} credits. Billing provider: {provider}. Prices below are ex-GST. GST 18% is added on the invoice.</p>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={interval === "yearly"} onChange={(event) => setInterval(event.target.checked ? "yearly" : "monthly")} />
        Annual (two months free)
      </label>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {Object.values(PLANS).map((item) => (
          <article key={item.id} className="card p-4">
            <h2 className="font-serif text-2xl">{item.name}</h2>
            <p>{formatInr(interval === "yearly" ? item.monthlyExGst * 10 : item.monthlyExGst)}</p>
            <button className="btn mt-3" type="button" onClick={() => void subscribe(item.id)}>Choose</button>
          </article>
        ))}
      </div>
      <h2 className="mb-2 mt-6 font-serif text-2xl">Credit packs</h2>
      <div className="flex flex-wrap gap-2">
        {CREDIT_PACKS.map((item) => (
          <button key={item.id} className="btn secondary" type="button" onClick={() => void pack(item.id)}>
            {item.credits} · {formatInr(item.priceExGst)}
          </button>
        ))}
      </div>
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </div>
  );
}
