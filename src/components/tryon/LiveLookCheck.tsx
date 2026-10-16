"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LiveLookStage } from "@/components/tryon/LiveLookStage";

const ALLOW = new Set(["glasses-beard.jpg", "malayali-beard.jpg", "bindi-smile.jpg"]);

export function LiveLookCheck() {
  const params = useSearchParams();
  const requested = params.get("src") || "glasses-beard.jpg";
  const name = ALLOW.has(requested) ? requested : "glasses-beard.jpg";
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const next = new Image();
    next.onload = () => setImage(next);
    next.src = `/api/dev/fixture?name=${encodeURIComponent(name)}`;
  }, [name]);

  return (
    <main className="grid gap-4 bg-[#241c2e] p-4 md:grid-cols-2" data-ready={image ? "yes" : "no"}>
      <figure className="relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden bg-black">
        <LiveLookStage image={image} label="before" />
        <figcaption className="absolute left-2 top-2 text-xs text-white">Before</figcaption>
      </figure>
      <figure className="relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden bg-black">
        <LiveLookStage image={image} label="after" lip="#9B2335" kajal lashes blush brow />
        <figcaption className="absolute left-2 top-2 text-xs text-white">After</figcaption>
      </figure>
      <figure className="relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden bg-black">
        <LiveLookStage image={image} label="hair" hair="#C45C26" hairStrength={0.5} />
        <figcaption className="absolute left-2 top-2 text-xs text-white">Hair</figcaption>
      </figure>
    </main>
  );
}
