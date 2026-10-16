"use client";

import { useEffect } from "react";
import { LiveLookStage } from "@/components/tryon/LiveLookStage";

type Shade = { hex: string; lift: number; name: string };

export function ColourStage({
  video,
  image,
  shade,
  intensity,
  mirror,
  onStatus,
}: {
  video: HTMLVideoElement | null;
  image: HTMLImageElement | null;
  shade: Shade | null;
  intensity: number;
  mirror: boolean;
  onStatus: (status: "loading" | "ready" | "error") => void;
}) {
  useEffect(() => {
    onStatus("loading");
  }, [image, onStatus, video]);

  return (
    <LiveLookStage
      video={video}
      image={image}
      hair={shade?.hex ?? null}
      hairStrength={Math.max(0, Math.min(1, (intensity / 100) * (0.55 + (shade?.lift ?? 0))))}
      mirror={mirror}
      label="colour"
      ariaLabel={shade ? shade.name : "Camera"}
      onPhase={(phase) => {
        if (phase === "fallback") onStatus("error");
        else if (phase === "tracking" || phase === "watching") onStatus("ready");
      }}
    />
  );
}
