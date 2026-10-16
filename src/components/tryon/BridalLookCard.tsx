"use client";

import { useState } from "react";

/**
 * A catalogue card. `image: false` renders the beige placeholder and does not
 * request a file. Real photos keep that same beige box, with a soft shimmer,
 * until the file has painted.
 */
export function BridalLookCard({ id, name, image = true, priority = false }: { id: string; name: string; image?: boolean; priority?: boolean }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "missing">(image ? "loading" : "missing");
  if (!image || phase === "missing") {
    return (
      <div className="flex aspect-[3/4] flex-col justify-end bg-[#F3E6D8] px-3 py-3 text-left" aria-hidden="true">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7A5B48]">Photo coming</p>
        <p className="font-serif text-base leading-tight text-[#3E304B]">{name}</p>
      </div>
    );
  }
  return (
    <span className="relative block aspect-[3/4] overflow-hidden bg-[#F3E6D8]">
      {phase !== "ready" ? <span className="bridal-shimmer absolute inset-0" aria-hidden="true" /> : null}
      <img
        src={`/bridal/${id}.webp`}
        alt=""
        width={768}
        height={1024}
        className={`absolute inset-0 h-full w-full object-cover ${phase === "ready" ? "opacity-100" : "opacity-0"}`}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={() => setPhase("ready")}
        onError={() => setPhase("missing")}
      />
    </span>
  );
}
