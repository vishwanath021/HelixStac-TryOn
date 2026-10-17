"use client";

import { useEffect, useState } from "react";
import { LiveLookStage } from "@/components/tryon/LiveLookStage";

type FrameWindow = Window & { __setLiveFrame?: (url: string) => void };

/** Dev harness: plain and kajal renders of one webcam frame at a time. */
export function LiveEyeCheck() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    const apply = (url: string) => {
      const next = new Image();
      next.onload = () => {
        setImage(next);
        setStamp((value) => value + 1);
      };
      next.src = url;
    };
    (window as FrameWindow).__setLiveFrame = apply;
    return () => {
      delete (window as FrameWindow).__setLiveFrame;
    };
  }, []);

  return (
    <main className="flex gap-4 bg-black p-4" data-ready={image ? "yes" : "no"} data-stamp={stamp}>
      <figure className="relative h-[480px] w-[640px] overflow-hidden bg-black">
        <LiveLookStage image={image} label="plain" camera sampleEdge={640} stamp={stamp} />
      </figure>
      <figure className="relative h-[480px] w-[640px] overflow-hidden bg-black">
        <LiveLookStage image={image} label="makeup" lip="#9B2335" kajal blush camera sampleEdge={640} stamp={stamp} />
      </figure>
    </main>
  );
}
