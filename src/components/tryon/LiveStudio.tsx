"use client";

import { useState, type ReactNode, type RefObject } from "react";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function StudioRail({
  onRetake,
  onZoomIn,
  onZoomOut,
  onCompare,
  compareOn = false,
  onDownload,
  canDownload = false,
}: {
  onRetake: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCompare?: () => void;
  compareOn?: boolean;
  onDownload?: () => void;
  canDownload?: boolean;
}) {
  return (
    <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3">
      <button className="cam-round" type="button" aria-label="Retake" onClick={onRetake}>↺</button>
      <button className="cam-round" type="button" aria-label="Zoom in" onClick={onZoomIn}>+</button>
      <button className="cam-round" type="button" aria-label="Zoom out" onClick={onZoomOut}>−</button>
      <button className="cam-round" type="button" aria-label="Compare" aria-pressed={compareOn} disabled={!onCompare} onClick={onCompare}>▢</button>
      <button className="cam-round" type="button" aria-label="Download" disabled={!canDownload} onClick={onDownload}>↓</button>
    </div>
  );
}

export function LiveStudio({
  videoRef,
  ready,
  facing,
  guide,
  zoom,
  onZoom,
  onBack,
  onClose,
  onShutter,
  onRetake,
  onCompare,
  compareOn,
  onDownload,
  canDownload,
  onUpload,
  busy,
  stage,
  frozenUrl,
  makeup,
  footer,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  ready: boolean;
  facing: "user" | "environment";
  guide: "face" | "hand";
  zoom: number;
  onZoom: (next: number) => void;
  onBack: () => void;
  onClose: () => void;
  onShutter: () => Promise<void> | void;
  onRetake: () => void;
  onCompare?: () => void;
  compareOn?: boolean;
  onDownload?: () => void;
  canDownload?: boolean;
  onUpload?: () => void;
  busy?: boolean;
  stage?: string;
  frozenUrl?: string;
  makeup?: ReactNode;
  footer?: ReactNode;
}) {
  const [count, setCount] = useState<number | "capturing" | null>(null);

  async function shoot() {
    if (!ready || count !== null || busy) return;
    for (const step of [3, 2, 1]) {
      setCount(step);
      await wait(700);
    }
    setCount("capturing");
    try {
      await onShutter();
    } finally {
      setCount(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white" data-studio="live">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 origin-center" style={{ transform: `scale(${zoom})`, position: "absolute" }}>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={frozenUrl ? "hidden" : "h-full w-full object-cover"}
            style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
          />
          {frozenUrl ? <img src={frozenUrl} alt="" className="h-full w-full object-cover" /> : null}
          {makeup}
          <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
            <div className={guide === "hand" ? "cam-guide-hand" : "cam-guide-face"} />
          </div>
        </div>
      </div>
      <button className="cam-round absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20" type="button" aria-label="Back" onClick={onBack}>‹</button>
      <button className="cam-round absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20" type="button" aria-label="Close" onClick={onClose}>×</button>
      <StudioRail
        onRetake={onRetake}
        onZoomIn={() => onZoom(Math.min(2, Math.round((zoom + 0.25) * 100) / 100))}
        onZoomOut={() => onZoom(Math.max(1, Math.round((zoom - 0.25) * 100) / 100))}
        onCompare={onCompare}
        compareOn={compareOn}
        onDownload={onDownload}
        canDownload={canDownload}
      />
      <div className="absolute inset-x-0 bottom-0 z-20 grid justify-items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {footer}
        <button className="cam-shutter" type="button" aria-label="Take photo" disabled={!ready || count !== null || busy} onClick={() => void shoot()} />
        {onUpload ? (
          <button className="btn on-photo" type="button" onClick={onUpload}>Upload a photo instead</button>
        ) : null}
      </div>
      {count !== null && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/45" role="status">
          <p className="font-serif text-7xl">{count === "capturing" ? "Capturing..." : count}</p>
        </div>
      )}
      {busy && stage && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#3E304B]/80 px-6 text-center" role="status">
          <p className="font-serif text-3xl">{stage}</p>
        </div>
      )}
    </div>
  );
}
