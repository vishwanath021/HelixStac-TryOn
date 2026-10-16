"use client";

import { BRAND_COLOUR_HINT, LOOKUVI_PRIMARY } from "@/lib/contrast";

function pickerValue(value: string) {
  const match = value.trim().match(/^#([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : LOOKUVI_PRIMARY.toLowerCase();
}

/** Brand colour picker, its hex, and the reset to Lookuvi purple. */
export function BrandColourControl({
  value,
  onChange,
  onReset,
  inputLabel = "Primary",
}: {
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
  inputLabel?: string;
}) {
  return (
    <div className="text-sm">
      <span className="block">Brand colour</span>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          className="h-10 w-16"
          type="color"
          aria-label={inputLabel}
          value={pickerValue(value)}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <span className="font-mono text-sm">{value.toUpperCase()}</span>
        <button className="btn secondary" type="button" onClick={onReset}>Reset to Lookuvi purple</button>
      </div>
      <p className="mt-1 text-xs text-muted">{BRAND_COLOUR_HINT}</p>
    </div>
  );
}
