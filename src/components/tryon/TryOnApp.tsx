"use client";

import { useEffect, useRef, useState } from "react";
import { LookuviMark } from "@/components/brand/LookuviMark";
import { BeforeAfter } from "@/components/tryon/BeforeAfter";
import { ColourStage } from "@/components/tryon/ColourStage";
import { HairTypePicker } from "@/components/tryon/HairTypePicker";
import { StyleCard } from "@/components/tryon/StyleCard";
import { t } from "@/data/i18n";
import { orderStylesForPicker, suggestStyles, type HairReading } from "@/lib/hair-suitability";
import { captureShouldMirror, visiblePortraitCrop } from "@/lib/capture";
import { classifySkinPhoto } from "@/lib/hand-photo";
import type { SalonConfig } from "@/lib/salon";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";

function pickClass(selected: boolean) {
  return `relative overflow-hidden rounded-[14px] border bg-white text-left shadow-sm ${selected ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`;
}

function PickMark({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="check" aria-hidden="true">✓</span>;
}

type Look = {
  id: string;
  styleId: string;
  styleName: string;
  shadeName: string | null;
  before: string;
  after: string;
  serviceKeys: string[];
  tool: "style" | "brows" | "beard" | "nails";
  demo?: boolean;
};

type TryTool = "colour" | "style" | "brows" | "beard" | "nails";
type Audience = "women" | "men" | "kids";
type Shot = { blob: Blob; url: string; el: HTMLImageElement };

function firstTool(config: SalonConfig, requested?: string): TryTool {
  const allowed: TryTool[] = [];
  if (config.toolStyle) allowed.push("style");
  if (config.toolColour) allowed.push("colour");
  if (config.toolBrows) allowed.push("brows");
  if (config.toolNails) allowed.push("nails");
  if (config.toolBeard) allowed.push("beard");
  if (requested && allowed.includes(requested as TryTool)) return requested as TryTool;
  return allowed[0] ?? "style";
}

function sessionId() {
  const key = "helix_session";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
}

export function TryOnApp({
  config,
  embed = false,
  initialTool,
  initialStyleId,
  initialShadeId,
  salonToken,
  salonMode = false,
  demoMode = false,
}: {
  config: SalonConfig;
  embed?: boolean;
  initialTool?: string;
  initialStyleId?: string;
  initialShadeId?: string;
  salonToken?: string;
  salonMode?: boolean;
  demoMode?: boolean;
}) {
  const lang = config.defaultLang || "en";
  const [sid, setSid] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [faceShot, setFaceShot] = useState<Shot | null>(null);
  const [handShot, setHandShot] = useState<Shot | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [shadeId, setShadeId] = useState(config.shades[0]?.id ?? "");
  const [intensity, setIntensity] = useState(72);
  const [tool, setTool] = useState<TryTool>(firstTool(config, initialTool));
  const [gender, setGender] = useState<Audience>(config.showWomen ? "women" : config.showMen ? "men" : "kids");
  const [styleId, setStyleId] = useState("");
  const [stylePhase, setStylePhase] = useState<"pick" | "result">("pick");
  const [busy, setBusy] = useState(false);
  const [pickedDensity, setPickedDensity] = useState("");
  const [pickedTexture, setPickedTexture] = useState("");
  const [showAllStyles, setShowAllStyles] = useState(false);
  const [hairReading, setHairReading] = useState<HairReading | null>(null);
  const [suggestNote, setSuggestNote] = useState("");
  const [suggestCost, setSuggestCost] = useState("");
  const [suggestBusy, setSuggestBusy] = useState(false);
  const previewLock = useRef(false);
  const [pendingName, setPendingName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState<Look | null>(null);
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "error">("loading");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLElement>(null);
  const consentRef = useRef("");
  const consenting = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    setSid(sessionId());
    if (initialStyleId) return;
    const saved = localStorage.getItem("helix_audience");
    if (saved === "women" && config.showWomen) setGender("women");
    if (saved === "men" && config.showMen) setGender("men");
    if (saved === "kids" && config.showKids) setGender("kids");
  }, [config.showKids, config.showMen, config.showWomen, initialStyleId]);

  useEffect(() => {
    if (initialShadeId && config.shades.some((item) => item.id === initialShadeId)) setShadeId(initialShadeId);
  }, [initialShadeId, config.shades]);

  useEffect(() => {
    if (!initialStyleId) return;
    const style = config.styles.find((item) => item.id === initialStyleId);
    if (style) {
      setGender(style.gender);
      setStyleId(style.id);
      return;
    }
    const known = config.brows.some((item) => item.id === initialStyleId)
      || config.beards.some((item) => item.id === initialStyleId)
      || config.nails.some((item) => item.id === initialStyleId);
    if (known) setStyleId(initialStyleId);
  }, [initialStyleId, config.styles, config.brows, config.beards, config.nails]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const shade = config.shades.find((item) => item.id === shadeId) ?? null;
  const activeShot = tool === "nails" ? handShot : faceShot;
  const styles = config.styles.filter((style) => style.gender === gender);
  const visibleStyles = config.hairPickerOn
    ? orderStylesForPicker(styles, { density: pickedDensity, texture: pickedTexture }, showAllStyles)
    : styles;
  const hairSuggestions = hairReading
    ? suggestStyles(styles, hairReading).map((row) => ({
        id: row.style.id,
        name: row.style.name,
        reason: row.reason,
        serviceKeys: row.style.serviceKeys ?? [],
      }))
    : [];
  const showResult = tool !== "colour" && stylePhase === "result" && active?.tool === tool && !busy;
  const phone = normalizeWhatsAppPhone(config.whatsapp);
  const bookHref = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${config.name}, I would like to book an appointment.`)}`
    : "";
  const chatHref = phone ? `https://wa.me/${phone}` : "";

  function track(eventName: string, props?: Record<string, string | number | boolean | null>) {
    const session = sid || sessionId();
    void fetch("/api/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: config.slug, sessionId: session, events: [{ name: eventName, props }] }),
    }).catch(() => undefined);
  }

  function chooseGender(next: Audience) {
    setGender(next);
    localStorage.setItem("helix_audience", next);
  }

  function needPhoto() {
    setError(t(lang, "addPhotoFirst"));
    frameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function acceptPrivacy(checked: boolean) {
    if (!checked) {
      setAccepted(false);
      consentRef.current = "";
      consenting.current = null;
      return;
    }
    setAccepted(true);
    const session = sid || sessionId();
    if (!sid) setSid(session);
    const job = (async () => {
      const res = await fetch("/api/v1/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: config.slug, sessionId: session, lang, accepted: true, ageGate: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) return null;
      return String(data.id);
    })();
    consenting.current = job;
    const id = await job;
    if (!id) {
      setAccepted(false);
      consentRef.current = "";
      setError(t(lang, "privacyTick"));
      return;
    }
    consentRef.current = id;
    setAccepted(true);
    setError("");
    track("consent_accepted", { lang });
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setCameraReady(false);
    setVideoEl(null);
  }

  async function startCamera(nextFacing = facing) {
    setError("");
    setCameraError("");
    setStylePhase("pick");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t(lang, "cameraError"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: nextFacing }, width: { ideal: 720 }, height: { ideal: 1280 } },
      });
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        setCameraError(t(lang, "cameraError"));
        return;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      setVideoEl(video);
      setCameraOn(true);
      setCameraReady(true);
      setFacing(nextFacing);
      track("camera_started", {});
    } catch {
      stopCamera();
      setCameraError(t(lang, "cameraError"));
    }
  }

  async function classifyHand(blob: Blob) {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      bitmap.close();
      return "unclear" as const;
    }
    ctx.drawImage(bitmap, 0, 0, 48, 48);
    bitmap.close();
    return classifySkinPhoto(ctx.getImageData(0, 0, 48, 48).data, 48, 48, 4);
  }

  async function applyBlob(blob: Blob) {
    const slot = tool === "nails" ? "hand" : "face";
    if (slot === "hand" && (await classifyHand(blob)) === "face") {
      stopCamera();
      setError(t(lang, "faceNotHand"));
      return;
    }
    const previous = slot === "hand" ? handShot : faceShot;
    if (previous) URL.revokeObjectURL(previous.url);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    stopCamera();
    const shot = { blob, url, el: img };
    if (slot === "hand") setHandShot(shot);
    else setFaceShot(shot);
    setError("");
    setStylePhase("pick");
    track("photo_captured", {});
  }

  async function jpegFromBitmap(bitmap: ImageBitmap) {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  }

  async function loadFile(file: Blob) {
    setError("");
    try {
      const bitmap = await createImageBitmap(file);
      const blob = await jpegFromBitmap(bitmap);
      if (blob) await applyBlob(blob);
      return;
    } catch {
      /* Phone HEIC often cannot be decoded in the browser. The server tries next. */
    }
    const body = new FormData();
    body.set("photo", file);
    const res = await fetch("/api/v1/tryon/prepare-photo", { method: "POST", body });
    if (!res.ok) {
      setError(t(lang, "photoFormat"));
      return;
    }
    try {
      const bitmap = await createImageBitmap(await res.blob());
      const blob = await jpegFromBitmap(bitmap);
      if (blob) await applyBlob(blob);
      else setError(t(lang, "photoFormat"));
    } catch {
      setError(t(lang, "photoFormat"));
    }
  }

  async function shutter() {
    const video = videoRef.current;
    if (!video || !cameraOn) return;
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
    if (captureShouldMirror(facing)) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return;
    await applyBlob(blob);
  }

  function resetForAnotherPhoto() {
    const blobs = new Set<string>();
    const remember = (url?: string) => {
      if (url?.startsWith("blob:")) blobs.add(url);
    };
    remember(faceShot?.url);
    remember(handShot?.url);
    if (active) {
      remember(active.before);
      remember(active.after);
    }
    for (const url of blobs) URL.revokeObjectURL(url);
    setFaceShot(null);
    setHandShot(null);
    setActive(null);
    setStylePhase("pick");
    setStyleId("");
    setHairReading(null);
    setPickedDensity("");
    setPickedTexture("");
    setShowAllStyles(false);
    setSuggestNote("");
    setSuggestCost("");
    setError("");
    setNotice("");
    setPendingName("");
    stopCamera();
    frameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function suggestHair() {
    if (!faceShot) {
      needPhoto();
      return;
    }
    const consent = consentRef.current || (await consenting.current) || "";
    if (!consent) {
      setError(t(lang, "privacyTick"));
      return;
    }
    consentRef.current = consent;
    if (suggestBusy || busy) return;
    setSuggestBusy(true);
    setError("");
    setSuggestNote("");
    try {
      const body = new FormData();
      body.set("photo", faceShot.blob, "selfie.jpg");
      body.set("slug", config.slug);
      body.set("consentId", consent);
      body.set("sessionId", sid || sessionId());
      body.set("gender", gender);
      const res = await fetch("/api/v1/tryon/suggest", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not read that photo.");
        return;
      }
      setHairReading({
        density: data.density,
        texture: data.texture,
        hairline: data.hairline,
        faceShape: data.faceShape,
        confidence: Number(data.confidence),
      });
      setPickedDensity(String(data.density || ""));
      setPickedTexture(String(data.texture || ""));
      setShowAllStyles(false);
      const low = Number(data.confidence) < 0.4;
      setSuggestNote(low ? "Check the hair type." : "");
      setSuggestCost("");
    } finally {
      setSuggestBusy(false);
    }
  }

  function selectLook(chosen: { id: string; name: string; serviceKeys: string[]; tool: Look["tool"] }) {
    setStyleId(chosen.id);
    setTool(chosen.tool);
    setError("");
    const shot = chosen.tool === "nails" ? handShot : faceShot;
    if (!shot) {
      setError(t(lang, chosen.tool === "nails" ? "uploadHand" : "addPhotoFirst"));
      frameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function preview(chosen: { id: string; name: string; serviceKeys: string[]; tool: Look["tool"] }) {
    setStyleId(chosen.id);
    setTool(chosen.tool);
    const shot = chosen.tool === "nails" ? handShot : faceShot;
    if (!shot) {
      setError(t(lang, chosen.tool === "nails" ? "uploadHand" : "addPhotoFirst"));
      frameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const consent = consentRef.current || (await consenting.current) || "";
    if (!consent) {
      setError(t(lang, "privacyTick"));
      return;
    }
    consentRef.current = consent;
    if (previewLock.current || busy) return;
    previewLock.current = true;
    setError("");
    setPendingName(chosen.name);
    setBusy(true);
    try {
      track("generate_requested", { styleId: chosen.id, tool: chosen.tool });
      const body = new FormData();
      body.set("photo", shot.blob, "selfie.jpg");
      body.set("slug", config.slug);
      body.set("styleId", chosen.id);
      body.set("tool", chosen.tool);
      body.set("quality", "standard");
      body.set("consentId", consent);
      body.set("sessionId", sid || sessionId());
      body.set("requestId", crypto.randomUUID());
      if (salonToken) body.set("salonToken", salonToken);
      const res = await fetch("/api/v1/tryon/generate", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: t(lang, "creditsEmpty") }));
        setError(data.message || t(lang, "creditsEmpty"));
        track("generate_failed", { styleId: chosen.id });
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("json")) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || t(lang, "creditsEmpty"));
        return;
      }
      const out = await res.blob();
      const reason = res.headers.get("x-demo-reason") || "";
      const sample = reason === "no-key" || reason === "spend-cap" || reason === "failover" || reason === "placement";
      setNotice(reason === "spend-cap" ? t(lang, "spendCapNote") : "");
      setActive({
        id: res.headers.get("x-tryon-id") || crypto.randomUUID(),
        styleId: chosen.id,
        styleName: chosen.name,
        shadeName: chosen.tool === "style" ? shade?.name ?? null : null,
        before: URL.createObjectURL(shot.blob),
        after: URL.createObjectURL(out),
        serviceKeys: chosen.serviceKeys,
        tool: chosen.tool,
        demo: sample,
      });
      setStylePhase("result");
      frameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      track("generate_succeeded", { styleId: chosen.id });
    } finally {
      previewLock.current = false;
      setBusy(false);
    }
  }

  async function tryLook() {
    if (tool === "colour" || !styleId || busy) return;
    const chosen =
      tool === "style" ? config.styles.find((item) => item.id === styleId)
      : tool === "brows" ? config.brows.find((item) => item.id === styleId)
      : tool === "beard" ? config.beards.find((item) => item.id === styleId)
      : config.nails.find((item) => item.id === styleId);
    if (!chosen) return;
    await preview({ id: chosen.id, name: chosen.name, serviceKeys: chosen.serviceKeys ?? [], tool });
  }

  function pickShade(id: string) {
    setShadeId(id);
    setTool("colour");
    track("colour_selected", { shade: id });
    if (!faceShot && !cameraOn) needPhoto();
  }

  async function book() {
    if (!active) return;
    const res = await fetch("/api/v1/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: config.slug,
        sessionId: sid || sessionId(),
        styleId: active.styleId,
        tool: active.tool,
        shadeId: active.tool === "style" ? shadeId || null : null,
        lang,
        src: embed ? "embed" : "tryon",
      }),
    });
    const data = await res.json();
    if (!data.whatsappUrl) {
      setError(t(lang, "whatsappMissing"));
      return;
    }
    if (embed && window.parent !== window) {
      window.parent.postMessage({ type: "tryon:booked", look: active.styleName }, "*");
    }
    window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
    track("lead_submitted", { look: active.styleName });
  }

  async function downloadLook() {
    if (!active) return;
    const response = await fetch(active.after);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${config.slug}-${active.styleName}.jpg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    track("download", { style: active.styleId });
  }

  const tools: { id: TryTool; label: string; name: string; on: boolean; icon: "style" | "colour" | "brows" | "nails" | "beard" }[] = [
    { id: "style", label: "Style", name: t(lang, "hairStyle"), on: config.toolStyle, icon: "style" },
    { id: "colour", label: "Colour", name: t(lang, "hairColour"), on: config.toolColour, icon: "colour" },
    { id: "brows", label: "Brows", name: t(lang, "brows"), on: config.toolBrows, icon: "brows" },
    { id: "nails", label: "Nails", name: t(lang, "nails"), on: config.toolNails, icon: "nails" },
    { id: "beard", label: "Beard", name: t(lang, "beardChip"), on: config.toolBeard, icon: "beard" },
  ];

  return (
    <div data-salon-mode={salonMode ? "yes" : "no"} className={embed ? "" : "mx-auto max-w-6xl px-4 pb-16 pt-4"}>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {config.logoUrl ? (
            <img src={config.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-[14px] border border-line bg-white object-cover" />
          ) : (
            <LookuviMark className="h-12 w-12 shrink-0" />
          )}
          <h1 className="min-w-0 text-balance font-serif text-xl leading-snug sm:text-2xl">{config.name}</h1>
        </div>
        <div className="flex gap-2">
          <a className="btn brand flex-1 whitespace-nowrap sm:flex-none" href={bookHref || undefined} target="_blank" rel="noreferrer">{t(lang, "bookNow")}</a>
          <a className="btn secondary flex-1 whitespace-nowrap sm:flex-none" href={chatHref || undefined} target="_blank" rel="noreferrer">
            <WhatsAppGlyph />
            {t(lang, "whatsappBtn")}
          </a>
        </div>
      </header>

      {demoMode && <p className="mb-2 text-sm text-muted" role="status">Demo</p>}

      <h2 className="page-title">{t(lang, "pageTitle")}</h2>

      <div className="seg mt-4" role="tablist" aria-label={t(lang, "toolsLabel")}>
        {tools.filter((item) => item.on).map((item) => (
          <button
            key={item.id}
            className="seg-btn"
            type="button"
            role="tab"
            aria-selected={tool === item.id}
            aria-label={item.name}
            onClick={() => { setTool(item.id); setError(""); }}
          >
            <ToolGlyph name={item.icon} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      <div>
      <section ref={frameRef} className="overflow-hidden rounded-[14px] border border-line bg-white shadow-lift" aria-label="Photo">
        {showResult && active ? (
          <div>
            <BeforeAfter before={active.before} after={active.after} beforeLabel={t(lang, "before")} afterLabel={t(lang, "after")} />
            {active.demo && <p className="px-4 py-2 text-center text-sm text-muted" role="status">Demo</p>}
          </div>
        ) : (
          <div className="relative aspect-[3/4]">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              onLoadedData={() => setCameraReady(true)}
              className={cameraOn ? "absolute inset-0 h-full w-full object-cover" : "hidden"}
              style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
            />
            {activeShot && !cameraOn && <img src={activeShot.url} alt="" className="absolute inset-0 h-full w-full object-contain" />}
            {tool === "colour" && (cameraOn || faceShot) && modelStatus !== "error" && (
              <div className="absolute inset-0">
                <ColourStage
                  video={cameraOn ? videoEl : null}
                  image={!cameraOn ? faceShot?.el ?? null : null}
                  shade={shade}
                  intensity={intensity}
                  mirror={cameraOn && facing === "user"}
                  onStatus={setModelStatus}
                />
              </div>
            )}
            {!cameraOn && !activeShot && (
              <div className="absolute inset-0 grid content-center justify-items-center gap-3 px-6">
                <button className="btn min-w-44" type="button" onClick={() => void startCamera(tool === "nails" ? "environment" : "user")}>{t(lang, "takeSelfie")}</button>
                <button className="btn secondary min-w-44" type="button" onClick={() => fileRef.current?.click()}>{t(lang, "uploadPhoto")}</button>
                {cameraError && (
                  <>
                    <p className="text-center text-sm text-[var(--bad)]" role="alert">{cameraError}</p>
                    <button className="btn on-photo min-w-44" type="button" onClick={() => captureRef.current?.click()}>Use the phone camera</button>
                  </>
                )}
              </div>
            )}
            {cameraOn && (
              <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 bg-[#3E304B]/85 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
                <button className="h-[4.5rem] w-[4.5rem] rounded-full border-[5px] border-white/50 bg-white disabled:opacity-50" type="button" aria-label={t(lang, "takePhoto")} disabled={!cameraReady} onClick={() => void shutter()} />
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    className="btn on-photo px-4 py-2 text-sm"
                    type="button"
                    onClick={() => {
                      stopCamera();
                      fileRef.current?.click();
                    }}
                  >
                    {t(lang, "uploadInstead")}
                  </button>
                  <button className="btn on-photo px-4 py-2 text-sm" type="button" onClick={() => stopCamera()}>{t(lang, "back")}</button>
                </div>
              </div>
            )}
            {activeShot && !cameraOn && (
              <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2">
                <button className="btn on-photo px-4 py-2 text-sm" type="button" onClick={() => void startCamera(tool === "nails" ? "environment" : "user")}>{t(lang, "retake")}</button>
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 z-20 grid place-items-center bg-[#3E304B]/80 px-6 text-center text-white" role="status">
                <div className="w-full max-w-xs">
                  <p className="font-serif text-3xl">{t(lang, "styling")}</p>
                  <p className="mt-1 text-sm">{pendingName}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5 shrink-0" checked={accepted} onChange={(event) => void acceptPrivacy(event.target.checked)} />
        <span>
          {t(lang, "privacyLine")}{" "}
          <a className="underline" href="/privacy">Details</a>
        </span>
      </label>

      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="image/*"
        data-photo="gallery"
        aria-label="Choose a selfie file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void loadFile(file);
        }}
      />
      <input
        ref={captureRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="user"
        data-photo="camera"
        aria-label="Take a photo with the camera"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void loadFile(file);
        }}
      />

      {tool === "colour" && faceShot && (
        <label className="mt-3 block px-1 text-sm">
          {t(lang, "intensity")} · {intensity}
          <input className="mt-1 w-full" type="range" min={20} max={100} value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} />
        </label>
      )}
      {error && <p className="mt-3 text-center text-sm text-[var(--bad)]" role="alert">{error}</p>}
      {notice && <p className="mt-3 text-center text-sm" role="status">{notice}</p>}

      {!showResult && tool !== "colour" && styleId && (
        <button className="btn mt-4 w-full" type="button" disabled={busy} onClick={() => void tryLook()}>{t(lang, "tryThisLook")}</button>
      )}
      {showResult && active && (
        <div className="mt-4 grid gap-2">
          <h3 className="text-center font-serif text-2xl">{active.styleName}</h3>
          <button className="btn" type="button" onClick={() => void downloadLook()}>{t(lang, "downloadLook")}</button>
          <button className="btn secondary" type="button" onClick={() => void book()}>{t(lang, "bookLook")}</button>
          <button className="btn secondary" type="button" onClick={() => resetForAnotherPhoto()}>{t(lang, "tryAnotherShort")}</button>
        </div>
      )}
      </div>

      <section ref={gridRef} aria-label={tool === "style" ? t(lang, "styles") : tool === "colour" ? t(lang, "shades") : tool === "brows" ? t(lang, "brows") : tool === "beard" ? t(lang, "beards") : t(lang, "nails")}>
        {tool === "style" && (
          <>
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Style audience">
              {config.showWomen && <button className="chip" type="button" aria-pressed={gender === "women"} onClick={() => chooseGender("women")}>{t(lang, "women")}</button>}
              {config.showMen && <button className="chip" type="button" aria-pressed={gender === "men"} onClick={() => chooseGender("men")}>{t(lang, "men")}</button>}
              {config.showKids && <button className="chip" type="button" aria-pressed={gender === "kids"} onClick={() => chooseGender("kids")}>{t(lang, "kids")}</button>}
            </div>
            <HairTypePicker
              pickerOn={config.hairPickerOn}
              suggestOn={config.hairSuggestOn}
              usesCredits={config.hairSuggestUsesCredits}
              density={pickedDensity}
              texture={pickedTexture}
              showAll={showAllStyles}
              suggestions={hairSuggestions}
              selectedId={styleId}
              busy={busy || suggestBusy}
              note={suggestNote}
              costLine={suggestCost}
              onDensity={setPickedDensity}
              onTexture={setPickedTexture}
              onShowAll={setShowAllStyles}
              onSuggest={() => void suggestHair()}
              onPick={(card) => selectLook({ id: card.id, name: card.name, serviceKeys: card.serviceKeys, tool: "style" })}
            />
            {config.hairPickerOn && (pickedDensity || pickedTexture) && visibleStyles.length === 0 && (
              <p className="mb-2 text-sm">No style photos for that hair type. Turn on Show all.</p>
            )}
            <div className="grid grid-cols-3 gap-3 max-[340px]:grid-cols-2">
              {visibleStyles.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  aria-pressed={style.id === styleId}
                  className={pickClass(style.id === styleId)}
                  disabled={busy} onClick={() => selectLook({ id: style.id, name: style.name, serviceKeys: style.serviceKeys, tool: "style" })}
                >
                  <PickMark on={style.id === styleId} />
                  <StyleCard id={style.id} name={style.name} />
                  <span className="block px-2 py-2 text-center text-sm font-medium">{style.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {tool === "colour" && (
          <div className="grid grid-cols-3 gap-2 max-[340px]:grid-cols-2">
            {config.shades.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === shadeId}
                className={`${pickClass(item.id === shadeId)} p-2 text-center text-sm`}
                onClick={() => pickShade(item.id)}
              >
                <PickMark on={item.id === shadeId} />
                <span className="mx-auto mb-2 block h-16 w-full rounded-xl" style={{ background: item.hex }} />
                {item.name}
              </button>
            ))}
          </div>
        )}

        {tool === "brows" && (
          <div className="grid grid-cols-3 gap-2 max-[340px]:grid-cols-2">
            {config.brows.map((brow) => (
              <button key={brow.id} type="button" aria-pressed={brow.id === styleId} className={pickClass(brow.id === styleId)} disabled={busy} onClick={() => selectLook({ id: brow.id, name: brow.name, serviceKeys: brow.serviceKeys, tool: "brows" })}>
                <PickMark on={brow.id === styleId} />
                <StyleCard id={brow.id} name={brow.name} folder="brows" />
                <span className="block px-2 py-2 text-center text-sm font-medium">{brow.name}</span>
              </button>
            ))}
          </div>
        )}

        {tool === "beard" && (
          <div className="grid grid-cols-3 gap-2 max-[340px]:grid-cols-2">
            {config.beards.map((beard) => (
              <button key={beard.id} type="button" aria-pressed={beard.id === styleId} className={pickClass(beard.id === styleId)} disabled={busy} onClick={() => selectLook({ id: beard.id, name: beard.name, serviceKeys: beard.serviceKeys, tool: "beard" })}>
                <PickMark on={beard.id === styleId} />
                <StyleCard id={beard.id} name={beard.name} folder="beards" />
                <span className="block px-2 py-2 text-center text-sm font-medium">{beard.name}</span>
              </button>
            ))}
          </div>
        )}

        {tool === "nails" && (
          <div className="grid grid-cols-3 gap-2 max-[340px]:grid-cols-2">
            {config.nails.map((nail) => (
              <button key={nail.id} type="button" aria-pressed={nail.id === styleId} className={pickClass(nail.id === styleId)} disabled={busy} onClick={() => selectLook({ id: nail.id, name: nail.name, serviceKeys: nail.serviceKeys, tool: "nails" })}>
                <PickMark on={nail.id === styleId} />
                <StyleCard id={nail.id} name={nail.name} folder="nails" />
                <span className="block px-2 py-2 text-center text-sm font-medium">{nail.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      </div>
      {config.poweredBy && (
        <p className="mt-10 flex items-center justify-center gap-2 text-xs text-muted">
          <LookuviMark className="h-4 w-4" />
          Powered by Lookuvi
        </p>
      )}
    </div>
  );
}

function WhatsAppGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="#1F7A4D">
      <path d="M12 3a9 9 0 0 0-7.8 13.4L3 21l4.7-1.2A9 9 0 1 0 12 3zm5 12.2c-.2.6-1.2 1.1-1.7 1.2-.4.1-.9.2-2.6-.6-2.2-.9-3.6-3.1-3.7-3.2-.1-.2-1-1.3-1-2.5s.6-1.8.9-2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .5.4.2.6.7 1.8.7 1.9.1.2 0 .3-.1.5l-.3.4c-.1.1-.2.2-.1.4.2.3.7 1.1 1.5 1.8 1 .8 1.8 1.1 2.1 1.2.2.1.4.1.5-.1l.4-.5c.1-.2.3-.2.5-.1.2.1 1.4.7 1.6.8.2.1.4.2.4.3.1.2 0 .8-.2 1.3z" />
    </svg>
  );
}

function ToolGlyph({ name }: { name: "style" | "colour" | "brows" | "nails" | "beard" }) {
  const common = { viewBox: "0 0 24 24", className: "h-4 w-4", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true } as const;
  if (name === "colour") {
    return <svg {...common}><circle cx="12" cy="12" r="7" /><circle cx="9" cy="10" r="1" fill="currentColor" /><circle cx="14" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="13" r="1" fill="currentColor" /></svg>;
  }
  if (name === "brows") {
    return <svg {...common}><path d="M4 14c2-4 5-6 8-6s6 2 8 6" strokeLinecap="round" /></svg>;
  }
  if (name === "nails") {
    return <svg {...common}><path d="M8 14V8a2 2 0 0 1 4 0v6M12 14V7a2 2 0 0 1 4 0v7" strokeLinecap="round" /></svg>;
  }
  if (name === "beard") {
    return <svg {...common}><path d="M8 9c0 6 2 9 4 9s4-3 4-9" strokeLinecap="round" /></svg>;
  }
  return <svg {...common}><circle cx="7" cy="8" r="2.2" /><circle cx="16" cy="15" r="2.2" /><path d="M9 9.5 14.5 14" strokeLinecap="round" /></svg>;
}
