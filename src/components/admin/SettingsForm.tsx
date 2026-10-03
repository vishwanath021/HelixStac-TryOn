"use client";

import { useState } from "react";

export function SettingsForm({
  initial,
  canRemoveBranding,
}: {
  initial: { name: string; primaryColor: string; accentColor: string; whatsapp: string; address: string; mapsUrl: string; city: string; gstin: string; removeBranding: boolean };
  canRemoveBranding: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState("");
  const [host, setHost] = useState("");
  const [domainNote, setDomainNote] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffPassword, setStaffPassword] = useState("");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/v1/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setMessage(res.ok ? "Settings saved." : data.message || "Could not save");
  }

  async function addDomain(verify: boolean) {
    const res = await fetch("/api/v1/admin/domain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host, verify }),
    });
    const data = await res.json();
    setDomainNote(data.hint || data.message || (data.verified ? "Verified" : "Saved"));
  }

  async function addStaff(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/v1/admin/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: staffEmail, name: staffName, password: staffPassword }),
    });
    setMessage(res.ok ? "Staff login created." : "Could not add staff");
  }

  return (
    <div className="space-y-4">
      <form className="card grid gap-3 p-4" onSubmit={save}>
        <label className="text-sm">Name<input className="field mt-1" value={form.name} onChange={(event) => set("name", event.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Primary<input className="mt-1 h-10 w-full" type="color" value={form.primaryColor} onChange={(event) => set("primaryColor", event.target.value)} /></label>
          <label className="text-sm">Accent<input className="mt-1 h-10 w-full" type="color" value={form.accentColor} onChange={(event) => set("accentColor", event.target.value)} /></label>
        </div>
        <label className="text-sm">WhatsApp<input className="field mt-1" value={form.whatsapp} onChange={(event) => set("whatsapp", event.target.value)} /></label>
        <label className="text-sm">Address<input className="field mt-1" value={form.address} onChange={(event) => set("address", event.target.value)} /></label>
        <label className="text-sm">Maps link<input className="field mt-1" value={form.mapsUrl} onChange={(event) => set("mapsUrl", event.target.value)} /></label>
        <label className="text-sm">City<input className="field mt-1" value={form.city} onChange={(event) => set("city", event.target.value)} /></label>
        <label className="text-sm">GSTIN<input className="field mt-1" value={form.gstin} onChange={(event) => set("gstin", event.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.removeBranding} disabled={!canRemoveBranding} onChange={(event) => set("removeBranding", event.target.checked)} />
          Remove “Powered by HelixStac” {canRemoveBranding ? "" : "(Pro or Chain)"}
        </label>
        <button className="btn" type="submit">Save</button>
      </form>
      <form className="card grid gap-2 p-4" onSubmit={(event) => { event.preventDefault(); void addDomain(false); }}>
        <h2 className="font-serif text-2xl">Custom domain</h2>
        <input className="field" placeholder="try.yoursalon.in" value={host} onChange={(event) => setHost(event.target.value)} aria-label="Custom domain" />
        <div className="flex gap-2">
          <button className="btn secondary" type="submit">Save host</button>
          <button className="btn secondary" type="button" onClick={() => void addDomain(true)}>Check DNS</button>
        </div>
        {domainNote && <p className="text-sm" role="status">{domainNote}</p>}
      </form>
      <form className="card grid gap-2 p-4" onSubmit={addStaff}>
        <h2 className="font-serif text-2xl">Add staff</h2>
        <input className="field" type="email" placeholder="Email" value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} required aria-label="Staff email" />
        <input className="field" placeholder="Name" value={staffName} onChange={(event) => setStaffName(event.target.value)} required aria-label="Staff name" />
        <input className="field" type="password" placeholder="Password" value={staffPassword} onChange={(event) => setStaffPassword(event.target.value)} required minLength={8} aria-label="Staff password" />
        <button className="btn" type="submit">Create staff login</button>
      </form>
      {message && <p className="text-sm" role="status">{message}</p>}
    </div>
  );
}
