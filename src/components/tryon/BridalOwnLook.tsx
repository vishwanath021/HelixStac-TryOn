"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { BeforeAfter } from "@/components/tryon/BeforeAfter";
import { BridalLookCard } from "@/components/tryon/BridalLookCard";
import { ConsentSheet } from "@/components/tryon/ConsentSheet";
import { GeneratingLook } from "@/components/tryon/GeneratingLook";
import { LiveStudio } from "@/components/tryon/LiveStudio";
import { usePhotoConsent } from "@/components/tryon/usePhotoConsent";
import { OWN_LOOK_SLOTS, type OwnLookSlotId } from "@/data/bridal-own";
import {
  BRIDAL_MAKEUP,
  bridalStylesFor,
  cardsForStyle,
  defaultBridalStyle,
  type BridalStyleId,
} from "@/data/bridal";
import { captureShouldMirror, visiblePortraitCrop } from "@/lib/capture";
import { guestSessionId } from "@/lib/guest-session";
import type { SalonConfig } from "@/lib/salon";

type Shot = { blob: Blob; url: string };
type Target = "face" | OwnLookSlotId;

function remember(current: Shot | undefined, next: Shot) {
  if (current && current.url.startsWith("blob:")) URL.revokeObjectURL(current.url);
  return next;
}

