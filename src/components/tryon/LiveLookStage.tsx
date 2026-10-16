"use client";

import { useEffect, useRef, useState } from "react";
import { EYE_L, EYE_R, lookSamples, smoothLandmarks, type Pt } from "@/lib/face/makeup-paint";
import type { LookAudience } from "@/lib/face/makeup-blend";
import { createLiveGl, type LiveGl, type LiveLookOptions } from "@/lib/face/live-gl";
import { buildHairMask } from "@/lib/face/hair-mask";
import { copySource, loadLiveVision, type LiveVision } from "@/lib/face/live-vision";
import { liveMakeupAllowed } from "@/lib/face/cover-point";

const FULL_EDGE = 480;
const LOW_EDGE = 360;

export type LiveLookProps = {
  video?: HTMLVideoElement | null;
  image?: HTMLImageElement | null;
  lip?: string | null;
  kajal?: boolean;
  lashes?: boolean;
  blush?: boolean;
  brow?: boolean;
  hair?: string | null;
  hairStrength?: number;
  mirror?: boolean;
  /** Bridal live makeup exposes the attributes the studio test waits on. */
  makeup?: boolean;
  /** Men’s everyday live styling never receives makeup. Bridal omits this. */
  audience?: LookAudience;
  label?: string;
  ariaLabel?: string;
  onPhase?: (phase: "loading" | "watching" | "tracking" | "fallback") => void;
};

function writeSamples(canvas: HTMLCanvasElement, points: Pt[]) {
  const samples = lookSamples(points);
  if (!samples) return;
  const width = canvas.width;
  const height = canvas.height;
  (Object.keys(samples) as (keyof typeof samples)[]).forEach((key) => {
    const point = samples[key];
    canvas.dataset[`${key}X`] = String(Math.round(Math.min(width - 1, Math.max(0, point.x * width))));
    canvas.dataset[`${key}Y`] = String(Math.round(Math.min(height - 1, Math.max(0, point.y * height))));
  });
  const ring = (indexes: readonly number[], key: string) => {
    const parts: string[] = [];
    for (const index of indexes) {
      const point = points[index];
      if (!point) return;
      parts.push(
        String(Math.round(Math.min(width - 1, Math.max(0, point.x * width)))),
        String(Math.round(Math.min(height - 1, Math.max(0, point.y * height)))),
      );
    }
    canvas.dataset[key] = parts.join(",");
  };
  ring(EYE_R, "eyeR");
  ring(EYE_L, "eyeL");
}

function copyFloat(mask: { getAsFloat32Array: () => Float32Array } | undefined) {
  if (!mask) return null;
  try {
    return new Float32Array(mask.getAsFloat32Array());
  } catch {
    return null;
  }
}

function readMask(vision: LiveVision, shot: HTMLCanvasElement, points: Pt[] | null) {
  if (!vision.segmenter) return null;
  const result = vision.segmenter.segment(shot);
  const cat = result.categoryMask;
  const conf = result.confidenceMasks;
  const width = cat?.width || conf?.[0]?.width || 0;
  const height = cat?.height || conf?.[0]?.height || 0;
  const category = cat ? new Uint8Array(cat.getAsUint8Array()) : null;
  const hairConf = copyFloat(conf?.[1]);
  const faceSkinConf = copyFloat(conf?.[3]);
  result.close();
  if (!width || !height || (!category && !hairConf)) return null;
  const pixels = document.createElement("canvas");
  pixels.width = width;
  pixels.height = height;
  const ctx = pixels.getContext("2d", { willReadFrequently: true });
  let rgb: Uint8ClampedArray | null = null;
  if (ctx) {
    ctx.drawImage(shot, 0, 0, width, height);
    rgb = ctx.getImageData(0, 0, width, height).data;
  }
  return {
    bytes: buildHairMask({ width, height, category, hairConf, faceSkinConf, points, rgb }),
    width,
    height,
  };
}

