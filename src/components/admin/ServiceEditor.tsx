"use client";

import { useState } from "react";

type Row = { id: string; key: string; name: string; priceInr: number; durationMin: number | null; active: boolean };

function serviceKey(name: string) {
  const key = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return key.length >= 2 ? key : "service";
}

export function ServiceEditor({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [name, setName] = useState("");
  const [price, setPrice] = useState(499);
  const [message, setMessage] = useState("");

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const key = serviceKey(name);
    const res = await fetch("/api/v1/admin/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, name, priceInr: price }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) {
      setMessage("Could not save that service.");
      return;
    }
    setRows((current) => [...current.filter((row) => row.key !== key), { id: data.id, key, name, priceInr: price, durationMin: null, active: true }]);
    setName("");
    setMessage("Saved.");
  }

  async function setActive(row: Row, active: boolean) {
    const res = await fetch(`/api/v1/admin/services/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (!res.ok) {
      setMessage("Could not update that service.");
      return;
    }
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, active } : item)));
    setMessage(active ? "Service is visible again." : "Service hidden from the try-on.");
  }

  async function remove(row: Row) {
    const res = await fetch(`/api/v1/admin/services/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      setMessage("Could not delete that service.");
      return;
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
    setMessage("Service deleted.");
  }

  async function update(row: Row, priceInr: number) {
    await fetch(`/api/v1/admin/services/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ priceInr }),
    });
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, priceInr } : item)));
  }

  return (
    <div>
      <h2 className="mb-2 font-serif text-2xl">Your services</h2>
      {rows.length === 0 ? <p className="text-sm text-muted">No services yet.</p> : null}
      <ul className="space-y-2" data-service-count={rows.length}>
        {rows.map((row) => (
          <li key={row.id} className="card flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
            <span>
              {row.name}
              {!row.active ? <span className="ml-2 rounded-full bg-[#f3ece4] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">hidden</span> : null}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <label className="text-xs">₹
                <input className="field ml-1 w-28" type="number" defaultValue={row.priceInr} onBlur={(event) => void update(row, Number(event.target.value))} />
              </label>
              <button className="btn secondary" type="button" onClick={() => void setActive(row, !row.active)}>{row.active ? "Hide" : "Unhide"}</button>
              <button className="btn secondary" type="button" onClick={() => void remove(row)}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
      <form className="card mt-4 grid gap-2 p-4 sm:grid-cols-3" onSubmit={add}>
        <input className="field" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required aria-label="Service name" />
        <input className="field" type="number" value={price} onChange={(event) => setPrice(Number(event.target.value))} aria-label="Price in rupees" />
        <button className="btn" type="submit">Add</button>
      </form>
      {message && <p className="mt-2 text-sm" role="status">{message}</p>}
    </div>
  );
}
