"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { BeforeAfter } from "@/components/tryon/BeforeAfter";
import { BridalLookCard } from "@/components/tryon/BridalLookCard";
import { ConsentSheet } from "@/components/tryon/ConsentSheet";
import { LiveStudio, StudioRail } from "@/components/tryon/LiveStudio";
import { MakeupStage } from "@/components/tryon/MakeupStage";
import { usePhotoConsent } from "@/components/tryon/usePhotoConsent";
import { captureShouldMirror, visiblePortraitCrop } from "@/lib/capture";
import {
  BRIDAL_EVENTS,
  BRIDAL_FINISHES,
  BRIDAL_HAIR,
  BRIDAL_LOOKS,
  BRIDAL_LIPS,
  BRIDAL_MAKEUP,
  MEHENDI_CARDS,
  MEHENDI_STYLES,
  bridalEventById,
  bridalStylesFor,
  cardsForStyle,
  defaultBridalStyle,
  looksForEvent,
  type BridalEventId,
  type BridalStyleId,
} from "@/data/bridal";
import { guestSessionId } from "@/lib/guest-session";
import type { SalonConfig } from "@/lib/salon";

type SavedLook = {
  id: string;
  lookId: string;
  name: string;
  eventId: string;
  before: string;
  after: string;
  share: string;
  kind: "look" | "mehendi";
};

type Shot = { blob: Blob; url: string };

const MAX_SAVED = 6;

function storageKey(slug: string) {
  return `lookuvi-bridal-${slug}`;
}

function readSaved(slug: string): SavedLook[] {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    const parsed = raw ? JSON.parse(raw) as SavedLook[] : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_SAVED) : [];
  } catch {
    return [];
  }
}

function writeSaved(slug: string, looks: SavedLook[]) {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(looks.slice(0, MAX_SAVED)));
  } catch {
    // The phone may refuse a large photo. The looks still stay on this screen.
  }
}

async function blobUrlToData(url: string) {
  const blob = await fetch(url).then((res) => res.blob());
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(blob);
  });
}