export function LiveLookStage({
  video = null,
  image = null,
  lip = null,
  kajal = false,
  lashes = false,
  blush = false,
  brow = false,
  hair = null,
  hairStrength = 0.5,
  mirror = false,
  makeup = false,
  audience,
  label = "live",
  ariaLabel,
  onPhase,
}: LiveLookProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const optionsRef = useRef<LiveLookOptions>({ lip, kajal, lashes, blush, brow, hair, hairStrength, hasMask: false });
  optionsRef.current = { lip, kajal, lashes, blush, brow, hair, hairStrength, hasMask: false };
  const audienceRef = useRef(audience);
  audienceRef.current = audience;
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;
  const [phase, setPhase] = useState<"loading" | "watching" | "tracking" | "fallback">("loading");
  const [shown, setShown] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (!video && !image)) return;
    shownRef.current = false;
    setShown(false);
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (!liveMakeupAllowed(memory)) {
      setPhase("fallback");
      onPhaseRef.current?.("fallback");
      return;
    }
    const renderer: LiveGl | null = createLiveGl(canvas);
    if (!renderer) {
      setPhase("fallback");
      onPhaseRef.current?.("fallback");
      return;
    }
    const handle = { stop: false, raf: 0 };
    const sample = document.createElement("canvas");
    let smoothed: Pt[] | null = null;
    let mask: Uint8Array | null = null;
    let maskW = 0;
    let maskH = 0;
    let edge = FULL_EDGE;
    let segOn = true;
    let frame = 0;
    let saw = false;
    let lastStamp = 0;
    const deltas: number[] = [];

    const paint = (shot: HTMLCanvasElement, points: Pt[] | null) => {
      renderer.resize(shot.width, shot.height);
      const options = optionsRef.current;
      const masked = Boolean(segOn && mask);
      try {
        renderer.draw(shot, masked ? mask : null, maskW, maskH, points, {
          ...options,
          hasMask: masked,
        }, audienceRef.current);
      } catch {
        mask = null;
        renderer.draw(shot, null, 0, 0, points, { ...options, hasMask: false }, audienceRef.current);
      }
      if (points) writeSamples(canvas, points);
      if (!shownRef.current) {
        shownRef.current = true;
        setShown(true);
      }
    };

    const mark = (next: typeof phase) => {
      setPhase(next);
      onPhaseRef.current?.(next);
    };

    const noteBudget = (now: number) => {
      if (lastStamp) {
        deltas.push(now - lastStamp);
        if (deltas.length > 20) deltas.shift();
      }
      lastStamp = now;
      if (deltas.length < 5) return;
      const average = deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
      const fps = Math.max(1, Math.round(1000 / Math.max(1, average)));
      if (fps < 24 && saw) {
        if (edge > LOW_EDGE) edge = LOW_EDGE;
        else segOn = false;
      }
      canvas.dataset.fps = String(fps);
      canvas.dataset.seg = segOn && mask ? "on" : "off";
      canvas.dataset.edge = String(edge);
      canvas.dataset.degraded = edge < FULL_EDGE || !segOn ? "yes" : "no";
    };

    if (image && !video) {
      mark("loading");
      void loadLiveVision().then((vision) => {
        if (handle.stop) return;
        if (!vision) {
          mark("fallback");
          return;
        }
        const shot = copySource(image, sample, edge);
        if (!shot) {
          mark("fallback");
          return;
        }
        const started = performance.now();
        try {
          const next = vision.landmarker.detect(shot).faceLandmarks[0] as Pt[] | undefined;
          if (next && next.length > 454) smoothed = next;
        } catch {
          mark("fallback");
          return;
        }
        try {
          const read = readMask(vision, shot, smoothed);
          if (read) {
            mask = read.bytes;
            maskW = read.width;
            maskH = read.height;
          }
        } catch {
          segOn = false;
        }
        paint(shot, smoothed);
        canvas.dataset.fps = String(Math.max(1, Math.round(1000 / Math.max(1, performance.now() - started))));
        canvas.dataset.seg = segOn && mask ? "on" : "off";
        canvas.dataset.edge = String(edge);
        canvas.dataset.degraded = "no";
        mark(smoothed ? "tracking" : "watching");
      });
      return () => {
        handle.stop = true;
        renderer.destroy();
      };
    }

    mark("loading");
    void loadLiveVision().then((vision) => {
      if (handle.stop) return;
      if (!vision) {
        mark("fallback");
        return;
      }
      mark("watching");
      const tick = (now: number) => {
        if (handle.stop) return;
        handle.raf = requestAnimationFrame(tick);
        if (!video || video.readyState < 2) return;
        const shot = copySource(video, sample, edge);
        if (!shot) return;
        paint(shot, smoothed);
        frame += 1;
        const slot = frame % 6;
        if (slot === 0) {
          try {
            const next = vision.landmarker.detect(shot).faceLandmarks[0] as Pt[] | undefined;
            if (next && next.length > 454) {
              smoothed = smoothLandmarks(smoothed, next, 0.45);
              if (!saw) {
                saw = true;
                mark("tracking");
              }
            }
          } catch {
            mark("fallback");
            handle.stop = true;
            return;
          }
        } else if (slot === 3 && segOn && vision.segmenter) {
          try {
            const read = readMask(vision, shot, smoothed);
            if (read) {
              mask = read.bytes;
              maskW = read.width;
              maskH = read.height;
            }
          } catch {
            /* Keep the last mask and let the next slot try again. */
          }
        }
        noteBudget(now);
      };
      handle.raf = requestAnimationFrame(tick);
    });

    return () => {
      handle.stop = true;
      cancelAnimationFrame(handle.raf);
      renderer.destroy();
    };
  }, [image, video]);

  return (
    <canvas
      ref={canvasRef}
      data-look={label}
      data-state={phase}
      data-makeup={makeup ? "live" : undefined}
      data-makeup-state={makeup ? phase : undefined}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      style={{ transform: mirror ? "scaleX(-1)" : undefined, opacity: shown ? 1 : 0 }}
      aria-label={ariaLabel}
    />
  );
}
