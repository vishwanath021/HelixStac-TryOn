"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { hushMediapipeInfo } from "@/lib/face/detect-client";
import { coverPoint, liveMakeupAllowed } from "@/lib/face/cover-point";

const DETECT_MS = 90;
const MAX_CANVAS = 480;
const FALLBACK = "Live preview is unavailable on this phone. Your photo still becomes the full look.";

const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const LASH_L = [33, 246, 161, 160, 159, 158, 157, 173, 133];
const LASH_R = [263, 466, 388, 387, 386, 385, 384, 398, 362];
const EYE_L = [33, 7, 163, 144, 145, 153, 154, 155, 133];
const EYE_R = [263, 249, 390, 373, 374, 380, 381, 382, 362];
const BROW_L = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const BROW_R = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];

let videoMarker: Promise<FaceLandmarker | null> | null = null;

function marker() {
  if (!videoMarker) {
    videoMarker = (async () => {
      try {
        hushMediapipeInfo();
        const vision = await import("@mediapipe/tasks-vision");
        const files = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const model = { modelAssetPath: "/mediapipe/face-landmarker" };
        // IMAGE mode on a copied frame. VIDEO mode reads the camera texture, which stays blank
        // under the fake camera and on some Android GPUs, so the mirror never paints.
        const shared = {
          runningMode: "IMAGE" as const,
          numFaces: 1,
          minFaceDetectionConfidence: 0.3,
          minFacePresenceConfidence: 0.3,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        };
        const create = (delegate: "GPU" | "CPU") =>
          vision.FaceLandmarker.createFromOptions(files, { baseOptions: { ...model, delegate }, ...shared });
        try {
          return await create("GPU");
        } catch {
          return await create("CPU");
        }
      } catch {
        return null;
      }
    })();
  }
  return videoMarker;
}

function frameCopy(video: HTMLVideoElement, sample: HTMLCanvasElement) {
  const sw = video.videoWidth;
  const sh = video.videoHeight;
  if (!sw || !sh) return null;
  const fit = MAX_CANVAS / Math.max(sw, sh);
  const width = Math.max(1, Math.round(sw * fit));
  const height = Math.max(1, Math.round(sh * fit));
  if (sample.width !== width) sample.width = width;
  if (sample.height !== height) sample.height = height;
  const ctx = sample.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return sample;
}

function paint(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  indexes: number[],
  place: (point: { x: number; y: number }) => { x: number; y: number },
  color: string,
  size: number,
  mode: "stroke" | "fill",
) {
  ctx.beginPath();
  indexes.forEach((index, step) => {
    const point = points[index];
    if (!point) return;
    const next = place(point);
    if (step === 0) ctx.moveTo(next.x, next.y);
    else ctx.lineTo(next.x, next.y);
  });
  if (mode === "fill") {
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    return;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function lashTicks(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  indexes: number[],
  place: (point: { x: number; y: number }) => { x: number; y: number },
  span: number,
) {
  const spots = indexes.map((index) => points[index]).filter((point): point is { x: number; y: number } => Boolean(point)).map(place);
  if (spots.length < 2) return;
  const length = Math.max(7, span * 0.045);
  ctx.strokeStyle = "rgba(8, 6, 8, 0.92)";
  ctx.lineWidth = Math.max(2, span * 0.012);
  ctx.lineCap = "round";
  spots.forEach((spot, index) => {
    const prev = spots[Math.max(0, index - 1)]!;
    const next = spots[Math.min(spots.length - 1, index + 1)]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const mag = Math.hypot(dx, dy) || 1;
    const px = -dy / mag;
    const py = dx / mag;
    const dir = py > 0 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(spot.x, spot.y);
    ctx.lineTo(spot.x + px * length * dir, spot.y + py * length * dir);
    ctx.stroke();
  });
}

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"loading" | "watching" | "tracking" | "fallback">("loading");

  useEffect(() => {
    if (!video) return;
    let stop = false;
    let raf = 0;
    let last = 0;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (!liveMakeupAllowed(memory)) {
      setNote(FALLBACK);
      setPhase("fallback");
      return;
    }
    setNote("");
    let sawFace = false;
    void marker().then((landmarker) => {
      if (stop) return;
      if (!landmarker) {
        setNote(FALLBACK);
        setPhase("fallback");
        return;
      }
      setPhase("watching");
      const sample = document.createElement("canvas");
      const tick = () => {
        if (stop) return;
        raf = requestAnimationFrame(tick);
        const now = performance.now();
        if (now - last < DETECT_MS || video.readyState < 2) return;
        last = now;
        const canvas = canvasRef.current;
        if (!canvas) return;
        let width = video.clientWidth || video.videoWidth;
        let height = video.clientHeight || video.videoHeight;
        if (!width || !height) return;
        const edge = Math.max(width, height);
        if (edge > MAX_CANVAS) {
          const fit = MAX_CANVAS / edge;
          width = Math.max(1, Math.round(width * fit));
          height = Math.max(1, Math.round(height * fit));
        }
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const ctx = canvas.getContext("2d");
        const shot = frameCopy(video, sample);
        if (!ctx || !shot) return;
        let faces: { x: number; y: number }[][] = [];
        try {
          faces = landmarker.detect(shot).faceLandmarks as { x: number; y: number }[][];
        } catch {
          setNote(FALLBACK);
          setPhase("fallback");
          stop = true;
          return;
        }
        const points = faces[0];
        if (!points) return;
        if (!sawFace) {
          sawFace = true;
          setPhase("tracking");
        }
        ctx.clearRect(0, 0, width, height);
        const place = (point: { x: number; y: number }) => coverPoint(point.x, point.y, video, width, height);
        if (blush) {
          for (const index of [50, 280]) {
            const point = points[index];
            if (!point) continue;
            const spot = place(point);
            const radius = width * 0.08;
            const gradient = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, radius);
            gradient.addColorStop(0, "rgba(214, 96, 110, 0.55)");
            gradient.addColorStop(1, "rgba(214, 96, 110, 0)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(spot.x, spot.y, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (brow) {
          paint(ctx, points, BROW_L, place, "rgba(72, 44, 32, 0.9)", Math.max(3, width * 0.018), "stroke");
          paint(ctx, points, BROW_R, place, "rgba(72, 44, 32, 0.9)", Math.max(3, width * 0.018), "stroke");
        }
        if (kajal) {
          paint(ctx, points, EYE_L, place, "rgba(12, 10, 12, 0.92)", Math.max(2.5, width * 0.014), "stroke");
          paint(ctx, points, EYE_R, place, "rgba(12, 10, 12, 0.92)", Math.max(2.5, width * 0.014), "stroke");
        }
        if (lashes) {
          lashTicks(ctx, points, LASH_L, place, width);
          lashTicks(ctx, points, LASH_R, place, width);
        }
        paint(ctx, points, LIPS, place, lip, 0, "fill");
      };
      raf = requestAnimationFrame(tick);
    });
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
    };
  }, [video, lip, kajal, lashes, blush, brow]);

  return (
    <>
      <canvas ref={canvasRef} data-makeup="live" data-makeup-state={phase} className="pointer-events-none absolute inset-0 h-full w-full" style={{ transform: "scaleX(-1)" }} />
      {note ? <p className="absolute inset-x-4 bottom-36 z-10 text-center text-sm" role="status">{note}</p> : null}
    </>
  );
}
