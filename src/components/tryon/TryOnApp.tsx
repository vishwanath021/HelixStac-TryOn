"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BeforeAfter } from "@/components/tryon/BeforeAfter";
import { ColourStage } from "@/components/tryon/ColourStage";
import { ReferenceTextureWarning } from "@/components/tryon/ReferenceTextureWarning";
import { HairTypePicker } from "@/components/tryon/HairTypePicker";
import { StyleCard } from "@/components/tryon/StyleCard";
import { t } from "@/data/i18n";
import { orderStylesForPicker, suggestStyles, type HairReading } from "@/lib/hair-suitability";
import { captureShouldMirror, visiblePortraitCrop } from "@/lib/capture";
import { brandStyle } from "@/lib/contrast";
import { classifySkinPhoto } from "@/lib/hand-photo";
import { parseAskedTexture, type AskedTexture } from "@/lib/ai/reference-texture";
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
  unvalidated?: boolean;
  referenceId?: string;
  showCost?: boolean;
  detail?: string;
  clothingWarning?: string;
  rawFaceDrift?: boolean;
  faceScore?: number | null;
  modelLabel?: string;
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
  referenceModeAvailable = false,
  comparisonModels = [],
}: {
  config: SalonConfig;
  embed?: boolean;
  initialTool?: string;
  initialStyleId?: string;
  initialShadeId?: string;
  salonToken?: string;
  salonMode?: boolean;
  demoMode?: boolean;
  referenceModeAvailable?: boolean;
  comparisonModels?: { id: string; label: string; warning?: string }[];
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
  const [referenceMode, setReferenceMode] = useState(false);
  const [hairTexture, setHairTexture] = useState<AskedTexture>("natural");
  const [pickedDensity, setPickedDensity] = useState("");
  const [pickedTexture, setPickedTexture] = useState("");
  const [showAllStyles, setShowAllStyles] = useState(false);
  const [hairReading, setHairReading] = useState<HairReading | null>(null);
  const [suggestNote, setSuggestNote] = useState("");
  const [suggestCost, setSuggestCost] = useState("");
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [referenceAck, setReferenceAck] = useState(false);
  const [referenceQuote, setReferenceQuote] = useState<{ model: string; provider: string; quality: string; size: string; rupees: number; dollars: number; note: string; warning: string } | null>(null);
  const [compareModel, setCompareModel] = useState(comparisonModels[0]?.id ?? "");
  const [comparisons, setComparisons] = useState<Look[]>([]);
  const [referenceChoice, setReferenceChoice] = useState<{ id: string; name: string; serviceKeys: string[]; tool: Look["tool"] } | null>(null);
  const previewLock = useRef(false);
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

  async function stageReference(chosen: { id: string; name: string; serviceKeys: string[]; tool: Look["tool"] }, modelId = compareModel) {
    setStyleId(chosen.id);
    setTool("style");
    if (!faceShot) {
      setError(t(lang, "addPhotoFirst"));
      frameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const consent = consentRef.current || (await consenting.current) || "";
    if (!consent) {
      setError(t(lang, "privacyTick"));
      return;
    }
    consentRef.current = consent;
    setReferenceAck(false);
    setReferenceChoice(chosen);
    setError("");
    setBusy(true);
    try {
      const width = faceShot.el.naturalWidth || 0;
      const height = faceShot.el.naturalHeight || 0;
      const modelQuery = modelId ? `&model=${encodeURIComponent(modelId)}` : "";
      const res = await fetch(`/api/v1/tryon/reference-quote?width=${width}&height=${height}&styleId=${encodeURIComponent(chosen.id)}${modelQuery}`);
      const data = await res.json().catch(() => ({ message: "This reference try-on could not be quoted." }));
      if (!res.ok) {
        setReferenceQuote(null);
        setError(data.message || "This reference try-on could not be quoted.");
        return;
      }
      setReferenceQuote({
        model: String(data.model || ""),
        provider: String(data.provider || ""),
        quality: String(data.quality || ""),
        size: String(data.size || ""),
        rupees: Number(data.rupees || 0),
        dollars: Number(data.dollars || 0),
        note: String(data.note || ""),
        warning: String(data.warning || ""),
      });
    } finally {
      setBusy(false);
    }
  }

  function pngUrl(value: string) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  }

  async function deleteReferenceRun() {
    if (!active?.referenceId) return;
    if (!window.confirm("Delete this reference run and its photos now?")) return;
    const res = await fetch(`/api/v1/super/ai/benchmark/${active.referenceId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Could not delete that run." }));
      setError(data.message || "Could not delete that run.");
      return;
    }
    const next = comparisons.filter((item) => item.referenceId !== active.referenceId);
    setComparisons(next);
    setActive(next[next.length - 1] ?? null);
    if (!next.length) setStylePhase("pick");
    setReferenceAck(false);
  }

  function resetForAnotherPhoto() {
    const blobs = new Set<string>();
    const remember = (url?: string) => {
      if (url?.startsWith("blob:")) blobs.add(url);
    };
    remember(faceShot?.url);
    remember(handShot?.url);
    for (const look of [active, ...comparisons]) {
      if (!look) continue;
      remember(look.before);
      remember(look.after);
    }
    for (const url of blobs) URL.revokeObjectURL(url);
    setFaceShot(null);
    setHandShot(null);
    setActive(null);
    setComparisons([]);
    setStylePhase("pick");
    setStyleId("");
    setReferenceAck(false);
    setReferenceQuote(null);
    setReferenceChoice(null);
    setHairReading(null);
    setPickedDensity("");
    setPickedTexture("");
    setShowAllStyles(false);
    setSuggestNote("");
    setSuggestCost("");
    setError("");
    setNotice("");
    setPendingName("");
    setProgress(0);
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
      setSuggestNote(low ? "Low confidence. Adjust the hair type if this looks wrong." : data.cached ? "Same photo. No new reading." : "");
      if (data.showCost) {
        const cached = data.cached ? "Cached reading. No new provider charge. " : "";
        const actual = data.actualKnown
          ? `${data.actualLabel || "Actual"} $${Number(data.actualDollars || 0).toFixed(3)} (₹${Number(data.actualRupees || 0).toFixed(2)}).`
          : "Actual —.";
        setSuggestCost(`${cached}Estimate (reserved) ₹${Number(data.rupees || 0).toFixed(2)}. ${actual} Source: ${data.sourceLabel || "unknown"}.`);
      } else {
        setSuggestCost("");
      }
    } finally {
      setSuggestBusy(false);
    }
  }

  async function preview(chosen: { id: string; name: string; serviceKeys: string[]; tool: Look["tool"] }, referenceConfirm = false) {
    setStyleId(chosen.id);
    setTool(chosen.tool);
    if (referenceModeAvailable && referenceMode && chosen.tool === "style" && !referenceConfirm) {
      await stageReference(chosen);
      return;
    }
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
        if (referenceConfirm) {
        body.set("referenceMode", "yes");
        body.set("confirm", "yes");
        if (hairTexture !== "natural") body.set("hairTexture", hairTexture);
        if (compareModel) body.set("compareModel", compareModel);
      } else if (chosen.tool === "style" && shadeId) {
        body.set("shadeId", shadeId);
      }
      if (salonToken) body.set("salonToken", salonToken);
      const res = await fetch("/api/v1/tryon/generate", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: t(lang, "creditsEmpty") }));
        setProgress(0);
        setError(data.message || t(lang, "creditsEmpty"));
        track("generate_failed", { styleId: chosen.id });
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("json")) {
        const data = await res.json();
        if (!data.imageBase64) {
          setError(data.message || t(lang, "creditsEmpty"));
          return;
        }
        const usage = data.usage as { inputTokens?: number; outputTokens?: number; imageTokens?: number; textTokens?: number } | null;
        const detail = data.showCost
          ? [
              `Estimate (reserved) ₹${Number(data.rupees || 0).toFixed(2)}.`,
              data.actualKnown
                ? `${data.actualLabel || "Actual"} $${Number(data.actualDollars || 0).toFixed(3)} (₹${Number(data.actualRupees || 0).toFixed(2)}).`
                : "Actual —.",
              `Source: ${data.sourceLabel || "unknown"}.`,
              data.latencyMs ? `Latency ${(Number(data.latencyMs) / 1000).toFixed(1)} s.` : "",
              usage ? `Usage input ${usage.inputTokens || 0} (image ${usage.imageTokens || 0}, text ${usage.textTokens || 0}), output ${usage.outputTokens || 0}.` : "",
            ].filter(Boolean).join(" ")
          : "";
        setNotice("");
        const look: Look = {
          id: data.id || crypto.randomUUID(),
          styleId: chosen.id,
          styleName: chosen.name,
          shadeName: null,
          before: shot.url,
          after: pngUrl(String(data.imageBase64)),
          rawFaceDrift: Boolean(data.rawFaceDrift),
          faceScore: data.faceScore == null ? null : Number(data.faceScore),
          modelLabel: String(data.model || data.provider || ""),
          serviceKeys: chosen.serviceKeys,
          tool: chosen.tool,
          unvalidated: true,
          referenceId: data.id,
          showCost: Boolean(data.showCost),
          detail,
          clothingWarning: data.clothingWarning || "",
        };
        setActive(look);
        setComparisons((current) => [...current.filter((item) => item.modelLabel !== look.modelLabel), look]);
        setReferenceAck(false);
        setProgress(100);
        setStylePhase("result");
        frameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      setProgress(100);
      setStylePhase("result");
      frameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      track("generate_succeeded", { styleId: chosen.id });
    } finally {
      previewLock.current = false;
      setBusy(false);
    }
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
    anchor.download = `${config.slug}-${active.styleName}.${active.unvalidated ? "png" : "jpg"}`;
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
    <div style={brandStyle(config.primaryColor, config.accentColor) as CSSProperties} className={embed ? "" : "mx-auto max-w-lg px-4 pb-16 pt-4"}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {config.logoUrl ? (
            <img src={config.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-2xl border border-line bg-white object-cover" />
          ) : (
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--brand-btn)] font-serif text-lg text-[var(--on-brand)]">{config.name.slice(0, 1)}</div>
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
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${tool === item.id ? "bg-[var(--brand-btn)] text-[var(--on-brand)]" : "bg-white text-ink ring-1 ring-line"}`}
            type="button"
            role="tab"
            aria-selected={tool === item.id}
            onClick={() => { setTool(item.id); setError(""); }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section ref={frameRef} className="mt-5 overflow-hidden rounded-[28px] border border-line bg-[#eef7f5] shadow-lift" aria-label="Photo">
        {showResult && active?.unvalidated ? (
          <div className="p-3">
            <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-ink">Experimental, unvalidated</p>
            <div className="grid grid-cols-2 gap-2">
              <figure>
                <figcaption className="mb-1 text-center text-[11px] text-muted">Original</figcaption>
                <img src={active.before} alt="Original selfie" className="max-h-96 w-full object-contain" />
              </figure>
              <figure>
                <figcaption className="mb-1 text-center text-[11px] text-muted">Raw provider image</figcaption>
                <img src={active.after} alt="Raw provider image, experimental and unvalidated" className="max-h-96 w-full object-contain" />
              </figure>
            </div>
          </div>
        ) : showResult && active ? (
          <div>
            <BeforeAfter before={active.before} after={active.after} beforeLabel={t(lang, "before")} afterLabel={t(lang, "after")} />
            {active.demo && <p className="bg-[var(--brand-btn)] px-4 py-3 text-center text-sm leading-6 text-[var(--on-brand)]" role="status">{t(lang, active.tool === "nails" ? "demoNailBanner" : "demoStyleBanner")}</p>}
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
                {tool === "nails" && <p className="text-center text-lg text-ink">{t(lang, "uploadHand")}</p>}
                <button className="btn min-w-44" type="button" onClick={() => void startCamera(tool === "nails" ? "environment" : "user")}>{t(lang, "takeSelfie")}</button>
                <button className="btn on-photo min-w-44" type="button" onClick={() => fileRef.current?.click()}>{tool === "nails" ? t(lang, "uploadHand") : t(lang, "uploadPhoto")}</button>
                {cameraError && <p className="text-center text-sm text-[var(--bad)]" role="alert">{cameraError}</p>}
              </div>
            )}
            {cameraOn && (
              <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-16">
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
          {active.unvalidated && (
            <div className="rounded-xl border border-line bg-white p-3 text-sm leading-6">
              <p>Experimental, unvalidated. The large image is the raw provider output. It was not accepted. The download is that raw image.</p>
              {active.modelLabel && <p className="mt-2">Model {active.modelLabel}.</p>}
              {active.rawFaceDrift && (
                <p className="mt-2">
                  Face may differ from your photo.
                  {active.showCost && active.faceScore != null ? ` Score ${active.faceScore.toFixed(3)}.` : ""}
                </p>
              )}
              {active.clothingWarning === "clothing_changed" && <p className="mt-2">Warning: the neckline or shoulder band changed.</p>}
              {active.showCost && active.detail && <p className="mt-2">{active.detail}</p>}
              {active.showCost && active.referenceId && (
                <p className="mt-2 flex flex-wrap gap-3">
                  <a className="underline" href={`/super/ai/benchmark/${active.referenceId}`}>Open saved stages</a>
                  <button className="underline" type="button" onClick={() => void deleteReferenceRun()}>Delete now</button>
                </p>
              )}
              <p className="mt-2 text-muted">Photos stay on this server for 72 hours. Real family photos are personal data and are sent only to the provider for the model you confirmed.</p>
            </div>
          )}
          {comparisons.length > 1 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {comparisons.map((look) => (
                <figure key={look.referenceId || look.id} className="rounded-xl border border-line bg-white p-3 text-sm leading-6">
                  <figcaption className="font-medium">{look.modelLabel || look.styleName}</figcaption>
                  <img src={look.after} alt="" className="mt-2 max-h-64 w-full object-contain" />
                  {look.rawFaceDrift && (
                    <p className="mt-2">
                      Face may differ from your photo.
                      {look.showCost && look.faceScore != null ? ` Score ${look.faceScore.toFixed(3)}.` : ""}
                    </p>
                  )}
                  {look.showCost && look.detail && <p className="mt-2">{look.detail}</p>}
                  <button className="mt-2 underline" type="button" onClick={() => setActive(look)}>Show this result</button>
                </figure>
              ))}
            </div>
          )}
          <p className="text-center text-sm text-muted">{t(lang, active.tool === "brows" ? "browDisclaimer" : active.tool === "beard" ? "beardDisclaimer" : active.tool === "nails" ? "nailDisclaimer" : "disclaimer")}</p>
          <button className="btn" type="button" onClick={() => void downloadLook()}>{t(lang, "downloadLook")}</button>
          <button className="btn" type="button" onClick={() => void book()}>{t(lang, "bookLook")}</button>
          <button className="btn secondary" type="button" onClick={() => resetForAnotherPhoto()}>{t(lang, "tryAnotherShort")}</button>
        </div>
      )}

      <section ref={gridRef} className="mt-6" aria-label={tool === "style" ? t(lang, "styles") : tool === "colour" ? t(lang, "shades") : tool === "brows" ? t(lang, "brows") : tool === "beard" ? t(lang, "beards") : t(lang, "nails")}>
        {tool === "style" && (
          <>
            {referenceModeAvailable && (
              <div className="mb-3 rounded-2xl border border-line bg-white p-3 text-sm leading-6">
                <label className="flex items-start gap-2 font-medium">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={referenceMode}
                    onChange={(event) => {
                      setReferenceMode(event.target.checked);
                      if (!event.target.checked) setHairTexture("natural");
                      setReferenceAck(false);
                      setReferenceQuote(null);
                      setReferenceChoice(null);
                      if (!event.target.checked) setComparisons([]);
                    }}
                  />
                  <span>Reference mode (test)</span>
                </label>
                <p className="mt-2 text-muted">
                  Shown only on this super-admin session. Off, a hairstyle uses the normal preview. On, it sends your selfie and then the style photo, with no mask and no pasted face.
                  The result is the raw provider image. Real family photos are personal data and are sent only to the provider for the model you confirm. Files stay on this server for 72 hours.
                </p>
                {referenceMode && comparisonModels.length > 0 && (
                  <label className="mt-3 block font-medium">
                    Comparison model
                    <select
                      className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2"
                      value={compareModel}
                      onChange={(event) => {
                        const next = event.target.value;
                        setCompareModel(next);
                        setReferenceAck(false);
                        if (referenceChoice) void stageReference(referenceChoice, next);
                      }}
                    >
                      {comparisonModels.map((model) => (
                        <option key={model.id} value={model.id}>{model.label}</option>
                      ))}
                    </select>
                  </label>
                )}
                {referenceMode && comparisonModels.find((model) => model.id === compareModel)?.warning && (
                  <p className="mt-2 text-sm font-medium" role="status">
                    {comparisonModels.find((model) => model.id === compareModel)?.warning}
                  </p>
                )}
                {referenceMode && comparisonModels.length > 0 && (
                  <p className="mt-2 text-muted">
                    Each model is its own estimate, confirmation, and one call. Nothing runs until you confirm that model. There is no retry and no automatic substitution.
                  </p>
                )}
                {referenceMode && (
                  <label className="mt-3 block font-medium">
                    Hair texture
                    <select
                      className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2"
                      value={hairTexture}
                      onChange={(event) => {
                        setHairTexture(parseAskedTexture(event.target.value));
                        setReferenceAck(false);
                      }}
                    >
                      <option value="natural">Keep natural</option>
                      <option value="straight">Straight</option>
                      <option value="wavy">Wavy</option>
                      <option value="curly">Curly</option>
                    </select>
                  </label>
                )}
                {referenceMode && (
                  <p className="mt-2 text-muted">
                    Keep natural follows the texture already in the selfie. Image 2 still supplies the cut, length and silhouette. Straight, Wavy or Curly asks for that texture and is sent only when you change this.
                  </p>
                )}
                {referenceMode && (referenceChoice || styleId) && (
                  <ReferenceTextureWarning
                    styleId={referenceChoice?.id || styleId}
                    styleName={referenceChoice?.name || config.styles.find((item) => item.id === styleId)?.name || styleId}
                    referenceTexture={config.styles.find((item) => item.id === (referenceChoice?.id || styleId))?.referenceTexture}
                    asked={hairTexture}
                  />
                )}
                {referenceMode && referenceQuote && referenceChoice && (
                  <div className="mt-3 border-t border-line pt-3">
                    <p>
                      {referenceChoice.name}. {referenceQuote.model}, quality {referenceQuote.quality}, size {referenceQuote.size}. About ₹{referenceQuote.rupees.toFixed(2)} (${referenceQuote.dollars.toFixed(3)}).
                    </p>
                    {referenceQuote.warning && <p className="mt-1 font-medium" role="status">{referenceQuote.warning}</p>}
                    <p className="mt-1 text-muted">{referenceQuote.note}</p>
                    <label className="mt-2 flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={referenceAck} onChange={(event) => setReferenceAck(event.target.checked)} />
                      <span>I understand this makes one paid call for this model and does not retry.</span>
                    </label>
                    <button className="btn mt-3" type="button" disabled={busy || !referenceAck} onClick={() => void preview(referenceChoice, true)}>
                      Try this hairstyle
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="mb-4 inline-flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-line" role="group" aria-label="Style audience">
              {config.showWomen && <button className={`rounded-full px-4 py-2 text-sm font-semibold ${gender === "women" ? "bg-[var(--brand-btn)] text-[var(--on-brand)]" : "text-ink"}`} type="button" aria-pressed={gender === "women"} onClick={() => chooseGender("women")}>{t(lang, "women")}</button>}
              {config.showMen && <button className={`rounded-full px-4 py-2 text-sm font-semibold ${gender === "men" ? "bg-[var(--brand-btn)] text-[var(--on-brand)]" : "text-ink"}`} type="button" aria-pressed={gender === "men"} onClick={() => chooseGender("men")}>{t(lang, "men")}</button>}
              {config.showKids && <button className={`rounded-full px-4 py-2 text-sm font-semibold ${gender === "kids" ? "bg-[var(--brand-btn)] text-[var(--on-brand)]" : "text-ink"}`} type="button" aria-pressed={gender === "kids"} onClick={() => chooseGender("kids")}>{t(lang, "kids")}</button>}
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
              onPick={(card) => void preview({ id: card.id, name: card.name, serviceKeys: card.serviceKeys, tool: "style" })}
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
                  className={`overflow-hidden rounded-2xl border bg-white text-left shadow-sm ${style.id === styleId ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`}
                  disabled={busy} onClick={() => void preview({ id: style.id, name: style.name, serviceKeys: style.serviceKeys, tool: "style" })}
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
              <button key={brow.id} type="button" aria-pressed={brow.id === styleId} className={`overflow-hidden rounded-2xl border bg-white text-left ${brow.id === styleId ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`} disabled={busy} onClick={() => void preview({ id: brow.id, name: brow.name, serviceKeys: brow.serviceKeys, tool: "brows" })}>
                <StyleCard id={brow.id} name={brow.name} folder="brows" />
                <span className="block px-2 py-2 text-center text-sm font-medium">{brow.name}</span>
              </button>
            ))}
          </div>
        )}

        {tool === "beard" && (
          <div className="grid grid-cols-3 gap-2 max-[340px]:grid-cols-2">
            {config.beards.map((beard) => (
              <button key={beard.id} type="button" aria-pressed={beard.id === styleId} className={`overflow-hidden rounded-2xl border bg-white text-left ${beard.id === styleId ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`} disabled={busy} onClick={() => void preview({ id: beard.id, name: beard.name, serviceKeys: beard.serviceKeys, tool: "beard" })}>
                <StyleCard id={beard.id} name={beard.name} folder="beards" />
                <span className="block px-2 py-2 text-center text-sm font-medium">{beard.name}</span>
              </button>
            ))}
          </div>
        )}

        {tool === "nails" && (
          <div className="grid grid-cols-3 gap-2 max-[340px]:grid-cols-2">
            {config.nails.map((nail) => (
              <button key={nail.id} type="button" aria-pressed={nail.id === styleId} className={`overflow-hidden rounded-2xl border bg-white text-left ${nail.id === styleId ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-line"}`} disabled={busy} onClick={() => void preview({ id: nail.id, name: nail.name, serviceKeys: nail.serviceKeys, tool: "nails" })}>
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
