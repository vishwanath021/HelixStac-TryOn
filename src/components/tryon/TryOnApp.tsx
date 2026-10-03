"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BeardThumb } from "@/components/tryon/BeardThumb";
import { BeforeAfter } from "@/components/tryon/BeforeAfter";
import { BrowThumb } from "@/components/tryon/BrowThumb";
import { ColourStage } from "@/components/tryon/ColourStage";
import { NailThumb } from "@/components/tryon/NailThumb";
import { StyleCard } from "@/components/tryon/StyleCard";
import { isLocale, LOCALE_LABELS, t, type Locale } from "@/data/i18n";
import { recommendStyles } from "@/lib/recommendations";
import type { SalonConfig } from "@/lib/salon";

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

function firstTool(config: SalonConfig, requested?: string): TryTool {
  const allowed: TryTool[] = [];
  if (config.toolColour) allowed.push("colour");
  if (config.toolStyle) allowed.push("style");
  if (config.toolBrows) allowed.push("brows");
  if (config.toolBeard) allowed.push("beard");
  if (config.toolNails) allowed.push("nails");
  if (requested && allowed.includes(requested as TryTool)) return requested as TryTool;
  return allowed[0] ?? "colour";
}

function resultKey(kind: Look["tool"], which: "disclaimer" | "book" | "again") {
  const map = {
    brows: { disclaimer: "browDisclaimer", book: "bookBrow", again: "tryAnotherBrow" },
    beard: { disclaimer: "beardDisclaimer", book: "bookBeard", again: "tryAnotherBeard" },
    nails: { disclaimer: "nailDisclaimer", book: "bookNail", again: "tryAnotherNail" },
    style: { disclaimer: "disclaimer", book: "book", again: "tryAnother" },
  } as const;
  return map[kind][which];
}