export function BridalOwnLook({ config }: { config: SalonConfig }) {
  const [face, setFace] = useState<Shot | null>(null);
  const [items, setItems] = useState<Partial<Record<OwnLookSlotId, Shot>>>({});
  const [makeupStyle, setMakeupStyle] = useState<BridalStyleId>(defaultBridalStyle(BRIDAL_MAKEUP));
  const [makeupId, setMakeupId] = useState("makeup-classic-red");
  const [live, setLive] = useState<Target | null>(null);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reveal, setReveal] = useState("");
  const [result, setResult] = useState<{ name: string; before: string; after: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<Target>("face");
  const boxes = useRef<Record<string, HTMLDivElement | null>>({});
  const consent = usePhotoConsent(config.slug, config.defaultLang || "en");
  const makeupCards = cardsForStyle(BRIDAL_MAKEUP, makeupStyle);
  const chosen = BRIDAL_MAKEUP.find((item) => item.id === makeupId) || makeupCards[0];

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stopLive() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setLive(null);
    setCamReady(false);
  }

  function beginLive(target: Target) {
    consent.gate(() => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const devices = navigator.mediaDevices;
      if (!devices?.getUserMedia) {
        setCamError("The camera is not available. You can use a photo instead.");
        return;
      }
      const facing = target === "face" ? "user" : "environment";
      const pending = devices.getUserMedia({ video: { facingMode: facing === "user" ? "user" : { ideal: "environment" } } });
      flushSync(() => {
        setCamError("");
        setCamReady(false);
        setZoom(1);
        setLive(target);
      });
      boxes.current[target]?.scrollIntoView({ block: "center" });
      void pending.then(async (stream) => {
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        streamRef.current = stream;
        await video.play();
        setCamReady(true);
      }).catch(() => {
        stopLive();
        setCamError("Camera permission was denied. Allow the camera for this site, or use a photo.");
      });
    });
  }

  async function fileToShot(file: File) {
    const blob = file.slice(0, file.size, file.type || "image/jpeg");
    return { blob, url: URL.createObjectURL(blob) };
  }

  function openFile(target: Target) {
    consent.gate(() => {
      fileTarget.current = target;
      fileRef.current?.click();
    });
  }

  function storeShot(target: Target, shot: Shot) {
    if (target === "face") {
      setFace((current) => remember(current || undefined, shot));
      setResult(null);
      setReveal("");
      return;
    }
    setItems((current) => ({ ...current, [target]: remember(current[target], shot) }));
    setResult(null);
    setReveal("");
  }

  async function captureLive() {
    const video = videoRef.current;
    if (!video || !live) return;
    const srcW = video.videoWidth || 720;
    const srcH = video.videoHeight || 960;
    const crop = visiblePortraitCrop(srcW, srcH);
    const scale = Math.min(1, 1024 / Math.max(crop.sw, crop.sh));
    const width = Math.max(2, Math.round(crop.sw * scale));
    const height = Math.max(2, Math.round(crop.sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const facing = live === "face" ? "user" : "environment";
    if (captureShouldMirror(facing)) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return;
    const target = live;
    stopLive();
    storeShot(target, { blob, url: URL.createObjectURL(blob) });
  }

  async function generate() {
    if (busy || !face || !chosen) return;
    stopLive();
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("photo", face.blob, "selfie.jpg");
      body.set("slug", config.slug);
      body.set("sessionId", guestSessionId());
      const consentId = (await consent.persist()) || consent.consentId();
      if (consentId) body.set("consentId", consentId);
      body.set("requestId", crypto.randomUUID());
      body.set("makeup", chosen.id);
      for (const slot of OWN_LOOK_SLOTS) {
        const shot = items[slot.id];
        if (shot) body.set(slot.id, shot.blob, `${slot.id}.jpg`);
      }
      const res = await fetch("/api/v1/bridal/own", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "That preview did not finish.");
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("json")) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "That preview did not finish.");
        return;
      }
      const out = URL.createObjectURL(await res.blob());
      setReveal(out);
      setResult({ name: chosen.name, before: face.url, after: out });
    } finally {
      setBusy(false);
    }
  }

  function chooseMakeupStyle(next: BridalStyleId) {
    setMakeupStyle(next);
    const shown = cardsForStyle(BRIDAL_MAKEUP, next);
    if (!shown.some((card) => card.id === makeupId) && shown[0]) setMakeupId(shown[0].id);
  }

  return (
    <div data-own="flow" className="grid gap-4">
      <ConsentSheet open={consent.open} onAgree={() => void consent.agree()} onClose={consent.close} />
      <div data-step="selfie">
        <p className="mb-2 text-sm font-medium">1. Your selfie</p>
        <p className="mb-2 text-sm">Face the light. Keep your whole face inside the outline. No sunglasses.</p>
        <PhotoBox
          boxRef={(node) => { boxes.current.face = node; }}
          name="own-face"
          alt="Your selfie"
          shot={face}
          live={live === "face"}
          reveal={reveal}
          showOutline={!busy && !reveal}
          onLive={() => beginLive("face")}
          onUpload={() => openFile("face")}
          camera={live === "face" ? (
            <LiveStudio
              videoRef={videoRef}
              ready={camReady}
              facing="user"
              guide="face"
              zoom={zoom}
              onZoom={setZoom}
              onBack={stopLive}
              onClose={stopLive}
              onShutter={captureLive}
              onRetake={() => beginLive("face")}
              onUpload={() => { stopLive(); openFile("face"); }}
            />
          ) : null}
          loading={busy ? <GeneratingLook tool="bridal-own" blur={false} /> : null}
          liveLabel="Live makeup"
        />
      </div>

      <div data-step="items">
        <p className="mb-2 text-sm font-medium">2. Your items</p>
        <p className="mb-3 text-sm text-muted">Optional. Photograph the piece on its own. These photos are deleted after the preview and are never published.</p>
        <div className="grid gap-4">
          {OWN_LOOK_SLOTS.map((slot) => (
            <div key={slot.id} data-item={slot.id}>
              <p className="mb-2 text-sm font-medium">{slot.label}</p>
              <PhotoBox
                boxRef={(node) => { boxes.current[slot.id] = node; }}
                name={slot.id}
                alt={slot.label}
                shot={items[slot.id]}
                live={live === slot.id}
                reveal=""
                showOutline={false}
                onLive={() => beginLive(slot.id)}
                onUpload={() => openFile(slot.id)}
                camera={live === slot.id ? (
                  <LiveStudio
                    videoRef={videoRef}
                    ready={camReady}
                    facing="environment"
                    guide="hand"
                    zoom={zoom}
                    onZoom={setZoom}
                    onBack={stopLive}
                    onClose={stopLive}
                    onShutter={captureLive}
                    onRetake={() => beginLive(slot.id)}
                    onUpload={() => { stopLive(); openFile(slot.id); }}
                  />
                ) : null}
                liveLabel="Take photo"
              />
            </div>
          ))}
        </div>
      </div>

      <div data-step="makeup">
        <p className="mb-2 text-sm font-medium">3. Makeup</p>
        <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Makeup style">
          {bridalStylesFor(BRIDAL_MAKEUP).map((item) => (
            <button key={item.id} className="chip" type="button" aria-pressed={makeupStyle === item.id} onClick={() => chooseMakeupStyle(item.id)}>{item.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3" role="list" aria-label="Makeup">
          {makeupCards.map((item, index) => (
            <div key={item.id} role="listitem">
              <button type="button" aria-pressed={item.id === makeupId} className={`w-full overflow-hidden rounded-[14px] border bg-[#F3E6D8] text-left shadow-sm ${item.id === makeupId ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`} onClick={() => setMakeupId(item.id)}>
                <BridalLookCard id={item.id} name={item.name} image={item.image} priority={index < 2} />
                <span className="block bg-white px-2 py-2 text-sm font-medium leading-snug">{item.name}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {face && !busy ? (
        <button className="btn sheen" type="button" onClick={() => void generate()}>{result ? "See your look again" : "See your look"}</button>
      ) : null}
      {camError ? <p className="text-sm" role="alert">{camError}</p> : null}
      {error ? <p className="text-sm" role="status">{error}</p> : null}
      {result && !busy ? (
        <div className="grid gap-3">
          <p className="text-center text-xs font-semibold uppercase tracking-wide">Your own look</p>
          <h3 className="text-center font-serif text-2xl">{result.name}</h3>
          <BeforeAfter before={result.before} after={result.after} beforeLabel="Before" afterLabel="After" />
          <p className="text-center text-xs text-muted">A preview for your trial. The salon’s makeup on the day is the real result.</p>
        </div>
      ) : null}
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="image/*"
        data-photo="own"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const target = fileTarget.current;
          void fileToShot(file).then((shot) => storeShot(target, shot));
        }}
      />
    </div>
  );
}

function PhotoBox({
  boxRef,
  name,
  alt,
  shot,
  live,
  reveal,
  showOutline,
  onLive,
  onUpload,
  camera,
  loading,
  liveLabel,
}: {
  boxRef: (node: HTMLDivElement | null) => void;
  name: string;
  alt: string;
  shot?: Shot | null;
  live: boolean;
  reveal: string;
  showOutline: boolean;
  onLive: () => void;
  onUpload: () => void;
  camera: ReactNode;
  loading?: ReactNode;
  liveLabel: string;
}) {
  return (
    <div>
      <div ref={boxRef} data-photo-box={name} className="relative mx-auto aspect-[3/4] max-h-[520px] w-full max-w-sm overflow-hidden rounded-2xl bg-[#F3E6D8]">
        {live ? camera : (
          <>
            {shot ? <img src={shot.url} alt={alt} className="h-full w-full object-cover" /> : null}
            {reveal ? <img src={reveal} alt="" className="gen-reveal absolute inset-0 h-full w-full object-cover" /> : null}
            {loading}
            {showOutline ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
                <div className="h-[68%] w-[56%] rounded-[50%] border-2 border-white/90 shadow-sm" />
              </div>
            ) : null}
            {!shot && !loading ? (
              <div className="absolute inset-0 grid content-center justify-items-center gap-3 px-6">
                <button className="btn sheen min-w-44" type="button" onClick={onLive}>{liveLabel}</button>
                <button className="btn secondary min-w-44" type="button" onClick={onUpload}>Use photo</button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {shot && !loading && !live ? (
        <div className="mx-auto mt-3 grid max-w-sm gap-2">
          <button className="btn sheen" type="button" onClick={onLive}>{liveLabel}</button>
          <button className="btn secondary" type="button" onClick={onUpload}>Use photo</button>
        </div>
      ) : null}
    </div>
  );
}
