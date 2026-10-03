"use client";

import { useState } from "react";
import type { PublicStyle } from "@/data/styles";

export function CatalogueEditor({
  styles,
  shades,
  enabledStyles,
  enabledShades,
}: {
  styles: PublicStyle[];
  shades: { id: string; name: string; hex: string }[];
  enabledStyles: string[];
  enabledShades: string[];
}) {
  const [stylesOn, setStylesOn] = useState(new Set(enabledStyles));
  const [shadesOn, setShadesOn] = useState(new Set(enabledShades));
  const [message, setMessage] = useState("");
  const [gender, setGender] = useState<"women" | "men" | "kids">("women");

  function toggle(set: Set<string>, id: string, on: boolean) {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  }

  async function save() {
    const res = await fetch("/api/v1/admin/catalogue", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        styles: styles.map((style) => ({ styleId: style.id, enabled: stylesOn.has(style.id) })),
        shades: shades.map((shade) => ({ shadeId: shade.id, enabled: shadesOn.has(shade.id) })),
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Catalogue saved." : data.message || "Could not save");
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(["women", "men", "kids"] as const).map((item) => (
          <button key={item} className={gender === item ? "btn" : "btn secondary"} type="button" onClick={() => setGender(item)}>{item}</button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {styles.filter((style) => style.gender === gender).map((style) => (
          <label key={style.id} className="card flex items-start gap-2 p-3 text-sm">
            <input type="checkbox" checked={stylesOn.has(style.id)} onChange={(event) => setStylesOn((current) => toggle(current, style.id, event.target.checked))} />
            <span><strong>{style.name}</strong><br /><span className="text-muted">{style.description}</span></span>
          </label>
        ))}
      </div>
      <h2 className="mb-2 mt-6 font-serif text-2xl">Shades</h2>
      <div className="flex flex-wrap gap-3">
        {shades.map((shade) => (
          <label key={shade.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={shadesOn.has(shade.id)} onChange={(event) => setShadesOn((current) => toggle(current, shade.id, event.target.checked))} />
            <span className="swatch" style={{ background: shade.hex }} />
            {shade.name}
          </label>
        ))}
      </div>
      <button className="btn mt-4" type="button" onClick={() => void save()}>Save catalogue</button>
      {message && <p className="mt-2 text-sm" role="status">{message}</p>}
    </div>
  );
}
