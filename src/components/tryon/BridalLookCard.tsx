"use client";

import { useState } from "react";

/**
 * A catalogue card. A missing file hides the card. Real photos keep a beige
 * box, with a soft shimmer, until the file has painted.
 */
export function BridalLookCard({ id, priority = false, onMissing }: { id: string; priority?: boolean; onMissing?: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "missing">("loading");
  if (phase === "missing") return null;
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
        onError={() => { setPhase("missing"); onMissing?.(); }}
      />
    </span>
  );
}
