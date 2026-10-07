"use client";

import { useState } from "react";
import { DENSITIES, FACE_SHAPES, TEXTURES } from "@/lib/hair-suitability";
import type { FaceShape, HairDensity, HairTexture, PublicStyle } from "@/data/styles";

type Tags = { density: HairDensity[]; texture: HairTexture[]; faceShapes: FaceShape[] };

function toggleValue<T extends string>(list: T[], value: T, keepLast: boolean) {
  if (list.includes(value)) {
    if (keepLast && list.length === 1) return list;
    return list.filter((item) => item !== value);
  }
  return [...list, value];
}

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
  const [tags, setTags] = useState<Record<string, Tags>>(() => Object.fromEntries(styles.map((style) => [style.id, { density: style.density, texture: style.texture, faceShapes: style.faceShapes }])));
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
        styles: styles.map((style) => ({
          styleId: style.id,
          enabled: stylesOn.has(style.id),
          suitability: tags[style.id] || { density: style.density, texture: style.texture, faceShapes: style.faceShapes },
        })),
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
      <p className="mb-3 text-sm text-muted">Tick a style to keep it on the menu. Density and texture decide which style photos the hair-type picker shows. Face shape is optional.</p>
      <div className="grid gap-2">
        {styles.filter((style) => style.gender === gender).map((style) => {
          const current = tags[style.id] || { density: style.density, texture: style.texture, faceShapes: style.faceShapes };
          function setTag(key: "density" | "texture" | "faceShapes", value: string) {
            setTags((prev) => {
              const row = prev[style.id] || current;
              if (key === "density") return { ...prev, [style.id]: { ...row, density: toggleValue(row.density, value as HairDensity, true) } };
              if (key === "texture") return { ...prev, [style.id]: { ...row, texture: toggleValue(row.texture, value as HairTexture, true) } };
              return { ...prev, [style.id]: { ...row, faceShapes: toggleValue(row.faceShapes, value as FaceShape, false) } };
            });
          }
          return (
            <div key={style.id} className="card p-3 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={stylesOn.has(style.id)} onChange={(event) => setStylesOn((set) => toggle(set, style.id, event.target.checked))} />
                <span><strong>{style.name}</strong><br /><span className="text-muted">{style.description}</span></span>
              </label>
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={`${style.name} density`}>
                {DENSITIES.map((item) => (
                  <button key={item} type="button" aria-pressed={current.density.includes(item)} className={`rounded-full px-2 py-1 text-xs ${current.density.includes(item) ? "bg-[var(--brand-btn)] text-[var(--on-brand)]" : "border border-line"}`} onClick={() => setTag("density", item)}>{item}</button>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={`${style.name} curl pattern`}>
                {TEXTURES.map((item) => (
                  <button key={item} type="button" aria-pressed={current.texture.includes(item)} className={`rounded-full px-2 py-1 text-xs ${current.texture.includes(item) ? "bg-[var(--brand-btn)] text-[var(--on-brand)]" : "border border-line"}`} onClick={() => setTag("texture", item)}>{item}</button>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={`${style.name} face shape`}>
                {FACE_SHAPES.map((item) => (
                  <button key={item} type="button" aria-pressed={current.faceShapes.includes(item)} className={`rounded-full px-2 py-1 text-xs ${current.faceShapes.includes(item) ? "bg-[var(--brand-btn)] text-[var(--on-brand)]" : "border border-line"}`} onClick={() => setTag("faceShapes", item)}>{item}</button>
                ))}
              </div>
            </div>
          );
        })}
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
