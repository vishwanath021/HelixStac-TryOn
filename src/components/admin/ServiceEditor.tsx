"use client";

import { useState } from "react";

type Row = { id: string; key: string; name: string; priceInr: number; durationMin: number | null };

export function ServiceEditor({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState(499);
  const [message, setMessage] = useState("");

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/v1/admin/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, name, priceInr: price }),
    });
    if (!res.ok) {
      setMessage("Could not save that service.");
      return;
    }
    setMessage("Saved. Refresh to see it in the list.");
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
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="card flex items-center justify-between gap-3 p-3 text-sm">
            <span>{row.name}<span className="block text-xs text-muted">{row.key}</span></span>
            <label className="text-xs">₹
              <input className="field ml-1 w-28" type="number" defaultValue={row.priceInr} onBlur={(event) => void update(row, Number(event.target.value))} />
            </label>
          </li>
        ))}
      </ul>
      <form className="card mt-4 grid gap-2 p-4 sm:grid-cols-4" onSubmit={add}>
        <input className="field" placeholder="key" value={key} onChange={(event) => setKey(event.target.value)} required pattern="[a-z0-9-]+" aria-label="Service key" />
        <input className="field" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required aria-label="Service name" />
        <input className="field" type="number" value={price} onChange={(event) => setPrice(Number(event.target.value))} aria-label="Price in rupees" />
        <button className="btn" type="submit">Add</button>
      </form>
      {message && <p className="mt-2 text-sm" role="status">{message}</p>}
    </div>
  );
}
