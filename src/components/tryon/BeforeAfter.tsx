"use client";

import { useRef, useState } from "react";

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
  const [pos, setPos] = useState(52);
  const box = useRef<HTMLDivElement>(null);

  function setFromClientX(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(98, Math.max(2, next)));
  }

  return (
    <div
      ref={box}
      className="relative aspect-[3/4] touch-none overflow-hidden bg-[#14110e]"
      onPointerDown={(event) => {
        box.current?.setPointerCapture(event.pointerId);
        setFromClientX(event.clientX);
      }}
      onPointerMove={(event) => {
        if (!box.current?.hasPointerCapture(event.pointerId)) return;
        setFromClientX(event.clientX);
      }}
    >
      <img src={after} alt={afterLabel} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <img
        src={before}
        alt={beforeLabel}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white" />
        <div className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-[#241c16] bg-white text-[10px] font-semibold tracking-wide text-[#241c16]">
          ↔
        </div>
      </div>
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white">{beforeLabel}</div>
      <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white">{afterLabel}</div>
      <input
        className="absolute inset-x-6 bottom-4 z-20"
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
