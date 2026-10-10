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
    setPos(Math.min(96, Math.max(4, next)));
  }

  return (
    <div
      ref={box}
      className="relative aspect-[3/4] touch-none overflow-hidden bg-[#F3F0F8]"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).tagName === "INPUT") return;
        box.current?.setPointerCapture(event.pointerId);
        setFromClientX(event.clientX);
      }}
      onPointerMove={(event) => {
        if (!box.current?.hasPointerCapture(event.pointerId)) return;
        setFromClientX(event.clientX);
      }}
    >
      <img src={after} alt={afterLabel} className="absolute inset-0 h-full w-full object-cover object-top" draggable={false} />
      <img
        src={before}
        alt={beforeLabel}
        className="absolute inset-0 h-full w-full object-cover object-top"
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-sm" />
        <div className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-[#3E304B] bg-white text-sm font-semibold text-[#3E304B]">
          ↔
        </div>
      </div>
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-[#3E304B] px-3 py-1 text-xs font-semibold tracking-wide text-white">{beforeLabel}</div>
      <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-[#3E304B] px-3 py-1 text-xs font-semibold tracking-wide text-white">{afterLabel}</div>
      <input
        className="absolute inset-x-0 bottom-3 z-20 mx-auto h-12 w-[calc(100%-1.5rem)] cursor-ew-resize accent-[#3E304B]"
        type="range"
        min={4}
        max={96}
        value={pos}
        aria-label={`${beforeLabel} / ${afterLabel}`}
        aria-valuetext={`${Math.round(pos)} percent`}
        onChange={(event) => setPos(Number(event.target.value))}
      />
    </div>
  );
}
