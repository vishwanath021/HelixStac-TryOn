"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BeforeAfter } from "@/components/tryon/BeforeAfter";
import { ColourStage } from "@/components/tryon/ColourStage";
import { StyleThumb } from "@/components/tryon/StyleThumb";
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
};

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

export function TryOnApp({ config, embed = false }: { config: SalonConfig; embed?: boolean }) {
  const initialLang = isLocale(config.defaultLang) ? config.defaultLang : "en";
  const [lang, setLang] = useState<Locale>(initialLang);
  const [sid, setSid] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [age, setAge] = useState(false);
  const [consentId, setConsentId] = useState("");
  const [declined, setDeclined] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoEl, setPhotoEl] = useState<HTMLImageElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [shadeId, setShadeId] = useState(config.shades[0]?.id ?? "");
  const [intensity, setIntensity] = useState(72);
  const [tab, setTab] = useState<"colour" | "style">("colour");
  const [gender, setGender] = useState<"women" | "men" | "kids">(config.showWomen ? "women" : config.showMen ? "men" : "kids");
  const [styleId, setStyleId] = useState("");
  const [quality, setQuality] = useState<"standard" | "hd">("standard");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
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
    if (!busy) return;
    setProgress(8);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      setProgress(Math.min(90, Math.round((elapsed / 10000) * 90)));
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
  const selected = config.styles.find((style) => style.id === styleId) ?? null;
  const active = looks.find((look) => look.id === activeId) ?? looks[0];
  const suggestions = useMemo(() => recommendStyles(styles, face, hair, 4), [styles, face, hair]);

  function track(name: string, props?: Record<string, string | number | boolean | null>) {
    if (!sid) return;
    void fetch("/api/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: config.slug, sessionId: sid, events: [{ name, props }] }),
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

  async function startCamera(nextFacing = facing) {
    setError("");
    if (!accepted) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: nextFacing, width: { ideal: 960 }, height: { ideal: 1280 } },
      });
      const video = videoRef.current;
      if (!video) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      setVideoEl(video);
      setCameraOn(true);
      setPhotoUrl(null);
      setPhotoBlob(null);
      setPhotoEl(null);
      setFacing(nextFacing);
      track("camera_started", {});
    } catch {
      setError(t(lang, "cameraError"));
    }
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
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
    setVideoEl(null);
    setPhotoBlob(blob);
    setPhotoUrl(url);
    setPhotoEl(img);
    track("photo_captured", { sample: noteSample });
  }

  async function preview() {
    if (!selected || !consentId) {
      setError(t(lang, "consentRequired"));
      return;
    }
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
    }
    if (!blob) {
      setError(t(lang, "captureFirst"));
      return;
    }
    const before = URL.createObjectURL(blob);
    setBusy(true);
    track("generate_requested", { styleId: selected.id, quality });
    const body = new FormData();
    body.set("photo", blob, "selfie.jpg");
    body.set("slug", config.slug);
    body.set("styleId", selected.id);
    body.set("quality", quality);
    body.set("consentId", consentId);
    body.set("sessionId", sid);
    if (shadeId) body.set("shadeId", shadeId);
    const res = await fetch("/api/v1/tryon/generate", { method: "POST", body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: t(lang, "creditsEmpty") }));
      setBusy(false);
      setProgress(0);
      setError(data.message || t(lang, "creditsEmpty"));
      track("generate_failed", { styleId: selected.id });
      return;
    }
    const out = await res.blob();
    const after = URL.createObjectURL(out);
    const look: Look = {
      id: res.headers.get("x-tryon-id") || crypto.randomUUID(),
      styleId: selected.id,
      styleName: selected.name,
      shadeName: shade?.name ?? null,
      before,
      after,
      serviceKeys: selected.serviceKeys,
    };
    setLooks((current) => [look, ...current].slice(0, 4));
    setActiveId(look.id);
    setBusy(false);
    setProgress(100);
    track("generate_succeeded", { styleId: selected.id, quality });
  }

  async function book(shareOnly = false) {
    if (!active) return;
    const res = await fetch("/api/v1/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: config.slug,
        sessionId: sid,
        styleId: active.styleId,
        shadeId: shadeId || null,
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

  const showStudio = accepted && (cameraOn || photoEl);

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

      {!embed && (
        <section className="card mb-4 p-5">
          <h2 className="font-serif text-3xl leading-tight">{t(lang, "heroTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{t(lang, "heroBody")}</p>
          {config.address && <p className="mt-3 text-sm">{config.address}</p>}
        </section>
      )}

      {config.status === "SUSPENDED" ? (
        <p className="card p-4 text-sm" role="status">{t(lang, "salonSuspended")}</p>
      ) : !accepted ? (
        <section className="card p-5" aria-labelledby="consent-title">
          <h2 id="consent-title" className="font-serif text-2xl">{t(lang, "consentTitle")}</h2>
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
          <section className="card overflow-hidden">
            <div className="relative aspect-[3/4] bg-[#1c1612]">
              <video ref={videoRef} playsInline muted autoPlay className={cameraOn && modelStatus !== "ready" ? "absolute inset-0 h-full w-full object-cover" : "hidden"} style={facing === "user" ? { transform: "scaleX(-1)" } : undefined} />
              {photoUrl && !cameraOn && (
                <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              {showStudio && modelStatus !== "error" && (
                <div className="absolute inset-0">
                  <ColourStage
                    video={cameraOn ? videoEl : null}
                    image={!cameraOn ? photoEl : null}
                    shade={tab === "colour" ? shade : null}
                    intensity={intensity}
                    mirror={cameraOn && facing === "user"}
                    onStatus={setModelStatus}
                  />
                </div>
              )}
              {!showStudio && <div className="grid h-full place-items-center px-6 text-center text-sm text-[#f3ece3]">{t(lang, "captureFirst")}</div>}
              {modelStatus === "loading" && showStudio && <p className="absolute bottom-3 left-3 right-3 rounded-xl bg-black/60 px-3 py-2 text-xs text-white">{t(lang, "modelLoading")}</p>}
              {modelStatus === "error" && <p className="absolute bottom-3 left-3 right-3 rounded-xl bg-black/70 px-3 py-2 text-xs text-white">{t(lang, "modelError")}</p>}
              {busy && (
                <div className="absolute inset-0 grid place-items-center bg-black/45 px-6 text-center text-white">
                  <div>
                    <p className="font-serif text-2xl">{t(lang, "progress")}</p>
                    <p className="mt-1 text-sm">{t(lang, "usually")}</p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/30">
                      <div className="h-full bg-white" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 p-3">
              <button className="btn" type="button" onClick={() => void startCamera(facing)}>{t(lang, "startCamera")}</button>
              <button className="btn secondary" type="button" onClick={() => fileRef.current?.click()}>{t(lang, "uploadPhoto")}</button>
              <button className="btn secondary" type="button" onClick={() => fetch("/samples/portrait.jpg").then((res) => res.blob()).then((blob) => loadFile(blob, true))}>{t(lang, "useSample")}</button>
              {cameraOn && (
                <button className="btn ghost" type="button" onClick={() => void startCamera(facing === "user" ? "environment" : "user")}>{t(lang, "flipCamera")}</button>
              )}
              <input ref={fileRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label={t(lang, "uploadPhoto")} onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFile(file);
              }} />
            </div>
            <p className="px-3 pb-3 text-xs text-muted">{t(lang, "colourOnDevice")} {t(lang, "sampleNote")}</p>
          </section>

          <div className="grid grid-cols-2 gap-2" role="tablist">
            <button className={tab === "colour" ? "btn" : "btn secondary"} type="button" role="tab" aria-selected={tab === "colour"} onClick={() => setTab("colour")}>{t(lang, "liveColour")}</button>
            <button className={tab === "style" ? "btn" : "btn secondary"} type="button" role="tab" aria-selected={tab === "style"} onClick={() => setTab("style")}>{t(lang, "styles")}</button>
          </div>

          {tab === "colour" ? (
            <section className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-serif text-xl">{t(lang, "shades")}</h2>
                <span className="text-xs text-muted">{t(lang, "colourFree")}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {config.shades.map((item) => (
                  <button key={item.id} className="grid justify-items-center gap-1 text-[10px]" type="button" aria-pressed={item.id === shadeId} onClick={() => { setShadeId(item.id); track("colour_selected", { shade: item.id }); }}>
                    <span className="swatch" style={{ background: item.hex }} aria-pressed={item.id === shadeId} />
                    {item.name}
                  </button>
                ))}
              </div>
              <label className="mt-4 block text-sm">
                {t(lang, "intensity")} · {intensity}
                <input className="mt-1 w-full" type="range" min={20} max={100} value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} />
              </label>
            </section>
          ) : (
            <section className="card p-4">
              <div className="mb-3 flex gap-2">
                {config.showWomen && <button className={gender === "women" ? "btn" : "btn secondary"} type="button" onClick={() => setGender("women")}>{t(lang, "women")}</button>}
                {config.showMen && <button className={gender === "men" ? "btn" : "btn secondary"} type="button" onClick={() => setGender("men")}>{t(lang, "men")}</button>}
                {config.showKids && <button className={gender === "kids" ? "btn" : "btn secondary"} type="button" onClick={() => setGender("kids")}>{t(lang, "kids")}</button>}
              </div>
              {gender === "kids" && <p className="mb-3 text-xs text-muted">{t(lang, "kidsNote")}</p>}
              <div className="grid grid-cols-3 gap-2">
                {styles.map((style) => (
                  <button key={style.id} type="button" aria-pressed={style.id === styleId} className={`overflow-hidden rounded-2xl border text-left ${style.id === styleId ? "border-[var(--brand)]" : "border-line"}`} onClick={() => { setStyleId(style.id); track("style_selected", { style: style.id }); }}>
                    <div className="aspect-[4/5]"><StyleThumb category={style.category} gender={style.gender} /></div>
                    <span className="block px-2 py-1 text-xs font-medium">{style.name}</span>
                  </button>
                ))}
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={quality === "hd"} onChange={(event) => setQuality(event.target.checked ? "hd" : "standard")} />
                {t(lang, "generateHd")}
              </label>
              <p className="mt-1 text-xs text-muted">{t(lang, "hdNote")}</p>
              <button className="btn mt-3 w-full" type="button" disabled={!selected || busy} onClick={() => void preview()}>
                {t(lang, "generate")} · {quality === "hd" ? "2" : "1"}
              </button>
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
                <button key={style.id} className="btn secondary" type="button" onClick={() => { setGender(style.gender as "women" | "men" | "kids"); setStyleId(style.id); setTab("style"); }}>{style.name}</button>
              ))}
            </div>
          </section>

          {active && (
            <section className="card p-4">
              <h2 className="font-serif text-xl">{active.styleName}{active.shadeName ? ` · ${active.shadeName}` : ""}</h2>
              <div className="mt-3"><BeforeAfter before={active.before} after={active.after} beforeLabel={t(lang, "before")} afterLabel={t(lang, "after")} /></div>
              <p className="mt-3 text-xs leading-5 text-muted">{t(lang, "disclaimer")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="btn secondary" href={active.after} download={`${config.slug}-${active.styleName}.jpg`}>{t(lang, "download")}</a>
                <button className="btn secondary" type="button" onClick={() => void preview()}>{t(lang, "regenerate")}</button>
              </div>
              <p className="mt-3 text-sm">{t(lang, "looksLike")}</p>
              <div className="mt-2 flex gap-2">
                <button className="btn secondary" type="button" onClick={() => { setFeedback(t(lang, "feedbackThanks")); track("feedback", { up: true }); }}>{t(lang, "yes")}</button>
                <button className="btn secondary" type="button" onClick={() => { setFeedback(t(lang, "feedbackThanks")); track("feedback", { up: false }); }}>{t(lang, "no")}</button>
              </div>
              {feedback && <p className="mt-2 text-xs" role="status">{feedback}</p>}
            </section>
          )}

          {looks.length > 0 && (
            <section className="card p-4">
              <h2 className="font-serif text-xl">{t(lang, "compare")}</h2>
              <p className="text-xs text-muted">{t(lang, "compareHint")}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {looks.map((look) => (
                  <button key={look.id} type="button" className={`overflow-hidden rounded-2xl border ${look.id === active?.id ? "border-[var(--brand)]" : "border-line"}`} onClick={() => setActiveId(look.id)}>
                    <img src={look.after} alt={look.styleName} className="aspect-[3/4] w-full object-cover" />
                    <span className="block px-2 py-1 text-left text-xs">{look.styleName}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="card p-4">
            <h2 className="font-serif text-xl">{t(lang, "book")}</h2>
            {config.outlets.length > 1 && (
              <label className="mt-2 block text-sm">{t(lang, "outlet")}
                <select className="field mt-1" value={outletId} onChange={(event) => setOutletId(event.target.value)}>
                  {config.outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
                </select>
              </label>
            )}
            <div className="mt-3 grid gap-2">
              <input className="field" placeholder={t(lang, "nameOptional")} value={name} onChange={(event) => setName(event.target.value)} aria-label={t(lang, "nameOptional")} />
              <input className="field" placeholder={t(lang, "phoneOptional")} value={phone} onChange={(event) => setPhone(event.target.value)} aria-label={t(lang, "phoneOptional")} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn" type="button" disabled={!active} onClick={() => void book(false)}>{t(lang, "book")}</button>
              <button className="btn secondary" type="button" disabled={!active} onClick={() => void book(true)}>{t(lang, "share")}</button>
            </div>
            <ul className="mt-4 space-y-1 text-sm">
              {config.services.map((service) => (
                <li key={service.id} className="flex justify-between gap-3 border-b border-line py-1">
                  <span>{service.nameI18n[lang] || service.name}</span>
                  <span>₹{service.priceInr.toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
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

          {error && <p className="text-sm text-[var(--bad)]" role="alert">{error}</p>}
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
