"use client";

import { useState } from "react";
import { LiveLookStage } from "@/components/tryon/LiveLookStage";

const FALLBACK = "Live preview is unavailable on this phone. Your photo still becomes the full look.";

export function MakeupStage({
  video,
  lip,
  kajal,
  lashes,
  blush,
  brow,
}: {
  video: HTMLVideoElement | null;
  lip: string;
  kajal: boolean;
  lashes: boolean;
  blush: boolean;
  brow: boolean;
}) {
  const [note, setNote] = useState("");

  return (
    <>
      <LiveLookStage
        video={video}
        lip={lip}
        kajal={kajal}
        lashes={lashes}
        blush={blush}
        brow={brow}
        makeup
        bridal
        label="makeup"
        onPhase={(phase) => setNote(phase === "fallback" ? FALLBACK : "")}
      />
      {note ? <p className="absolute inset-x-4 bottom-24 z-10 text-center text-sm" role="status">{note}</p> : null}
    </>
  );
}