export function BridalFlow({ config }: { config: SalonConfig }) {
  const [eventId, setEventId] = useState<BridalEventId>("wedding");
  const [panel, setPanel] = useState<"looks" | "mehendi" | "saved">("looks");
  const [lookStyle, setLookStyle] = useState<BridalStyleId>(defaultBridalStyle(BRIDAL_LOOKS));
  const [makeupStyle, setMakeupStyle] = useState<BridalStyleId>(defaultBridalStyle(BRIDAL_MAKEUP));
  const [hairStyle, setHairStyle] = useState<BridalStyleId>(defaultBridalStyle(BRIDAL_HAIR));
  const [mehendiCategory, setMehendiCategory] = useState<BridalStyleId>(defaultBridalStyle(MEHENDI_CARDS));
  const [lookId, setLookId] = useState(looksForEvent("wedding")[0]?.id || "");
  const [makeupId, setMakeupId] = useState("makeup-classic-red");
  const [hairId, setHairId] = useState("");
  const [finishId, setFinishId] = useState("hd");
  const [lipId, setLipId] = useState("red");
  const [face, setFace] = useState<Shot | null>(null);
  const [hand, setHand] = useState<Shot | null>(null);
  const [mehendiCardId, setMehendiCardId] = useState("mehendi-bridal");
  const [mehendiStyle, setMehendiStyle] = useState("bridal");
  const [coverage, setCoverage] = useState("full");
  const [mehendiShade, setMehendiShade] = useState("maroon");
  const [density, setDensity] = useState("heavy");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("Reading your photo...");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ name: string; before: string; after: string; share: string; lookId: string; kind: "look" | "mehendi" } | null>(null);
  const [saved, setSaved] = useState<SavedLook[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [bookNote, setBookNote] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const bridalFile = useRef<HTMLInputElement>(null);
  const mehendiFile = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const consent = usePhotoConsent(config.slug, config.defaultLang || "en");
  const [kajal, setKajal] = useState(true);
  const [lashes, setLashes] = useState(true);
  const [blushOn, setBlushOn] = useState(true);
  const [browOn, setBrowOn] = useState(true);
  const [live, setLive] = useState<null | "face" | "hand">(null);
  const [camReady, setCamReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [sliderOn, setSliderOn] = useState(true);
  const [mehendiDone, setMehendiDone] = useState("");
  const [camError, setCamError] = useState("");
  const eventLooks = looksForEvent(eventId);
  const looks = cardsForStyle(eventLooks, lookStyle);
  const makeupCards = cardsForStyle(BRIDAL_MAKEUP, makeupStyle);
  const hairCards = cardsForStyle(BRIDAL_HAIR, hairStyle);
  const mehendiCards = cardsForStyle(MEHENDI_CARDS, mehendiCategory);
  const chosen = looks.find((look) => look.id === lookId) || looks[0];

  useEffect(() => {
    setSaved(readSaved(config.slug));
  }, [config.slug]);

  useEffect(() => {
    if (!result || busy) return;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result, busy]);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const ms = Date.now() - started;
      setStage(ms < 8000 ? "Reading your photo..." : ms < 22000 ? "Styling your look..." : "Almost ready...");
    }, 400);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function fileToShot(file: File) {
    const blob = file.slice(0, file.size, file.type || "image/jpeg");
    return { blob, url: URL.createObjectURL(blob) };
  }

  function mehendiStamp(url: string) {
    return `${url}|${mehendiStyle}|${coverage}|${mehendiShade}|${density}`;
  }

  async function generate(kind: "look" | "mehendi", shot: Shot, overrides?: { finishId?: string; lipId?: string; makeupId?: string; hairId?: string }) {
    if (busy) return;
    setBusy(true);
    setError("");
    setStage("Reading your photo...");
    const finish = overrides?.finishId || finishId;
    const lip = overrides?.lipId || lipId;
    const makeup = overrides?.makeupId ?? makeupId;
    const hair = overrides?.hairId ?? hairId;
    try {
      const body = new FormData();
      body.set("photo", shot.blob, kind === "mehendi" ? "hand.jpg" : "selfie.jpg");
      body.set("slug", config.slug);
      body.set("sessionId", guestSessionId());
      const consentId = (await consent.persist()) || consent.consentId();
      if (consentId) body.set("consentId", consentId);
      body.set("requestId", crypto.randomUUID());
      body.set("tool", kind === "mehendi" ? "mehendi" : "bridal");
      if (kind === "mehendi") {
        body.set("styleId", mehendiStyle);
        body.set("mehendiCard", mehendiCardId);
        body.set("mehendiStyle", mehendiStyle);
        body.set("coverage", coverage);
        body.set("mehendiShade", mehendiShade);
        body.set("density", density);
      } else if (chosen) {
        body.set("styleId", chosen.id);
        body.set("finish", finish);
        body.set("lip", lip);
        if (makeup) body.set("makeup", makeup);
        if (hair) body.set("hair", hair);
        body.set("kajal", kajal ? "1" : "0");
        body.set("lashes", lashes ? "1" : "0");
        body.set("blush", blushOn ? "1" : "0");
        body.set("browTint", browOn ? "1" : "0");
      }
      const res = await fetch("/api/v1/tryon/generate", { method: "POST", body });
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
      const styleName = kind === "mehendi"
        ? `Mehendi · ${MEHENDI_STYLES.find((item) => item.id === mehendiStyle)?.label || "Bridal"}`
        : chosen?.name || "Bridal look";
      if (kind === "mehendi") setMehendiDone(mehendiStamp(shot.url));
      setResult({
        name: styleName,
        before: shot.url,
        after: out,
        share: res.headers.get("x-look-share") || "",
        lookId: kind === "mehendi" ? mehendiStyle : chosen?.id || "",
        kind,
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent() {
    if (!result) return;
    const after = result.after.startsWith("data:") ? result.after : await blobUrlToData(result.after).catch(() => result.after);
    const before = result.before.startsWith("data:") ? result.before : await blobUrlToData(result.before).catch(() => result.before);
    const next: SavedLook = {
      id: crypto.randomUUID(),
      lookId: result.lookId,
      name: result.name,
      eventId,
      before,
      after,
      share: result.share,
      kind: result.kind,
    };
    const trimmed = [next, ...saved.filter((item) => item.id !== next.id)].slice(0, MAX_SAVED);
    setSaved(trimmed);
    writeSaved(config.slug, trimmed);
    setPanel("saved");
  }

  function toggleCompare(id: string) {
    setCompare((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 2) return [current[1], id];
      return [...current, id];
    });
  }

  function share(look: SavedLook) {
    const text = look.share
      ? `Look at this bridal look: ${look.name}. ${look.share}`
      : `Look at this bridal look: ${look.name}.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  async function book() {
    setBookNote("");
    const picked = saved.filter((item) => item.kind === "look");
    const lookIds = picked.length ? [...new Set(picked.map((item) => item.lookId))] : result?.kind === "look" ? [result.lookId] : chosen ? [chosen.id] : [];
    const lookUrls = picked.map((item) => item.share).filter(Boolean);
    if (result?.share && !lookUrls.includes(result.share)) lookUrls.push(result.share);
    const res = await fetch("/api/v1/bridal/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: config.slug,
        sessionId: guestSessionId(),
        name,
        eventId,
        eventDate,
        lookIds: lookIds.slice(0, 6),
        lookUrls: lookUrls.slice(0, 6),
        lang: config.defaultLang || "en",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.whatsappUrl) {
      setBookNote(data.message || "This salon has not added a WhatsApp number yet.");
      return;
    }
    window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
    setBookNote("Sent to the salon on WhatsApp.");
  }

  const compared = compare.map((id) => saved.find((item) => item.id === id)).filter((item) => item !== undefined);
  const event = bridalEventById(eventId);

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

  function beginLive(kind: "face" | "hand") {
    consent.gate(() => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const devices = navigator.mediaDevices;
      if (!devices?.getUserMedia) {
        setCamError("The camera is not available. You can use a photo instead.");
        return;
      }
      const pending = devices.getUserMedia({
        video: { facingMode: kind === "hand" ? { ideal: "environment" } : "user" },
      });
      flushSync(() => {
        setCamError("");
        setCamReady(false);
        setZoom(1);
        setLive(kind);
      });
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
        setCamError("Camera permission was denied. Allow the camera for this site from the address bar, then press Live makeup again.");
      });
    });
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
    if (captureShouldMirror(live === "hand" ? "environment" : "user")) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return;
    const shot = { blob, url: URL.createObjectURL(blob) };
    const kind = live;
    stopLive();
    if (kind === "hand") {
      setHand(shot);
      await generate("mehendi", shot);
    } else {
      setFace(shot);
      await generate("look", shot);
    }
  }

  function pickMakeup(id: string) {
    const card = BRIDAL_MAKEUP.find((item) => item.id === id);
    if (!card) return;
    setMakeupId(card.id);
    setLipId(card.lipId);
    setFinishId(card.finishId);
    if (face && result?.kind === "look" && result.lookId === chosen?.id) {
      void generate("look", face, { finishId: card.finishId, lipId: card.lipId, makeupId: card.id });
    }
  }

  function pickHair(id: string) {
    const next = hairId === id ? "" : id;
    setHairId(next);
    if (face && result?.kind === "look" && result.lookId === chosen?.id) {
      void generate("look", face, { hairId: next });
    }
  }

  function pickMehendi(id: string) {
    const card = MEHENDI_CARDS.find((item) => item.id === id);
    if (!card) return;
    setMehendiCardId(card.id);
    setMehendiStyle(card.styleId);
    setCoverage(card.coverageId);
    setMehendiShade(card.shadeId);
    setDensity(card.densityId);
  }

  function chooseLookStyle(next: BridalStyleId) {
    setLookStyle(next);
    const shown = cardsForStyle(looksForEvent(eventId), next);
    if (!shown.some((look) => look.id === lookId)) setLookId(shown[0]?.id || "");
  }

  function chooseMakeupStyle(next: BridalStyleId) {
    setMakeupStyle(next);
    const shown = cardsForStyle(BRIDAL_MAKEUP, next);
    if (!shown.some((card) => card.id === makeupId) && shown[0]) pickMakeup(shown[0].id);
  }

  function chooseHairStyle(next: BridalStyleId) {
    setHairStyle(next);
    const shown = cardsForStyle(BRIDAL_HAIR, next);
    if (hairId && !shown.some((card) => card.id === hairId)) pickHair(hairId);
  }

  function chooseMehendiCategory(next: BridalStyleId) {
    setMehendiCategory(next);
    const shown = cardsForStyle(MEHENDI_CARDS, next);
    if (!shown.some((card) => card.id === mehendiCardId) && shown[0]) pickMehendi(shown[0].id);
  }

  const lipHex = BRIDAL_LIPS.find((item) => item.id === lipId)?.hex || "#9B2335";

  return (
    <div data-bridal="flow" data-busy={busy ? "yes" : "no"}>
      <ConsentSheet open={consent.open} onAgree={() => void consent.agree()} onClose={consent.close} />
      {live && (
        <LiveStudio
          videoRef={videoRef}
          ready={camReady}
          facing={live === "hand" ? "environment" : "user"}
          guide={live === "hand" ? "hand" : "face"}
          zoom={zoom}
          onZoom={setZoom}
          onBack={stopLive}
          onClose={stopLive}
          onShutter={captureLive}
          onRetake={() => beginLive(live)}
          onUpload={() => {
            const kind = live;
            stopLive();
            (kind === "hand" ? mehendiFile : bridalFile).current?.click();
          }}
          makeup={live === "face" ? (
            <MakeupStage video={camReady ? videoRef.current : null} lip={lipHex} kajal={kajal} lashes={lashes} blush={blushOn} brow={browOn} />
          ) : null}
          footer={live === "face" ? (
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1 pr-16" role="group" aria-label="Live makeup">
              {BRIDAL_LIPS.map((lip) => (
                <button key={lip.id} type="button" aria-pressed={lipId === lip.id} className="chip shrink-0" onClick={() => setLipId(lip.id)}>
                  <span className="h-4 w-4 rounded-full" style={{ background: lip.hex }} aria-hidden="true" />
                  {lip.name}
                </button>
              ))}
              <button className="chip shrink-0" type="button" aria-pressed={kajal} onClick={() => setKajal((value) => !value)}>Kajal</button>
              <button className="chip shrink-0" type="button" aria-pressed={lashes} onClick={() => setLashes((value) => !value)}>Lashes</button>
              <button className="chip shrink-0" type="button" aria-pressed={blushOn} onClick={() => setBlushOn((value) => !value)}>Blush</button>
              <button className="chip shrink-0" type="button" aria-pressed={browOn} onClick={() => setBrowOn((value) => !value)}>Brows</button>
            </div>
          ) : null}
        />
      )}
      <h2 className="page-title">Bridal</h2>
      <p className="mt-1 text-sm text-muted">Hair, makeup, and jewellery in one look. Then mehendi, and a trial with the salon.</p>
      <div className="seg mt-4" role="tablist" aria-label="Bridal">
        {(["looks", "mehendi", "saved"] as const).map((item) => (
          <button key={item} className="seg-btn" type="button" role="tab" aria-selected={panel === item} onClick={() => setPanel(item)}>
            {item === "looks" ? "Looks" : item === "mehendi" ? "Mehendi" : "My looks"}
          </button>
        ))}
      </div>

      {panel === "looks" && (
        <div className="mt-4 grid gap-4">
          <div data-step="event">
            <p className="mb-2 text-sm font-medium">1. The event</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Event">
              {BRIDAL_EVENTS.map((item) => (
                <button key={item.id} className="chip" type="button" aria-pressed={eventId === item.id} onClick={() => { setEventId(item.id); setLookId(cardsForStyle(looksForEvent(item.id), lookStyle)[0]?.id || ""); }}>{item.label}</button>
              ))}
            </div>
          </div>
          <PhotoGrid step="look" label="2. The look" group="Bridal looks" styles={bridalStylesFor(eventLooks)} style={lookStyle} onStyle={chooseLookStyle} items={looks} value={chosen?.id || ""} onChange={setLookId} />
          <PhotoGrid step="makeup" label="3. Makeup" group="Makeup" styles={bridalStylesFor(BRIDAL_MAKEUP)} style={makeupStyle} onStyle={chooseMakeupStyle} items={makeupCards} value={makeupId} onChange={pickMakeup} />
          <PhotoGrid step="hair" label="4. Hair" hint="Optional. Tap again to leave the look’s own hair." group="Hair" styles={bridalStylesFor(BRIDAL_HAIR)} style={hairStyle} onStyle={chooseHairStyle} items={hairCards} value={hairId} onChange={pickHair} />
          <div data-step="selfie">
            <p className="mb-2 text-sm font-medium">5. Your selfie</p>
            <p className="mb-2 text-sm">Face the light. Keep your whole face inside the outline. No sunglasses.</p>
            <div className="relative mx-auto aspect-[3/4] max-h-[420px] max-w-sm overflow-hidden rounded-2xl bg-[#F3E6D8]">
              {face ? <img src={face.url} alt="Your selfie" className="h-full w-full object-cover" /> : <p className="grid h-full place-items-center px-6 text-center text-sm">Upload a selfie to see this look on you.</p>}
              <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
                <div className="h-[68%] w-[56%] rounded-[50%] border-2 border-white/90 shadow-sm" />
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              <button className={result ? "btn btn-gold" : "btn btn-gold sheen"} type="button" onClick={() => beginLive("face")}>Live makeup</button>
              <button className="btn secondary" type="button" onClick={() => consent.gate(() => bridalFile.current?.click())}>Use photo</button>
              <input ref={bridalFile} className="sr-only" type="file" accept="image/*" data-photo="bridal" onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void fileToShot(file).then((shot) => { setFace(shot); setResult(null); });
              }} />
            </div>
            {camError && panel === "looks" ? <p className="text-sm" role="alert">{camError}</p> : null}
          </div>
          {face && chosen && (!result || result.kind !== "look" || result.lookId !== chosen.id) && (
            <button className="btn" type="button" disabled={busy} onClick={() => void generate("look", face)}>{busy ? stage : `See ${chosen.name}`}</button>
          )}
        </div>
      )}

      {panel === "mehendi" && (
        <div className="mt-4 grid gap-4">
          <PhotoGrid step="mehendi" label="Mehendi" group="Mehendi" styles={bridalStylesFor(MEHENDI_CARDS)} style={mehendiCategory} onStyle={chooseMehendiCategory} items={mehendiCards} value={mehendiCardId} onChange={pickMehendi} />
          <p className="text-sm">Hold your hand flat in good light. Fill the photo with your palm.</p>
          <div className="relative mx-auto aspect-[3/4] max-h-[360px] max-w-sm overflow-hidden rounded-2xl bg-[#F3E6D8]">
            {hand ? <img src={hand.url} alt="Your hand" className="h-full w-full object-cover" /> : <p className="grid h-full place-items-center px-6 text-center text-sm">Upload a photo of your hand.</p>}
          </div>
          <button className={mehendiDone ? "btn" : "btn sheen"} type="button" onClick={() => beginLive("hand")}>Live mehendi</button>
          <button className="btn secondary" type="button" onClick={() => consent.gate(() => mehendiFile.current?.click())}>Use photo</button>
          <input ref={mehendiFile} className="sr-only" type="file" accept="image/*" data-photo="mehendi" onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void fileToShot(file).then((shot) => { setHand(shot); setResult(null); });
          }} />
          {hand && mehendiDone !== mehendiStamp(hand.url) && <button className="btn" type="button" disabled={busy} onClick={() => void generate("mehendi", hand)}>{busy ? stage : "See the mehendi"}</button>}
        </div>
      )}

      {busy && (
        <p className="mt-4 text-center text-sm" role="progressbar" aria-valuetext={stage}>{stage}</p>
      )}
      {error && <p className="mt-3 text-sm" role="status">{error}</p>}

      {result && !busy && panel !== "saved" && (
        <div ref={resultRef} className="mt-4 grid gap-3">
          <p className="text-center text-xs font-semibold uppercase tracking-wide">Real AI look, not a filter</p>
          <h3 className="text-center font-serif text-2xl">{result.name}</h3>
          <div className="relative overflow-hidden rounded-2xl">
            <div style={{ transform: `scale(${zoom})` }}>
              {sliderOn ? (
                <BeforeAfter before={result.before} after={result.after} beforeLabel="Before" afterLabel="After" />
              ) : (
                <img src={result.after} alt="" className="w-full" />
              )}
            </div>
            <StudioRail
              onRetake={() => beginLive(result.kind === "mehendi" ? "hand" : "face")}
              onZoomIn={() => setZoom((value) => Math.min(2, Math.round((value + 0.25) * 100) / 100))}
              onZoomOut={() => setZoom((value) => Math.max(1, Math.round((value - 0.25) * 100) / 100))}
              onCompare={() => setSliderOn((value) => !value)}
              compareOn={sliderOn}
              onDownload={() => {
                const anchor = document.createElement("a");
                anchor.href = result.after;
                anchor.download = "bridal-look.jpg";
                anchor.click();
              }}
              canDownload
            />
          </div>
          <p className="text-center text-xs text-muted">A preview for your trial. The salon’s makeup on the day is the real result.</p>
          {result.kind === "look" && (
            <>
              <OptionRow label="Makeup finish" options={BRIDAL_FINISHES.map((item) => ({ id: item.id, label: item.label }))} value={finishId} onChange={(id) => { setFinishId(id); if (face) void generate("look", face, { finishId: id }); }} />
              <div>
                <p className="mb-2 text-sm font-medium">Lip colour</p>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Lip colour">
                  {BRIDAL_LIPS.map((lip) => (
                    <button key={lip.id} type="button" aria-pressed={lipId === lip.id} className={`flex min-h-11 items-center gap-2 rounded-full border px-2 py-1 text-sm ${lipId === lip.id ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`} onClick={() => { setLipId(lip.id); if (face) void generate("look", face, { lipId: lip.id }); }}>
                      <span className="h-6 w-6 shrink-0 rounded-full border border-black/10" style={{ background: lip.hex }} aria-hidden="true" />
                      {lip.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <button className="btn" type="button" onClick={() => void saveCurrent()}>Save this look</button>
        </div>
      )}

      {panel === "saved" && (
        <div className="mt-4 grid gap-4">
          {saved.length === 0 ? <p className="text-sm">Save a look to compare it and send it to your family.</p> : null}
          <ul className="grid gap-3">
            {saved.map((look) => (
              <li key={look.id} className="card grid grid-cols-[88px_1fr] gap-3 p-3">
                <img src={look.after} alt="" className="h-28 w-full rounded-lg object-cover" />
                <div>
                  <p className="font-medium leading-snug">{look.name}</p>
                  <p className="text-xs text-muted">{bridalEventById(look.eventId)?.label}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="btn secondary" type="button" aria-pressed={compare.includes(look.id)} onClick={() => toggleCompare(look.id)}>{compare.includes(look.id) ? "Comparing" : "Compare"}</button>
                    <button className="btn secondary" type="button" onClick={() => share(look)}>Share with family</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {compared.length === 2 && (
            <div>
              <h3 className="mb-2 font-serif text-xl">Side by side</h3>
              <div className="grid grid-cols-2 gap-2">
                {compared.map((look) => (
                  <figure key={look.id}>
                    <img src={look.after} alt={look.name} className="aspect-[3/4] w-full rounded-xl object-cover" />
                    <figcaption className="mt-1 text-xs leading-snug">{look.name}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
          <form className="card grid gap-3 p-4" onSubmit={(event) => { event.preventDefault(); void book(); }}>
            <h3 className="font-serif text-xl">Book bridal trial</h3>
            <p className="text-sm">For your {event?.label.toLowerCase()}. The salon gets your name, the date, and the looks you saved.</p>
            {config.bridalPackages.length > 0 && (
              <ul className="grid gap-2" aria-label="Bridal packages">
                {config.bridalPackages.map((pack) => (
                  <li key={pack.key} className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{pack.name}</span>
                    <span>₹{pack.priceInr.toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            )}
            <label className="text-sm">Your name
              <input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} autoComplete="name" />
            </label>
            <label className="text-sm">Event date
              <input className="field mt-1" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required />
            </label>
            <button className="btn btn-gold sheen" type="submit">Book bridal trial</button>
            {bookNote && <p className="text-sm" role="status">{bookNote}</p>}
          </form>
        </div>
      )}
    </div>
  );
}

function PhotoGrid({ step, label, hint, group, styles, style, onStyle, items, value, onChange }: { step: string; label: string; hint?: string; group: string; styles: { id: BridalStyleId; label: string }[]; style: BridalStyleId; onStyle: (id: BridalStyleId) => void; items: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div data-step={step}>
      <p className="mb-2 text-sm font-medium">{label}</p>
      {hint ? <p className="mb-2 text-sm text-muted">{hint}</p> : null}
      {styles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label={`${group} style`}>
          {styles.map((item) => (
            <button key={item.id} className="chip" type="button" aria-pressed={style === item.id} onClick={() => onStyle(item.id)}>{item.label}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3" role="list" aria-label={group}>
        {items.map((item) => (
          <div key={item.id} role="listitem">
            <button type="button" aria-pressed={item.id === value} className={`w-full overflow-hidden rounded-[14px] border bg-white text-left shadow-sm ${item.id === value ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`} onClick={() => onChange(item.id)}>
              <BridalLookCard id={item.id} name={item.name} />
              <span className="block px-2 py-2 text-sm font-medium leading-snug">{item.name}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function OptionRow({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((item) => (
          <button key={item.id} className="chip" type="button" aria-pressed={value === item.id} onClick={() => onChange(item.id)}>{item.label}</button>
        ))}
      </div>
    </div>
  );
}
