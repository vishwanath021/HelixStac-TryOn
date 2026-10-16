"use client";

import { useEffect, useState } from "react";
import { GENERATION_EXPECTED_MS, generationFrame } from "@/lib/generation-stage";

export function GeneratingLook({ tool, expectedMs = GENERATION_EXPECTED_MS }: { tool: string; expectedMs?: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 200);
    return () => window.clearInterval(timer);
  }, []);
  const frame = generationFrame(tool, elapsed, expectedMs);
  return (
    <div className="gen-veil" data-generating="yes" data-stage={frame.label} role="status">
      <div className="gen-blur" />
      <div className="gen-shimmer" aria-hidden="true" />
      <div className="gen-glow" aria-hidden="true" />
      <div
        className="gen-ring"
        style={{ ["--p" as string]: frame.pct }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={frame.pct}
        aria-valuetext={frame.label}
        aria-label={frame.label}
      />
      <p className="gen-stage">{frame.label}</p>
    </div>
  );
}
