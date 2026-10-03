"use client";

import { useState } from "react";

export function BeforeAfter({
  before,
  after,
  beforeLabel,
  afterLabel,
}: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
}) {
  const [pos, setPos] = useState(56);
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-sand">
      <img src={after} alt={afterLabel} className="absolute inset-0 h-full w-full object-cover" />
      <img
        src={before}
        alt={beforeLabel}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="h-full w-px bg-white/90" />
      </div>
      <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-xs text-white">{beforeLabel}</div>
      <div className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-1 text-xs text-white">{afterLabel}</div>
      <input
        className="absolute inset-x-4 bottom-4"
        type="range"
        min={2}
        max={98}
        value={pos}
        aria-label={`${beforeLabel} / ${afterLabel}`}
        onChange={(event) => setPos(Number(event.target.value))}
      />
    </div>
  );
}
