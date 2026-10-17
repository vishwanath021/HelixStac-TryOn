"use client";

import { useState } from "react";
import { LiveLookStage } from "@/components/tryon/LiveLookStage";

const FALLBACK = "Live preview is unavailable on this phone. Your photo still becomes the full look.";

export function MakeupStage({
  video,
  lip,
  kajal,
  blush,
}: {
  video: HTMLVideoElement | null;
  lip: string;
  kajal: boolean;
  blush: boolean;
}) {
  const [note, setNote] = useState("");

  return (
    <>
      <LiveLookStage
        video={video}
        lip={lip}
        kajal={kajal}
        lashes={false}
        blush={blush}
        brow={false}
        makeup
        camera
        label="makeup"
        onPhase={(phase) => setNote(phase === "fallback" ? FALLBACK : "")}
      />
      {note ? <p className="absolute inset-x-4 bottom-24 z-10 text-center text-sm" role="status">{note}</p> : null}
    </>
  );
}
