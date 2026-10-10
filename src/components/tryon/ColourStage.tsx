"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageSegmenter, ImageSegmenterResult } from "@mediapipe/tasks-vision";

type Shade = { hex: string; lift: number; name: string };

function hexToRgb(hex: string) {
  const raw = hex.replace("#", "");
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)] as const;
}

function paintMask(mask: Float32Array, width: number, height: number, hex: string, intensity: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(width, height);
  const [r, g, b] = hexToRgb(hex);
  const scale = intensity / 100;
  for (let i = 0; i < mask.length; i += 1) {
    const alpha = Math.max(0, Math.min(1, (mask[i] - 0.2) / 0.8)) * scale;
    const offset = i * 4;
    image.data[offset] = r;
    image.data[offset + 1] = g;
    image.data[offset + 2] = b;
    image.data[offset + 3] = Math.round(alpha * 255);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const segmenterRef = useRef<ImageSegmenter | null>(null);

  useEffect(() => {
    let cancelled = false;
    onStatus("loading");
    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const files = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const base = { modelAssetPath: "/mediapipe/hair_segmenter.tflite" };
        let segmenter;
        try {
          segmenter = await vision.ImageSegmenter.createFromOptions(files, {
            baseOptions: { ...base, delegate: "GPU" },
            runningMode: video ? "VIDEO" : "IMAGE",
            outputConfidenceMasks: true,
            outputCategoryMask: false,
          });
        } catch {
          segmenter = await vision.ImageSegmenter.createFromOptions(files, {
            baseOptions: { ...base, delegate: "CPU" },
            runningMode: video ? "VIDEO" : "IMAGE",
            outputConfidenceMasks: true,
            outputCategoryMask: false,
          });
        }
        if (cancelled) {
          segmenter.close();
          return;
        }
        segmenterRef.current = segmenter;
        setReady(true);
        onStatus("ready");
      } catch {
        if (!cancelled) onStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      segmenterRef.current?.close();
      segmenterRef.current = null;
    };
  }, [onStatus, video]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const segmenter = segmenterRef.current;
    if (!canvas || !ready || !segmenter) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let last = 0;
    let stopped = false;

    const draw = (source: CanvasImageSource, maskCanvas: HTMLCanvasElement | null, width: number, height: number) => {
      canvas.width = width;
      canvas.height = height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(source, 0, 0, width, height);
      if (!maskCanvas || !shade) return;
      const pass = (op: GlobalCompositeOperation, alpha: number) => {
        ctx.globalCompositeOperation = op;
        ctx.globalAlpha = alpha;
        ctx.drawImage(maskCanvas, 0, 0, width, height);
      };
      pass("color", 0.85);
      pass("soft-light", 0.55);
      pass("screen", shade.lift * (intensity / 100));
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    };

    const fromResult = (result: ImageSegmenterResult) => {
      const hair = result.confidenceMasks?.[1] ?? result.confidenceMasks?.[0];
      if (!hair || !shade) {
        result.close();
        return null;
      }
      const painted = paintMask(hair.getAsFloat32Array(), hair.width, hair.height, shade.hex, intensity);
      result.close();
      return painted;
    };

    const tick = (now: number) => {
      if (stopped) return;
      frame = requestAnimationFrame(tick);
      if (video) {
        if (now - last < 45 || video.readyState < 2) return;
        last = now;
        const width = Math.min(video.videoWidth || 480, 480);
        const height = Math.round(width * ((video.videoHeight || 640) / (video.videoWidth || 480)));
        try {
          const result = segmenter.segmentForVideo(video, now);
          draw(video, fromResult(result), width, height);
        } catch {
          /* keep the last good frame */
        }
        return;
      }
    };

    if (video) {
      frame = requestAnimationFrame(tick);
    } else if (image && image.complete) {
      const width = Math.min(image.naturalWidth || 480, 720);
      const height = Math.round(width * ((image.naturalHeight || 640) / (image.naturalWidth || 480)));
      try {
        const result = segmenter.segment(image);
        draw(image, shade ? fromResult(result) : null, width, height);
        if (!shade) result.close();
      } catch {
        draw(image, null, width, height);
      }
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [image, intensity, ready, shade, video]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full object-cover"
      style={mirror ? { transform: "scaleX(-1)" } : undefined}
      aria-label={shade ? shade.name : "Camera"}
    />
  );
}
