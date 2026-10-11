"use client";

import { useState } from "react";

export type SuperRow = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  credits: number;
  leads: number;
  tryOns: number;
  cogsInr: number;
};

function SalonNameField({ id, slug, initial, onSave }: { id: string; slug: string; initial: string; onSave: (id: string, body: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(id, { name });
      }}
    >
      <input className="field max-w-[16rem]" aria-label={`Salon name for ${slug}`} value={name} onChange={(event) => setName(event.target.value)} />
      <button className="btn secondary" type="submit">Save name</button>
    </form>
  );
}

export function SuperPanel({
  rows,
  mrr,
  assumption,
  spend,
}: {
  rows: SuperRow[];
  mrr: number;
  assumption: string;
  spend: { spentInr: number; capInr: number; calls: number };
}) {
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");

  async function createSalon(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/v1/super/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, slug, ownerEmail: ownerEmail || undefined, ownerPassword: ownerPassword || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? `Created ${data.slug}.` : data.message || "Could not create that salon.");
    if (res.ok) window.location.reload();
  }

  async function update(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/v1/super/tenants/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setMessage(res.ok ? "Updated." : "Could not update that salon.");
  }

  return (
    <div>
      <form className="card mb-4 grid gap-3 p-4 md:grid-cols-2" onSubmit={createSalon}>
        <h2 className="font-serif text-2xl md:col-span-2">New salon</h2>
        <label className="text-sm">Name
          <input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
        </label>
        <label className="text-sm">Slug
          <input className="field mt-1" value={slug} onChange={(event) => setSlug(event.target.value)} required minLength={2} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </label>
        <label className="text-sm">Owner email
          <input className="field mt-1" type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} />
        </label>
        <label className="text-sm">Owner password
          <input className="field mt-1" type="password" value={ownerPassword} onChange={(event) => setOwnerPassword(event.target.value)} minLength={12} />
        </label>
        <button className="btn md:col-span-2" type="submit">Create salon</button>
      </form>
      <p className="text-sm">MRR (active plans, ex-GST): ₹{mrr.toLocaleString("en-IN")}. Trials are not in MRR.</p>
      <p className="mt-2 text-sm" role="status">
        Paid preview estimate: ₹{spend.spentInr.toFixed(2)} of ₹{spend.capInr.toFixed(0)} ({spend.calls} calls). Further paid calls stop at the cap and return a labelled sample.
      </p>
      <p className="mt-2 text-xs text-muted">{assumption}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-muted">
              <th className="py-2">Salon</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Credits</th>
              <th>Previews</th>
              <th>Assumed COGS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="py-2">
                  {row.name}
                  <span className="block text-xs text-muted">{row.slug} · {row.leads} leads</span>
                  <SalonNameField id={row.id} slug={row.slug} initial={row.name} onSave={update} />
                </td>
                <td>{row.plan}</td>
                <td>{row.status}</td>
                <td>{row.credits}</td>
                <td>{row.tryOns}</td>
                <td>₹{row.cogsInr.toFixed(1)}</td>
                <td className="space-x-2 whitespace-nowrap py-2">
                  <button className="btn secondary" type="button" onClick={() => void update(row.id, { creditDelta: 50, note: "goodwill" })}>+50</button>
                  <button className="btn secondary" type="button" onClick={() => void update(row.id, { status: row.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" })}>
                    {row.status === "SUSPENDED" ? "Enable" : "Disable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </div>
  );
}