const FACES = ["oval", "round", "square", "heart", "oblong", "diamond"] as const;
const HAIRS = ["straight", "wavy", "curly", "thick", "thin"] as const;

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
  const initialLang = isLocale(config.defaultLang) ? config.defaultLang : "en";
  const [lang, setLang] = useState<Locale>(initialLang);
  const [sid, setSid] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [age, setAge] = useState(false);
  const [consentId, setConsentId] = useState("");
  const [declined, setDeclined] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoEl, setPhotoEl] = useState<HTMLImageElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [shadeId, setShadeId] = useState(config.shades[0]?.id ?? "");
  const [intensity, setIntensity] = useState(72);
  const [tool, setTool] = useState<TryTool>(firstTool(config, initialTool));
  const [gender, setGender] = useState<"women" | "men" | "kids">(config.showWomen ? "women" : config.showMen ? "men" : "kids");
  const [styleId, setStyleId] = useState("");
  const [stylePhase, setStylePhase] = useState<"pick" | "result">("pick");
  const [quality, setQuality] = useState<"standard" | "hd">("standard");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pendingName, setPendingName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [looks, setLooks] = useState<Look[]>([]);
  const [activeId, setActiveId] = useState("");
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "error">("loading");
  const [face, setFace] = useState<string>("oval");
  const [hair, setHair] = useState<string>("wavy");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [outletId, setOutletId] = useState(config.outlets.find((outlet) => outlet.isPrimary)?.id || config.outlets[0]?.id || "");
  const [feedback, setFeedback] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSid(sessionId());
    document.documentElement.lang = lang;
  }, [lang]);

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
  const styles = config.styles.filter((style) => style.gender === gender);
  const active = looks.find((look) => look.id === activeId) ?? looks[0];
  const suggestions = useMemo(() => recommendStyles(styles, face, hair, 4), [styles, face, hair]);
  const showResult = tool !== "colour" && stylePhase === "result" && active?.tool === tool && !busy;
  const showStudio = (cameraOn || Boolean(photoEl)) && !showResult;

  function track(eventName: string, props?: Record<string, string | number | boolean | null>) {
    if (!sid) return;
    void fetch("/api/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: config.slug, sessionId: sid, events: [{ name: eventName, props }] }),
    }).catch(() => undefined);
  }

  async function agree() {
    setError("");
    if (!age) {
      setError(t(lang, "ageRequired"));
      return;
    }
    const res = await fetch("/api/v1/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: config.slug, sessionId: sid, lang, accepted: true, ageGate: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(t(lang, "consentRequired"));
      return;
    }
    setConsentId(data.id);
    setAccepted(true);
    track("consent_accepted", { lang });
  }

  async function decline() {
    await fetch("/api/v1/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: config.slug, sessionId: sid, lang, accepted: false, ageGate: age }),
    }).catch(() => undefined);
    setDeclined(true);
    track("consent_declined", { lang });
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
      setStylePhase("pick");
      track("camera_started", {});
    } catch {
      stopCamera();
      setCameraError(t(lang, "cameraError"));
    }
  }

  async function applyBlob(blob: Blob, noteSample = false) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    stopCamera();
    setPhotoBlob(blob);
    setPhotoUrl(url);
    setPhotoEl(img);
    setStylePhase("pick");
    track("photo_captured", { sample: noteSample });
  }

  async function loadFile(file: Blob, noteSample = false) {
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
    await applyBlob(blob, noteSample);
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

  function selectTool(next: TryTool) {
    setTool(next);
    setStylePhase(active?.tool === next ? "result" : "pick");
    setError("");
  }

  async function preview(chosen: { id: string; name: string; serviceKeys: string[]; tool: Look["tool"] }) {
    if (!consentId) {
      setError(t(lang, "consentRequired"));
      return;
    }
    setStyleId(chosen.id);
    setError("");
    let blob = photoBlob;
    if (!blob && videoRef.current && cameraOn) {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(video.videoWidth || 720, 1024);
      canvas.height = Math.round(canvas.width * ((video.videoHeight || 960) / (video.videoWidth || 720)));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (blob) await applyBlob(blob);
    }
    if (!blob) {
      setError(t(lang, "captureFirst"));
      setTool(chosen.tool);
      return;
    }
    setPendingName(chosen.name);
    setBusy(true);
    setTool(chosen.tool);
    track("generate_requested", { styleId: chosen.id, quality, tool: chosen.tool });
    const body = new FormData();
    body.set("photo", blob, "selfie.jpg");
    body.set("slug", config.slug);
    body.set("styleId", chosen.id);
    body.set("tool", chosen.tool);
    body.set("quality", quality);
    body.set("consentId", consentId);
    body.set("sessionId", sid);
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
    const sample = reason === "no-key" || reason === "spend-cap" || reason === "failover" || (res.headers.get("x-provider") || "").includes("mock");
    const styleDemo = sample && chosen.tool === "style";
    const userUrl = URL.createObjectURL(blob);
    setNotice(reason === "spend-cap" ? t(lang, "spendCapNote") : styleDemo ? t(lang, "demoStyleBanner") : "");
    const after = URL.createObjectURL(out);
    const look: Look = {
      id: res.headers.get("x-tryon-id") || crypto.randomUUID(),
      styleId: chosen.id,
      styleName: chosen.name,
      shadeName: chosen.tool === "style" ? shade?.name ?? null : null,
      before: styleDemo ? userUrl : sample ? "/samples/demo-before.jpg" : userUrl,
      after,
      serviceKeys: chosen.serviceKeys,
      tool: chosen.tool,
      demo: styleDemo,
    };
    setLooks((current) => [look, ...current.filter((item) => item.styleId !== look.styleId)].slice(0, 4));
    setActiveId(look.id);
    setBusy(false);
    setProgress(100);
    setStylePhase("result");
    track("generate_succeeded", { styleId: chosen.id, quality });
  }

  async function book(shareOnly = false) {
    if (!active) return;
    if (!shareOnly && config.requireLoginToBook) {
      const params = new URLSearchParams({ book: "1", look: active.styleName, styleId: active.styleId, tool: active.tool });
      window.location.assign(`/s/${config.slug}/me?${params.toString()}`);
      return;
    }
    const res = await fetch("/api/v1/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: config.slug,
        sessionId: sid,
        styleId: active.styleId,
        tool: active.tool,
        shadeId: active.tool === "style" ? shadeId || null : null,
        lang,
        name: name || null,
        phone: phone || null,
        src: embed ? "embed" : "tryon",
        outletId: outletId || null,
      }),
    });
    const data = await res.json();
    if (!data.whatsappUrl) {
      setError(t(lang, "whatsappMissing"));
      return;
    }
    if (embed && window.parent !== window) {
      window.parent.postMessage({ type: "tryon:booked", look: active.styleName, shareOnly }, "*");
    }
    window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
    track(shareOnly ? "share_whatsapp" : "lead_submitted", { look: active.styleName });
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

  async function ask() {
    if (!question.trim()) return;
    const res = await fetch("/api/v1/concierge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: config.slug, message: question, lang }),
    });
    const data = await res.json();
    setAnswer(data.answer || "");
  }

  function openFile() {
    fileRef.current?.click();
  }

  return (
    <div style={{ ["--brand" as string]: config.primaryColor, ["--accent" as string]: config.accentColor }} className={embed ? "" : "mx-auto max-w-lg px-4 pb-16 pt-4"}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {config.logoUrl ? (
            <img src={config.logoUrl} alt="" className="h-11 w-11 rounded-2xl border border-line bg-white object-cover" />
          ) : (
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--brand)] font-serif text-lg text-white">{config.name.slice(0, 1)}</div>
          )}
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted">{t(lang, "heroKicker")}</p>
            <h1 className="font-serif text-xl leading-tight">{config.name}</h1>
          </div>
        </div>
        <label className="text-xs text-muted">
          <span className="sr-only">{t(lang, "language")}</span>
          <select className="field py-1" value={lang} aria-label={t(lang, "language")} onChange={(event) => setLang(event.target.value as Locale)}>
            {config.languages.filter(isLocale).map((code) => (
              <option key={code} value={code}>{LOCALE_LABELS[code]}</option>
            ))}
          </select>
        </label>
      </header>

      {demoMode && <p className="mb-3 rounded-2xl bg-[#241c16] px-3 py-2 text-center text-sm text-white" role="status">{t(lang, "demoBanner")}</p>}
      {salonMode && <p className="mb-3 rounded-2xl bg-[#241c16] px-3 py-2 text-center text-xs text-white" role="status">{t(lang, "salonModeOn")}</p>}

      {config.status === "SUSPENDED" ? (
        <p className="card p-4 text-sm" role="status">{t(lang, "salonSuspended")}</p>
      ) : !accepted ? (
        <section className="card p-5" aria-labelledby="consent-title">
          <h2 id="consent-title" className="font-serif text-2xl">{t(lang, "consentTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{t(lang, "heroBody")}</p>
          <ul className="mt-3 space-y-2 text-sm leading-6">
            <li>{t(lang, "consentPurpose")}</li>
            <li>{t(lang, "consentStorage")}</li>
            <li>{t(lang, "consentDeletion")}</li>
            <li>{t(lang, "consentWithdraw")}</li>
            <li>{t(lang, "consentProcessor")}</li>
          </ul>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={age} onChange={(event) => setAge(event.target.checked)} />
            <span>{t(lang, "consentAge")}</span>
          </label>
          {error && <p className="mt-3 text-sm text-[var(--bad)]" role="alert">{error}</p>}
          {declined && <p className="mt-3 text-sm" role="status">{t(lang, "declined")}</p>}
          <div className="mt-4 flex gap-2">
            <button className="btn" type="button" onClick={() => void agree()}>{t(lang, "consentAccept")}</button>
            <button className="btn secondary" type="button" onClick={() => void decline()}>{t(lang, "consentDecline")}</button>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          <section className="text-center">
            <h2 className="font-serif text-3xl leading-tight">{t(lang, "heroTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{t(lang, "heroBody")}</p>
            <div className="mx-auto mt-4 inline-flex max-w-full flex-wrap justify-center gap-1 rounded-full bg-[#241c16] p-1" role="tablist" aria-label={t(lang, "toolsLabel")}>
              {config.toolColour && (
                <button className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.14em] ${tool === "colour" ? "bg-white text-[#241c16]" : "text-white"}`} type="button" role="tab" aria-selected={tool === "colour"} onClick={() => selectTool("colour")}>{t(lang, "colourTab")}</button>
              )}
              {config.toolStyle && (
                <button className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.14em] ${tool === "style" ? "bg-white text-[#241c16]" : "text-white"}`} type="button" role="tab" aria-selected={tool === "style"} onClick={() => selectTool("style")}>{t(lang, "styleTab")}</button>
              )}
              {config.toolBrows && (
                <button className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.14em] ${tool === "brows" ? "bg-white text-[#241c16]" : "text-white"}`} type="button" role="tab" aria-selected={tool === "brows"} onClick={() => selectTool("brows")}>{t(lang, "browsTab")}</button>
              )}
              {config.toolBeard && (
                <button className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.14em] ${tool === "beard" ? "bg-white text-[#241c16]" : "text-white"}`} type="button" role="tab" aria-selected={tool === "beard"} onClick={() => selectTool("beard")}>{t(lang, "beardTab")}</button>
              )}
              {config.toolNails && (
                <button className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.14em] ${tool === "nails" ? "bg-white text-[#241c16]" : "text-white"}`} type="button" role="tab" aria-selected={tool === "nails"} onClick={() => selectTool("nails")}>{t(lang, "nailsTab")}</button>
              )}
            </div>
            <p className="mt-3 text-xs">
              <a className="underline" href={`/s/${config.slug}/guide`}>{t(lang, "guideLink")}</a>
              {" · "}
              <a className="underline" href={`/s/${config.slug}/me`}>{t(lang, "hubLink")}</a>
            </p>
          </section>

          <section className="overflow-hidden rounded-[28px] bg-[#14110e] shadow-lg">
            {showResult && active ? (
              <div>
                <BeforeAfter before={active.before} after={active.after} beforeLabel={t(lang, "before")} afterLabel={t(lang, "after")} />
                {active.demo && (
                  <p className="bg-[#241c16] px-4 py-3 text-center text-sm leading-6 text-white" role="status">{t(lang, "demoStyleBanner")}</p>
                )}
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
                {photoUrl && !cameraOn && (
                  <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
                {showStudio && modelStatus !== "error" && (
                  <div className="absolute inset-0">
                    <ColourStage
                      video={cameraOn ? videoEl : null}
                      image={!cameraOn ? photoEl : null}
                      shade={tool === "colour" ? shade : null}
                      intensity={intensity}
                      mirror={cameraOn && facing === "user"}
                      onStatus={setModelStatus}
                    />
                  </div>
                )}
                {!cameraOn && !photoUrl && (
                  <div className="absolute inset-0 grid place-items-center px-8 text-center text-[#f6efe6]">
                    <div>
                      <p className="text-sm leading-6">{t(lang, tool === "nails" ? "nailCameraHint" : "mirrorHint")}</p>
                      {cameraError && <p className="mt-3 text-sm text-[#f0c7b0]" role="alert">{cameraError}</p>}
                      <button className="btn mt-5 min-w-44" type="button" onClick={() => void startCamera(tool === "nails" ? "environment" : "user")}>{t(lang, "startCamera")}</button>
                      <div className="mt-3">
                        <button className="text-sm font-medium text-white underline underline-offset-4" type="button" onClick={openFile}>{t(lang, "uploadPhoto")}</button>
                      </div>
                    </div>
                  </div>
                )}
                {(cameraOn || photoUrl) && (
                  <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 pb-3 pt-16">
                    {cameraOn && (
                      <div className="mb-3 flex flex-col items-center">
                        <button
                          className="h-[4.5rem] w-[4.5rem] rounded-full border-[5px] border-white/50 bg-white shadow-lg disabled:opacity-50"
                          type="button"
                          aria-label={t(lang, "takePhoto")}
                          disabled={!cameraReady}
                          onClick={() => void shutter()}
                        />
                        <p className="mt-2 text-center text-xs text-white">{t(lang, "shutterHint")}</p>
                      </div>
                    )}
                    <div className="mb-2 flex items-center justify-center gap-3 text-xs text-white">
                      <button className="rounded-full bg-white/15 px-3 py-1 font-medium" type="button" onClick={openFile}>{t(lang, "photoControl")}</button>
                      {photoUrl && !cameraOn && (
                        <button className="rounded-full bg-white/15 px-3 py-1 font-medium" type="button" onClick={() => void startCamera(facing)}>{t(lang, "backToLive")}</button>
                      )}
                      {cameraOn && (
                        <button className="rounded-full bg-white/15 px-3 py-1 font-medium" type="button" onClick={() => void startCamera(facing === "user" ? "environment" : "user")}>{t(lang, "flipCamera")}</button>
                      )}
                    </div>
                    {tool === "colour" && (
                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {config.shades.map((item) => (
                          <button
                            key={item.id}
                            className="grid w-16 shrink-0 justify-items-center gap-1 text-[10px] leading-tight text-white"
                            type="button"
                            aria-pressed={item.id === shadeId}
                            onClick={() => { setShadeId(item.id); track("colour_selected", { shade: item.id }); }}
                          >
                            <span className="swatch" style={{ background: item.hex }} aria-pressed={item.id === shadeId} />
                            {item.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {modelStatus === "loading" && showStudio && (
                  <p className="absolute left-3 right-3 top-3 z-10 rounded-xl bg-black/60 px-3 py-2 text-xs text-white">{t(lang, "modelLoading")}</p>
                )}
                {modelStatus === "error" && (cameraOn || photoUrl) && (
                  <p className="absolute left-3 right-3 top-3 z-10 rounded-xl bg-black/70 px-3 py-2 text-xs text-white">{t(lang, "modelError")}</p>
                )}
                {busy && (
                  <div className="absolute inset-0 z-20 grid place-items-center bg-black/60 px-6 text-center text-white" role="status">
                    <div className="w-full max-w-xs">
                      <p className="font-serif text-3xl">{tool === "style" ? t(lang, "styling") : t(lang, "progress")}</p>
                      <p className="mt-1 text-sm">{pendingName}</p>
                      <p className="mt-1 text-xs text-white/80">{t(lang, "usually")}</p>
                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/25">
                        <div className="h-full bg-white" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

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

          {tool === "colour" && (cameraOn || photoUrl) && (
            <label className="block px-1 text-sm">
              {t(lang, "intensity")} · {intensity}
              <input className="mt-1 w-full" type="range" min={20} max={100} value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} />
              <span className="mt-1 block text-xs text-muted">{t(lang, "colourOnDevice")} {t(lang, "colourFree")}</span>
            </label>
          )}

          {!cameraOn && !photoUrl && (
            <p className="text-center text-xs text-muted">
              <button className="underline" type="button" onClick={() => fetch("/samples/portrait.jpg").then((res) => res.blob()).then((blob) => loadFile(blob, true))}>{t(lang, "useSample")}</button>
              {" · "}
              {t(lang, "sampleNote")}
            </p>
          )}

          {tool !== "colour" && !photoBlob && !cameraOn && (
            <p className="text-center text-sm text-muted">{t(lang, "captureFirst")}</p>
          )}

          {tool === "style" && photoBlob && stylePhase === "pick" && !busy && (
            <section className="card p-4" aria-label={t(lang, "styles")}>
              <div className="mb-3 inline-flex flex-wrap gap-1 rounded-full bg-[#241c16] p-1" role="group" aria-label="Style audience">
                {config.showWomen && <button className={`rounded-full px-4 py-2 text-sm font-semibold ${gender === "women" ? "bg-white text-[#241c16]" : "text-white"}`} type="button" aria-pressed={gender === "women"} onClick={() => setGender("women")}>{t(lang, "women")}</button>}
                {config.showMen && <button className={`rounded-full px-4 py-2 text-sm font-semibold ${gender === "men" ? "bg-white text-[#241c16]" : "text-white"}`} type="button" aria-pressed={gender === "men"} onClick={() => setGender("men")}>{t(lang, "men")}</button>}
                {config.showKids && <button className={`rounded-full px-4 py-2 text-sm font-semibold ${gender === "kids" ? "bg-white text-[#241c16]" : "text-white"}`} type="button" aria-pressed={gender === "kids"} onClick={() => setGender("kids")}>{t(lang, "kids")}</button>}
              </div>
              {gender === "kids" && <p className="mb-3 text-xs text-muted">{t(lang, "kidsNote")}</p>}
              <label className="mb-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={quality === "hd"} onChange={(event) => setQuality(event.target.checked ? "hd" : "standard")} />
                {t(lang, "generateHd")}
                <span className="text-xs text-muted">{t(lang, "hdNote")}</span>
              </label>
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
            </section>
          )}

          {tool === "brows" && photoBlob && stylePhase === "pick" && !busy && (
            <section className="card p-4" aria-label={t(lang, "brows")}>
              <p className="mb-3 text-sm leading-6">{t(lang, "browHint")}</p>
              <label className="mb-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={quality === "hd"} onChange={(event) => setQuality(event.target.checked ? "hd" : "standard")} />
                {t(lang, "generateHd")}
                <span className="text-xs text-muted">{t(lang, "hdNote")}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {config.brows.map((brow) => (
                  <button
                    key={brow.id}
                    type="button"
                    aria-pressed={brow.id === styleId}
                    className={`overflow-hidden rounded-2xl border bg-white text-left ${brow.id === styleId ? "border-[var(--brand)]" : "border-line"}`}
                    onClick={() => void preview({ id: brow.id, name: brow.name, serviceKeys: brow.serviceKeys, tool: "brows" })}
                  >
                    <div className="aspect-[4/3]"><BrowThumb name={brow.name} /></div>
                    <span className="block px-2 py-2 text-sm font-medium">{brow.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {tool === "beard" && photoBlob && stylePhase === "pick" && !busy && (
            <section className="card p-4" aria-label={t(lang, "beards")}>
              <p className="mb-3 text-sm leading-6">{t(lang, "beardHint")}</p>
              <label className="mb-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={quality === "hd"} onChange={(event) => setQuality(event.target.checked ? "hd" : "standard")} />
                {t(lang, "generateHd")}
                <span className="text-xs text-muted">{t(lang, "hdNote")}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {config.beards.map((beard) => (
                  <button
                    key={beard.id}
                    type="button"
                    aria-pressed={beard.id === styleId}
                    className={`overflow-hidden rounded-2xl border bg-white text-left ${beard.id === styleId ? "border-[var(--brand)]" : "border-line"}`}
                    onClick={() => void preview({ id: beard.id, name: beard.name, serviceKeys: beard.serviceKeys, tool: "beard" })}
                  >
                    <div className="aspect-[4/3]"><BeardThumb name={beard.name} /></div>
                    <span className="block px-2 py-2 text-sm font-medium">{beard.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {tool === "nails" && photoBlob && stylePhase === "pick" && !busy && (
            <section className="card p-4" aria-label={t(lang, "nails")}>
              <p className="mb-3 text-sm leading-6">{t(lang, "nailHint")}</p>
              <label className="mb-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={quality === "hd"} onChange={(event) => setQuality(event.target.checked ? "hd" : "standard")} />
                {t(lang, "generateHd")}
                <span className="text-xs text-muted">{t(lang, "hdNote")}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {config.nails.map((nail) => (
                  <button
                    key={nail.id}
                    type="button"
                    aria-pressed={nail.id === styleId}
                    className={`overflow-hidden rounded-2xl border bg-white text-left ${nail.id === styleId ? "border-[var(--brand)]" : "border-line"}`}
                    onClick={() => void preview({ id: nail.id, name: nail.name, serviceKeys: nail.serviceKeys, tool: "nails" })}
                  >
                    <div className="aspect-[4/3]"><NailThumb name={nail.name} /></div>
                    <span className="block px-2 py-2 text-sm font-medium">{nail.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {showResult && active && (
            <section className="space-y-3">
              <h3 className="text-center font-serif text-2xl">{active.styleName}{active.shadeName ? ` · ${active.shadeName}` : ""}</h3>
              <p className="text-center text-sm leading-6 text-muted">{t(lang, resultKey(active.tool, "disclaimer"))}</p>
              <button className="btn w-full" type="button" onClick={() => void book(false)}>{t(lang, resultKey(active.tool, "book"))}</button>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn secondary" type="button" onClick={() => void downloadLook()}>{t(lang, "download")}</button>
                <button className="btn secondary" type="button" onClick={() => { setStylePhase("pick"); setError(""); }}>{t(lang, resultKey(active.tool, "again"))}</button>
              </div>
              <div className="grid gap-2">
                <input className="field" placeholder={t(lang, "nameOptional")} value={name} onChange={(event) => setName(event.target.value)} aria-label={t(lang, "nameOptional")} />
                <input className="field" placeholder={t(lang, "phoneOptional")} value={phone} onChange={(event) => setPhone(event.target.value)} aria-label={t(lang, "phoneOptional")} />
              </div>
              {config.outlets.length > 1 && (
                <label className="block text-sm">{t(lang, "outlet")}
                  <select className="field mt-1" value={outletId} onChange={(event) => setOutletId(event.target.value)}>
                    {config.outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
                  </select>
                </label>
              )}
              <p className="text-sm">{t(lang, "looksLike")}</p>
              <div className="flex gap-2">
                <button className="btn secondary" type="button" onClick={() => { setFeedback(t(lang, "feedbackThanks")); track("feedback", { up: true }); }}>{t(lang, "yes")}</button>
                <button className="btn secondary" type="button" onClick={() => { setFeedback(t(lang, "feedbackThanks")); track("feedback", { up: false }); }}>{t(lang, "no")}</button>
              </div>
              {feedback && <p className="text-xs" role="status">{feedback}</p>}
            </section>
          )}

          {looks.length > 0 && (
            <section className="card p-4">
              <h2 className="font-serif text-xl">{t(lang, "compare")}</h2>
              <p className="text-xs text-muted">{t(lang, "compareHint")}</p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {looks.map((look) => (
                  <button key={look.id} type="button" className={`overflow-hidden rounded-2xl border ${look.id === active?.id ? "border-[var(--brand)]" : "border-line"}`} onClick={() => { setActiveId(look.id); setTool(look.tool); setStylePhase("result"); }}>
                    <img src={look.after} alt={look.styleName} className="aspect-[3/4] w-full object-cover" />
                    <span className="block px-1 py-1 text-left text-[10px] leading-tight">{look.styleName}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="card p-4">
            <h2 className="font-serif text-xl">{t(lang, "recommendTitle")}</h2>
            <p className="mt-1 text-xs text-muted">{t(lang, "recommendLabel")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs">{t(lang, "faceShape")}
                <select className="field mt-1" value={face} onChange={(event) => setFace(event.target.value)}>
                  {FACES.map((item) => <option key={item} value={item}>{t(lang, item)}</option>)}
                </select>
              </label>
              <label className="text-xs">{t(lang, "hairType")}
                <select className="field mt-1" value={hair} onChange={(event) => setHair(event.target.value)}>
                  {HAIRS.map((item) => <option key={item} value={item}>{t(lang, item)}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((style) => (
                <button key={style.id} className="btn secondary" type="button" onClick={() => { setGender(style.gender); void preview({ id: style.id, name: style.name, serviceKeys: style.serviceKeys, tool: "style" }); }}>{style.name}</button>
              ))}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="font-serif text-xl">{t(lang, "services")}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {config.services.map((service) => (
                <li key={service.id} className="flex justify-between gap-3 border-b border-line py-1">
                  <span>{service.nameI18n[lang] || service.name}</span>
                  <span>₹{service.priceInr.toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
            {!config.address ? null : <p className="mt-3 text-sm">{config.address}</p>}
            <button className="btn secondary mt-3" type="button" disabled={!active} onClick={() => void book(true)}>{t(lang, "share")}</button>
          </section>

          <section className="card p-4">
            <h2 className="font-serif text-xl">{t(lang, "concierge")}</h2>
            <p className="text-xs text-muted">{t(lang, "conciergeHint")}</p>
            <div className="mt-3 flex gap-2">
              <input className="field" value={question} onChange={(event) => setQuestion(event.target.value)} aria-label={t(lang, "ask")} placeholder={t(lang, "ask")} />
              <button className="btn" type="button" onClick={() => void ask()}>{t(lang, "ask")}</button>
            </div>
            {answer && <p className="mt-3 text-sm leading-6" role="status">{answer}</p>}
          </section>

          {notice && !(active?.demo && notice === t(lang, "demoStyleBanner")) && <p className="text-sm" role="status">{notice}</p>}
          {error && <p className="text-sm text-[var(--bad)]" role="alert">{error}</p>}
          {cameraError && (cameraOn || photoUrl) && <p className="text-sm text-[var(--bad)]" role="alert">{cameraError}</p>}
          {config.poweredBy && <p className="text-center text-xs text-muted">{t(lang, "poweredBy")} HelixStac TryOn</p>}
          <p className="text-center text-xs">
            <a className="underline" href="/privacy">{t(lang, "privacy")}</a>
            {" · "}
            <a className="underline" href="/terms">{t(lang, "terms")}</a>
          </p>
        </div>
      )}
    </div>
  );
}
