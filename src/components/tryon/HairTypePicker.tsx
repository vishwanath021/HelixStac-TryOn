"use client";

import { StyleCard } from "@/components/tryon/StyleCard";
import { DENSITIES, TEXTURES } from "@/lib/hair-suitability";

export type HairSuggestionCard = {
  id: string;
  name: string;
  reason: string;
  serviceKeys: string[];
};

function Chip({ pressed, label, onClick }: { pressed: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className="chip"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function HairTypePicker({
  pickerOn,
  suggestOn,
  usesCredits,
  density,
  texture,
  showAll,
  suggestions,
  selectedId,
  busy,
  note,
  costLine,
  onDensity,
  onTexture,
  onShowAll,
  onSuggest,
  onPick,
}: {
  pickerOn: boolean;
  suggestOn: boolean;
  usesCredits: boolean;
  density: string;
  texture: string;
  showAll: boolean;
  suggestions: HairSuggestionCard[];
  selectedId: string;
  busy: boolean;
  note: string;
  costLine: string;
  onDensity: (value: string) => void;
  onTexture: (value: string) => void;
  onShowAll: (value: boolean) => void;
  onSuggest: () => void;
  onPick: (card: HairSuggestionCard) => void;
}) {
  if (!pickerOn && !suggestOn && suggestions.length === 0) return null;
  return (
    <div className="mb-3">
      {pickerOn && (
        <div>
          <p className="mb-1 text-sm font-medium">Hair type</p>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Hair density">
            {DENSITIES.map((item) => (
              <Chip key={item} pressed={density === item} label={item} onClick={() => onDensity(density === item ? "" : item)} />
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Curl pattern">
            {TEXTURES.map((item) => (
              <Chip key={item} pressed={texture === item} label={item} onClick={() => onTexture(texture === item ? "" : item)} />
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showAll} onChange={(event) => onShowAll(event.target.checked)} />
            Show all
          </label>
        </div>
      )}
      {suggestOn && (
        <div className="mt-3">
          <button className="btn secondary" type="button" disabled={busy} onClick={onSuggest}>Get AI suggestions</button>
          {usesCredits && <p className="mt-1 text-xs text-muted">Uses 1 salon credit for a new photo. The same photo is free.</p>}
        </div>
      )}
      {note && <p className="mt-2 text-sm" role="status">{note}</p>}
      {costLine && <p className="mt-1 text-xs text-muted">{costLine}</p>}
      {suggestions.length > 0 && (
        <div className="mt-3">
          <h2 className="mb-2 text-sm font-medium">Suggested for you</h2>
          <div className="grid grid-cols-3 gap-2 max-[340px]:grid-cols-2">
            {suggestions.map((card) => (
              <button
                key={card.id}
                type="button"
                aria-pressed={card.id === selectedId}
                className={`relative overflow-hidden rounded-[14px] border bg-white text-left shadow-sm ${card.id === selectedId ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`}
                onClick={() => onPick(card)}
              >
                {card.id === selectedId && <span className="check" aria-hidden="true">✓</span>}
                <StyleCard id={card.id} name={card.name} />
                <span className="block px-2 pt-2 text-center text-sm font-medium">{card.name}</span>
                <span className="block px-2 pb-2 text-center text-xs text-muted">{card.reason}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
