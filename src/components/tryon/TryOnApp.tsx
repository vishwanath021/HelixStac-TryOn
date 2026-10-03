"use client";

import { useEffect, useRef, useState } from "react";
import { BeforeAfter } from "@/components/tryon/BeforeAfter";
import { ColourStage } from "@/components/tryon/ColourStage";
import { StyleCard } from "@/components/tryon/StyleCard";
import { t } from "@/data/i18n";
import { classifySkinPhoto } from "@/lib/hand-photo";
import type { SalonConfig } from "@/lib/salon";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";

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
  const [progress, setProgress] = useState(0);
  const [pendingName, setPendingName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState<Look | null>(null);
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "error">("loading");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
    if (!busy) return;
    setProgress(8);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      setProgress(Math.min(92, 8 + Math.round((elapsed / 10000) * 84)));
    }, 200);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const shade = config.shades.find((item) => item.id === shadeId) ?? null;
  const activeShot = tool === "nails" ? handShot : faceShot;
  const styles = config.styles.filter((style) => style.gender === gender);
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

  async function loadFile(file: Blob) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return;
    await applyBlob(blob);
  }

  async function shutter() {
    const video = videoRef.current;
    if (!video || !cameraOn) return;
    const srcW = video.videoWidth || 720;
    const srcH = video.videoHeight || 960;
    const scale = Math.min(1, 1024 / Math.max(srcW, srcH));
    const width = Math.max(2, Math.round(srcW * scale));
    const height = Math.max(2, Math.round(srcH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facing === "user") {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return;
    await applyBlob(blob);
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
    setError("");
    setPendingName(chosen.name);
    setBusy(true);
    track("generate_requested", { styleId: chosen.id, tool: chosen.tool });
    const body = new FormData();
    body.set("photo", shot.blob, "selfie.jpg");
    body.set("slug", config.slug);
    body.set("styleId", chosen.id);
    body.set("tool", chosen.tool);
    body.set("quality", "standard");
    body.set("consentId", consent);
    body.set("sessionId", sid || sessionId());
    if (chosen.tool === "style" && shadeId) body.set("shadeId", shadeId);
    if (salonToken) body.set("salonToken", salonToken);
    const res = await fetch("/api/v1/tryon/generate", { method: "POST", body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: t(lang, "creditsEmpty") }));
      setBusy(false);
      setProgress(0);
      setError(data.message || t(lang, "creditsEmpty"));
      track("generate_failed", { styleId: chosen.id });
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
    setBusy(false);
    setProgress(100);
    setStylePhase("result");
    frameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    track("generate_succeeded", { styleId: chosen.id });
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

  const tools: { id: TryTool; label: string; on: boolean }[] = [
    { id: "style", label: t(lang, "hairStyle"), on: config.toolStyle },
    { id: "colour", label: t(lang, "hairColour"), on: config.toolColour },
    { id: "brows", label: t(lang, "brows"), on: config.toolBrows },
    { id: "nails", label: t(lang, "nails"), on: config.toolNails },
    { id: "beard", label: t(lang, "beardChip"), on: config.toolBeard },
  ];

  return (
    <div style={{ ["--brand" as string]: config.primaryColor, ["--accent" as string]: config.accentColor }} className={embed ? "" : "mx-auto max-w-lg px-4 pb-16 pt-4"}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {config.logoUrl ? (
            <img src={config.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-2xl border border-line bg-white object-cover" />
          ) : (
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--brand)] font-serif text-lg text-white">{config.name.slice(0, 1)}</div>
          )}
          <h1 className="truncate font-serif text-xl leading-tight">{config.name}</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <a className="btn px-3 py-2 text-sm" href={bookHref || undefined} target="_blank" rel="noreferrer">{t(lang, "bookNow")}</a>
          <a className="btn secondary px-3 py-2 text-sm" href={chatHref || undefined} target="_blank" rel="noreferrer">{t(lang, "whatsappBtn")}</a>
        </div>
      </header>

      {demoMode && <p className="mb-2 text-center text-xs text-muted" role="status">{t(lang, "demoNote")}</p>}
      {salonMode && <p className="mb-2 text-center text-xs" role="status">{t(lang, "salonModeOn")}</p>}

      <h2 className="text-center font-serif text-3xl">{t(lang, "pageTitle")}</h2>
      <p className="mt-1 text-center text-sm text-muted">{t(lang, "pageSubtitle")}</p>

      <div className="mt-4 flex flex-wrap justify-center gap-2" role="tablist" aria-label={t(lang, "toolsLabel")}>
        {tools.filter((item) => item.on).map((item) => (
          <button
            key={item.id}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${tool === item.id ? "bg-[#241c16] text-white" : "bg-white text-[#241c16] ring-1 ring-[#e4ddd4]"}`}
            type="button"
            role="tab"
            aria-selected={tool === item.id}
            onClick={() => { setTool(item.id); setError(""); }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section ref={frameRef} className="mt-4 overflow-hidden rounded-[28px] bg-[#14110e] shadow-lg" aria-label="Photo">
        {showResult && active ? (
          <div>
            <BeforeAfter before={active.before} after={active.after} beforeLabel={t(lang, "before")} afterLabel={t(lang, "after")} />
            {active.demo && <p className="bg-[#241c16] px-4 py-3 text-center text-sm leading-6 text-white" role="status">{t(lang, active.tool === "nails" ? "demoNailBanner" : "demoStyleBanner")}</p>}
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
            {activeShot && !cameraOn && <img src={activeShot.url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
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
                {tool === "nails" && <p className="text-center text-lg text-white">{t(lang, "uploadHand")}</p>}
                <button className="btn min-w-44" type="button" onClick={() => void startCamera(tool === "nails" ? "environment" : "user")}>{t(lang, "takeSelfie")}</button>
                <button className="btn secondary min-w-44 bg-white" type="button" onClick={() => fileRef.current?.click()}>{tool === "nails" ? t(lang, "uploadHand") : t(lang, "uploadPhoto")}</button>
                {cameraError && <p className="text-center text-sm text-[#f0c7b0]" role="alert">{cameraError}</p>}
              </div>
            )}
            {cameraOn && (
              <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center bg-gradient-to-t from-black/70 to-transparent pb-4 pt-16">
                <button className="h-[4.5rem] w-[4.5rem] rounded-full border-[5px] border-white/50 bg-white disabled:opacity-50" type="button" aria-label={t(lang, "takePhoto")} disabled={!cameraReady} onClick={() => void shutter()} />
              </div>
            )}
            {activeShot && !cameraOn && (
              <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2">
                <button className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#241c16]" type="button" onClick={() => void startCamera(tool === "nails" ? "environment" : "user")}>{t(lang, "retake")}</button>
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 z-20 grid place-items-center bg-black/60 px-6 text-center text-white" role="status">
                <div className="w-full max-w-xs">
                  <p className="font-serif text-3xl">{t(lang, "styling")}</p>
                  <p className="mt-1 text-sm">{pendingName}</p>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/25">
                    <div className="h-full bg-white" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={accepted} onChange={(event) => void acceptPrivacy(event.target.checked)} />
        <span>{t(lang, "privacyLine")}</span>
      </label>

      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Choose a selfie file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void loadFile(file);
        }}
      />

      {activeShot && !showResult && (
        <p className="mt-3 text-center text-sm">{tool === "colour" ? t(lang, "pickColour") : t(lang, "pickBelow")}</p>
      )}
      {tool === "colour" && faceShot && (
        <label className="mt-3 block px-1 text-sm">
          {t(lang, "intensity")} · {intensity}
          <input className="mt-1 w-full" type="range" min={20} max={100} value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} />
        </label>
      )}
      {error && <p className="mt-3 text-center text-sm text-[var(--bad)]" role="alert">{error}</p>}
      {notice && <p className="mt-3 text-center text-sm" role="status">{notice}</p>}

      {showResult && active && (
        <div className="mt-4 grid gap-2">
          <h3 className="text-center font-serif text-2xl">{active.styleName}</h3>
          <p className="text-center text-sm text-muted">{t(lang, active.tool === "brows" ? "browDisclaimer" : active.tool === "beard" ? "beardDisclaimer" : active.tool === "nails" ? "nailDisclaimer" : "disclaimer")}</p>
          <button className="btn" type="button" onClick={() => void downloadLook()}>{t(lang, "downloadLook")}</button>
          <button className="btn" type="button" onClick={() => void book()}>{t(lang, "bookLook")}</button>
          <button className="btn secondary" type="button" onClick={() => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t(lang, "tryAnotherShort")}</button>
        </div>
      )}

      <section ref={gridRef} className="mt-6" aria-label={tool === "style" ? t(lang, "styles") : tool === "colour" ? t(lang, "shades") : tool === "brows" ? t(lang, "brows") : tool === "beard" ? t(lang, "beards") : t(lang, "nails")}>
        {tool === "style" && (
          <>
            <div className="mb-3 inline-flex flex-wrap gap-1 rounded-full bg-[#241c16] p-1" role="group" aria-label="Style audience">
              {config.showWomen && <button className={`rounded-full px-4 py-2 text-sm font-semibold ${gender === "women" ? "bg-white text-[#241c16]" : "text-white"}`} type="button" aria-pressed={gender === "women"} onClick={() => chooseGender("women")}>{t(lang, "women")}</button>}
              {config.showMen && <button className={`rounded-full px-4 py-2 text-sm font-semibold ${gender === "men" ? "bg-white text-[#241c16]" : "text-white"}`} type="button" aria-pressed={gender === "men"} onClick={() => chooseGender("men")}>{t(lang, "men")}</button>}
              {config.showKids && <button className={`rounded-full px-4 py-2 text-sm font-semibold ${gender === "kids" ? "bg-white text-[#241c16]" : "text-white"}`} type="button" aria-pressed={gender === "kids"} onClick={() => chooseGender("kids")}>{t(lang, "kids")}</button>}
            </div>
            <div className="grid grid-cols-3 gap-2 max-[340px]:grid-cols-2">
              {styles.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  aria-pressed={style.id === styleId}
                  className={`overflow-hidden rounded-2xl border bg-white text-left ${style.id === styleId ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`}
                  onClick={() => void preview({ id: style.id, name: style.name, serviceKeys: style.serviceKeys, tool: "style" })}
                >
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
                className={`rounded-2xl border bg-white p-2 text-center text-sm ${item.id === shadeId ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`}
                onClick={() => pickShade(item.id)}
              >
                <span className="mx-auto mb-2 block h-16 w-full rounded-xl" style={{ background: item.hex }} />
                {item.name}
              </button>
            ))}
          </div>
        )}

        {tool === "brows" && (
          <div className="grid grid-cols-3 gap-2 max-[340px]:grid-cols-2">
            {config.brows.map((brow) => (
              <button key={brow.id} type="button" aria-pressed={brow.id === styleId} className={`overflow-hidden rounded-2xl border bg-white text-left ${brow.id === styleId ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`} onClick={() => void preview({ id: brow.id, name: brow.name, serviceKeys: brow.serviceKeys, tool: "brows" })}>
                <StyleCard id={brow.id} name={brow.name} folder="brows" />
                <span className="block px-2 py-2 text-center text-sm font-medium">{brow.name}</span>
              </button>
            ))}
          </div>
        )}

        {tool === "beard" && (
          <div className="grid grid-cols-3 gap-2 max-[340px]:grid-cols-2">
            {config.beards.map((beard) => (
              <button key={beard.id} type="button" aria-pressed={beard.id === styleId} className={`overflow-hidden rounded-2xl border bg-white text-left ${beard.id === styleId ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`} onClick={() => void preview({ id: beard.id, name: beard.name, serviceKeys: beard.serviceKeys, tool: "beard" })}>
                <StyleCard id={beard.id} name={beard.name} folder="beards" />
                <span className="block px-2 py-2 text-center text-sm font-medium">{beard.name}</span>
              </button>
            ))}
          </div>
        )}

        {tool === "nails" && (
          <div className="grid grid-cols-3 gap-2 max-[340px]:grid-cols-2">
            {config.nails.map((nail) => (
              <button key={nail.id} type="button" aria-pressed={nail.id === styleId} className={`overflow-hidden rounded-2xl border bg-white text-left ${nail.id === styleId ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`} onClick={() => void preview({ id: nail.id, name: nail.name, serviceKeys: nail.serviceKeys, tool: "nails" })}>
                <StyleCard id={nail.id} name={nail.name} folder="nails" />
                <span className="block px-2 py-2 text-center text-sm font-medium">{nail.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
