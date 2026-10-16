"use client";

import { useState } from "react";
import { BrandColourControl } from "@/components/admin/BrandColourControl";
import { SalonModeCard } from "@/components/admin/SalonModeCard";
import { LOOKUVI_ACCENT, LOOKUVI_PRIMARY } from "@/lib/contrast";
import type { ToolId } from "@/lib/tools";

export function SettingsForm({
  initial,
  canRemoveBranding,
  enabledTools = ["hairstyle", "colour", "brows", "nails", "beard"],
  members,
  selfId,
  showTryOn = true,
  showDomain = false,
  salonModeUrl = "",
}: {
  initial: {
    name: string;
    primaryColor: string;
    accentColor: string;
    whatsapp: string;
    address: string;
    mapsUrl: string;
    city: string;
    gstin: string;
    removeBranding: boolean;
    toolColour: boolean;
    toolStyle: boolean;
    toolBrows: boolean;
    toolBeard: boolean;
    toolNails: boolean;
    hairPickerOn: boolean;
    hairSuggestOn: boolean;
    hairSuggestUsesCredits: boolean;
    anonDailyCap: number;
    memberDailyCap: number;
    requireLoginToBook: boolean;
    logoUrl: string | null;
  };
  canRemoveBranding: boolean;
  enabledTools?: ToolId[];
  members: { userId: string; name: string; email: string; role: string }[];
  selfId: string;
  showTryOn?: boolean;
  showDomain?: boolean;
  salonModeUrl?: string;
}) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState("");
  const [host, setHost] = useState("");
  const [domainNote, setDomainNote] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [team, setTeam] = useState(members);
  const ownerCount = team.filter((member) => member.role === "OWNER").length;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const url = canvas.toDataURL("image/jpeg", 0.8);
      if (url.length > 180_000) {
        setMessage("Logo is too large. Use a smaller image.");
        return;
      }
      set("logoUrl", url);
      setMessage("");
    } catch {
      setMessage("That logo could not be read. Use a PNG or JPEG.");
    }
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
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Staff added to this salon." : data.message || "Could not add staff");
    if (res.ok && data.userId) {
      setTeam((current) => current.some((member) => member.userId === data.userId)
        ? current
        : [...current, { userId: data.userId, name: staffName, email: staffEmail, role: "STAFF" }]);
    }
  }

  async function removeMember(userId: string) {
    const res = await fetch("/api/v1/admin/team", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.message || "Could not remove that person");
      return;
    }
    setTeam((current) => current.filter((member) => member.userId !== userId));
    setMessage("Removed from this salon.");
  }

  return (
    <div className="space-y-4">
      <form className="card grid gap-3 p-4" onSubmit={save}>
        <label className="text-sm">Salon name<input className="field mt-1" aria-label="Salon name" value={form.name} onChange={(event) => set("name", event.target.value)} /></label>
        <div className="text-sm">
          <span className="block">Salon logo</span>
          <input className="mt-1 block" type="file" accept="image/*" aria-label="Salon logo" onChange={(event) => void onLogo(event.target.files?.[0])} />
          <p className="mt-1 text-xs text-muted">Shown beside the salon name. Leave it empty to use the Lookuvi mark.</p>
          {form.logoUrl && (
            <div className="mt-2 flex items-center gap-3">
              <img src={form.logoUrl} alt="" className="h-14 w-14 object-contain" />
              <button className="btn secondary" type="button" onClick={() => set("logoUrl", null)}>Use Lookuvi mark</button>
            </div>
          )}
        </div>
        <label className="text-sm">WhatsApp<input className="field mt-1" value={form.whatsapp} onChange={(event) => set("whatsapp", event.target.value)} /></label>
        <label className="text-sm">Address<input className="field mt-1" value={form.address} onChange={(event) => set("address", event.target.value)} /></label>
        <label className="text-sm">Maps link<input className="field mt-1" value={form.mapsUrl} onChange={(event) => set("mapsUrl", event.target.value)} /></label>
        <label className="text-sm">City<input className="field mt-1" value={form.city} onChange={(event) => set("city", event.target.value)} /></label>
        {showTryOn ? <>
        <fieldset className="grid gap-2 text-sm">
          <legend className="font-medium">Tools on the try-on page</legend>
          {enabledTools.includes("colour") && <label className="flex items-center gap-2"><input type="checkbox" checked={form.toolColour} onChange={(event) => set("toolColour", event.target.checked)} /> Live colour</label>}
          {enabledTools.includes("hairstyle") && <label className="flex items-center gap-2"><input type="checkbox" checked={form.toolStyle} onChange={(event) => set("toolStyle", event.target.checked)} /> Hairstyle preview</label>}
          {enabledTools.includes("beard") && <label className="flex items-center gap-2"><input type="checkbox" checked={form.toolBeard} onChange={(event) => set("toolBeard", event.target.checked)} /> Beard try-on</label>}
          {enabledTools.includes("nails") && <label className="flex items-center gap-2"><input type="checkbox" checked={form.toolNails} onChange={(event) => set("toolNails", event.target.checked)} /> Nail try-on</label>}
        </fieldset>
        <fieldset className="grid gap-2 text-sm">
          <legend className="font-medium">Hair suggestions</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.hairPickerOn} onChange={(event) => set("hairPickerOn", event.target.checked)} /> Hair-type picker. Free, on by default. Density and texture chips filter the style photos.</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.hairSuggestOn} onChange={(event) => set("hairSuggestOn", event.target.checked)} /> Get AI suggestions. Off by default. One reading of the photo, then style photos from this menu.</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.hairSuggestUsesCredits} onChange={(event) => set("hairSuggestUsesCredits", event.target.checked)} /> Use 1 try-on for each new suggestion. Repeat clicks on the same photo stay free.</label>
        </fieldset>
        </> : null}
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
          <div className="mt-3 grid gap-3">
            <BrandColourControl
              value={form.primaryColor}
              onChange={(value) => set("primaryColor", value)}
              onReset={() => setForm((current) => ({ ...current, primaryColor: LOOKUVI_PRIMARY, accentColor: LOOKUVI_ACCENT }))}
            />
            <label className="text-sm">Accent
              <span className="mt-1 flex items-center gap-2">
                <input className="h-10 w-16" type="color" aria-label="Accent" value={/^#[0-9A-Fa-f]{6}$/.test(form.accentColor) ? form.accentColor.toLowerCase() : LOOKUVI_ACCENT.toLowerCase()} onChange={(event) => set("accentColor", event.target.value.toUpperCase())} />
                <span className="font-mono text-sm">{form.accentColor.toUpperCase()}</span>
              </span>
            </label>
            <label className="text-sm">GSTIN<input className="field mt-1" value={form.gstin} onChange={(event) => set("gstin", event.target.value)} /></label>
            {showTryOn && enabledTools.includes("brows") ? (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.toolBrows} onChange={(event) => set("toolBrows", event.target.checked)} /> Eyebrow mapping</label>
            ) : null}
            {showTryOn ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">Anonymous daily previews
                    <input className="field mt-1" type="number" min={0} max={500} value={form.anonDailyCap} onChange={(event) => set("anonDailyCap", Number(event.target.value))} />
                  </label>
                  <label className="text-sm">Logged-in daily previews
                    <input className="field mt-1" type="number" min={0} max={500} value={form.memberDailyCap} onChange={(event) => set("memberDailyCap", Number(event.target.value))} />
                  </label>
                </div>
                <p className="text-xs text-muted">0 means no AI previews for that group.{enabledTools.includes("colour") ? " Live colour stays free." : ""}</p>
                <SalonModeCard initialUrl={salonModeUrl} canRotate />
              </>
            ) : null}
          </div>
        </details>
        {showTryOn ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.requireLoginToBook} onChange={(event) => set("requireLoginToBook", event.target.checked)} />
          Require a phone login before an online booking request. When this is off, Book opens WhatsApp.
        </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.removeBranding} disabled={!canRemoveBranding} onChange={(event) => set("removeBranding", event.target.checked)} />
          Remove “Powered by Lookuvi” {canRemoveBranding ? "" : "(Pro or Chain)"}
        </label>
        <button className="btn" type="submit">Save</button>
      </form>
      {showDomain ? <form className="card grid gap-2 p-4" onSubmit={(event) => { event.preventDefault(); void addDomain(false); }}>
        <h2 className="font-serif text-2xl">Custom domain</h2>
        <input className="field" placeholder="try.yoursalon.in" value={host} onChange={(event) => setHost(event.target.value)} aria-label="Custom domain" />
        <div className="flex gap-2">
          <button className="btn secondary" type="submit">Save host</button>
          <button className="btn secondary" type="button" onClick={() => void addDomain(true)}>Check DNS</button>
        </div>
        {domainNote && <p className="text-sm" role="status">{domainNote}</p>}
      </form> : null}
      <section id="team" className="card grid gap-3 p-4">
        <h2 className="font-serif text-2xl">Team</h2>
        <ul className="space-y-2">
          {team.map((member) => {
            const canRemove = member.userId !== selfId && !(member.role === "OWNER" && ownerCount <= 1);
            return (
              <li key={member.userId} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {member.name}
                  <span className="block text-xs text-muted">{member.email} · {member.role === "OWNER" ? "Owner" : "Staff"}</span>
                </span>
                {canRemove ? <button className="btn secondary" type="button" onClick={() => void removeMember(member.userId)}>Remove</button> : null}
              </li>
            );
          })}
        </ul>
      <form className="grid gap-2" onSubmit={addStaff}>
        <h3 className="font-medium">Add staff</h3>
        <input className="field" type="email" placeholder="Email" value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} required aria-label="Staff email" />
        <input className="field" placeholder="Name" value={staffName} onChange={(event) => setStaffName(event.target.value)} required aria-label="Staff name" />
        <input className="field" type="password" placeholder="Password, at least 12 characters" value={staffPassword} onChange={(event) => setStaffPassword(event.target.value)} required minLength={12} aria-label="Staff password" />
        <button className="btn" type="submit">Create staff login</button>
      </form>
      </section>
      {message && <p className="text-sm" role="status">{message}</p>}
    </div>
  );
}
