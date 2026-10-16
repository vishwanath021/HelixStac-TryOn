"use client";

import { useState } from "react";
import { BRIDAL_PACKAGES, BRIDAL_PACKAGE_KEYS } from "@/data/bridal";

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

  const packages = BRIDAL_PACKAGES.map((pack) => rows.find((row) => row.key === pack.key)).filter((row): row is Row => Boolean(row));
  const everyday = rows.filter((row) => !BRIDAL_PACKAGE_KEYS.has(row.key));

  async function savePackage(row: Row, name: string, priceRaw: string) {
    const priceInr = priceRaw.trim() === "" ? 0 : Math.max(0, Math.round(Number(priceRaw)));
    const nextName = name.trim().length >= 2 ? name.trim() : row.name;
    const res = await fetch(`/api/v1/admin/services/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nextName, priceInr }),
    });
    if (!res.ok) {
      setMessage("Could not save that package.");
      return;
    }
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, name: nextName, priceInr } : item)));
    setMessage(priceInr > 0 ? "Package saved. Brides can see it." : "Package hidden until it has a price.");
  }

  return (
    <div>
      <h2 className="mb-2 font-serif text-2xl">Bridal packages</h2>
      <p className="mb-3 text-sm text-muted">Add a price to show a package before booking. Leave the price empty to hide it.</p>
      <ul className="space-y-2" aria-label="Bridal packages">
        {packages.map((row) => {
          const hint = BRIDAL_PACKAGES.find((pack) => pack.key === row.key)?.hint;
          return (
            <li key={row.id} className="card grid gap-2 p-3 text-sm">
              <label>Name
                <input className="field mt-1" aria-label={`${row.name} package name`} defaultValue={row.name} onBlur={(event) => void savePackage(row, event.target.value, String(row.priceInr || ""))} />
              </label>
              <label>Price in rupees
                <input className="field mt-1" inputMode="numeric" aria-label={`${row.name} price`} placeholder="Empty hides it" defaultValue={row.priceInr > 0 ? row.priceInr : ""} onBlur={(event) => void savePackage(row, row.name, event.target.value)} />
              </label>
              {hint ? <p className="text-xs text-muted">{hint}</p> : null}
            </li>
          );
        })}
      </ul>
      <h2 className="mb-2 mt-8 font-serif text-2xl">Your services</h2>
      {everyday.length === 0 ? <p className="text-sm text-muted">No services yet.</p> : null}
      <ul className="space-y-2" data-service-count={everyday.length}>
        {everyday.map((row) => (
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
