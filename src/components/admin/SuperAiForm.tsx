"use client";

import { useState } from "react";
import type { GuestEngine } from "@/lib/ai/guest-hairstyle";
import type { PlatformAiSettings } from "@/lib/ai/settings-store";
import { productionModelNotice } from "@/lib/ai/model-notices";
import type { ImageProviderName, TierRequest } from "@/lib/ai/tiers";

type Panel = {
  name: string;
  tool: string;
  ok: boolean;
  message: string;
  before: string;
  overlay: string;
  after: string;
  model?: string;
  quality?: string;
  estimateInr?: number;
  chargedInr?: number;
};

export function SuperAiForm({
  initial,
  salons,
}: {
  initial: PlatformAiSettings;
  salons: { id: string; name: string; hairstyleEngine: string }[];
}) {
  const [provider, setProvider] = useState<ImageProviderName>(initial.provider);
  const [tier, setTier] = useState(initial.tier);
  const [apiKey, setApiKey] = useState("");
  const [allowByo, setAllowByo] = useState(initial.allowByo);
  const [highEnabled, setHighEnabled] = useState(initial.highEnabled);
  const [mediumApproved, setMediumApproved] = useState(initial.mediumApproved);
  const [calibrationOk, setCalibrationOk] = useState(initial.calibrationOk);
  const [hint, setHint] = useState(initial.hint);
  const [hasKey, setHasKey] = useState(initial.hasKey);
  const [openaiKey, setOpenaiKey] = useState(initial.openaiKey);
  const [geminiKey, setGeminiKey] = useState(initial.geminiKey);
  const [falKey, setFalKey] = useState(initial.falKey);
  const [falDraft, setFalDraft] = useState("");
  const [falEnabled, setFalEnabled] = useState(initial.falKey.enabled);
  const [openRouterKey, setOpenRouterKey] = useState(initial.openRouterKey);
  const [openRouterDraft, setOpenRouterDraft] = useState("");
  const [openRouterEnabled, setOpenRouterEnabled] = useState(initial.openRouterKey.enabled);
  const [guestEngine, setGuestEngine] = useState<GuestEngine>(initial.guestEngine || "fal");
  const [salonRows, setSalonRows] = useState(salons);
  const [salonId, setSalonId] = useState(salons[0]?.id || "");
  const [salonEngine, setSalonEngine] = useState(salons[0]?.hairstyleEngine || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [total, setTotal] = useState("");
  const choices = initial.choices[provider];

  function applyView(data: PlatformAiSettings) {
    setHint(data.hint || "");
    setHasKey(Boolean(data.hasKey));
    setOpenaiKey(data.openaiKey);
    setGeminiKey(data.geminiKey);
    setFalKey(data.falKey);
    setFalEnabled(Boolean(data.falKey?.enabled));
    setOpenRouterKey(data.openRouterKey);
    setOpenRouterEnabled(Boolean(data.openRouterKey?.enabled));
    setAllowByo(data.allowByo);
    setHighEnabled(data.highEnabled);
    setMediumApproved(data.mediumApproved);
    setCalibrationOk(data.calibrationOk);
    if (data.tier) setTier(data.tier);
    if (data.provider) setProvider(data.provider);
    if (data.guestEngine === "fal" || data.guestEngine === "openai") setGuestEngine(data.guestEngine);
  }

  async function saveGuest(engine: GuestEngine) {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/super/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guestEngineOnly: true, guestEngine: engine }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "Could not save the salon hairstyle model.");
      return;
    }
    applyView(data);
    setMessage(engine === "fal" ? "Salon screens use FLUX.3." : "Salon screens use OpenAI sunburst, quality medium.");
  }

  async function saveSalon(engine: string) {
    if (!salonId) return;
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/super/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ salonEngineOnly: true, salonId, salonEngine: engine }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "Could not save that salon override.");
      return;
    }
    setSalonRows((rows) => rows.map((row) => (row.id === salonId ? { ...row, hairstyleEngine: engine } : row)));
    setSalonEngine(engine);
    setMessage(engine ? "That salon uses its own hairstyle model." : "That salon follows the global default.");
    if (data.guestEngine) applyView(data);
  }

  async function save() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/super/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, apiKey, allowByo, tier, highEnabled }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "Could not save those settings.");
      return;
    }
    applyView(data);
    setApiKey("");
    setMessage(hasKey && !apiKey ? "Saved. The stored key was kept." : "Saved. A new key starts on Test.");
  }

  async function approveMedium() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/super/ai/approve-medium", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "Medium quality is not approved yet.");
      return;
    }
    applyView(data);
    setMessage("Medium quality is approved. Guests stay on Test until that tier is selected.");
  }

  async function calibrate() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/super/ai/calibrate", { method: "POST" });
    const data = await res.json().catch(() => ({ message: "Calibration did not run." }));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "Calibration did not run.");
      return;
    }
    setPanels(data.panels || []);
    setCalibrationOk(Boolean(data.calibrationOk));
    setTotal(typeof data.spentInr === "number" ? `Total charged ₹${data.spentInr.toFixed(2)}.` : "");
    setMessage(data.summary || "Calibration finished.");
  }

  async function testConnection() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/super/ai/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });
    const data = await res.json().catch(() => ({ message: "Could not reach the provider." }));
    setBusy(false);
    setMessage(data.message || (res.ok ? "Connected." : "The provider rejected that key."));
  }

  async function saveFal(remove: boolean) {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/super/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ falOnly: true, falKey: falDraft, falEnabled, removeFalKey: remove }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "Could not save the fal key.");
      return;
    }
    applyView(data);
    setFalDraft("");
    setMessage(remove ? "The fal key was removed." : "The fal key was saved.");
  }

  async function saveOpenRouter(remove: boolean) {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/super/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        openRouterOnly: true,
        openRouterKey: openRouterDraft,
        openRouterEnabled,
        removeOpenRouterKey: remove,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "Could not save the OpenRouter key.");
      return;
    }
    applyView(data);
    setOpenRouterDraft("");
    setMessage(remove ? "The OpenRouter key was removed." : "The OpenRouter key was saved.");
  }

  return (
    <form
      className="card grid max-w-3xl gap-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset className="grid gap-3 border-b border-line pb-4" aria-label="Salon hairstyle model">
        <legend className="text-base font-semibold">Salon hairstyle model</legend>
        <p className="text-sm text-muted">Guests use this model. Comparison stays on this page.</p>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="radio" name="guest-engine" checked={guestEngine === "fal"} onChange={() => setGuestEngine("fal")} />
          fal FLUX.3 (default)
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="radio" name="guest-engine" checked={guestEngine === "openai"} onChange={() => setGuestEngine("openai")} />
          OpenAI gpt-image-2.5-sunburst, quality medium
        </label>
        <button className="btn w-fit" type="button" disabled={busy} onClick={() => void saveGuest(guestEngine)}>Save salon default</button>
        <label className="text-sm">
          Salon override
          <select
            className="field mt-1"
            aria-label="Salon override"
            value={salonId}
            onChange={(event) => {
              const next = event.target.value;
              setSalonId(next);
              setSalonEngine(salonRows.find((row) => row.id === next)?.hairstyleEngine || "");
            }}
          >
            {salonRows.map((salon) => (
              <option key={salon.id} value={salon.id}>{salon.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          This salon
          <select className="field mt-1" aria-label="This salon model" value={salonEngine} onChange={(event) => setSalonEngine(event.target.value)}>
            <option value="">Use global default</option>
            <option value="fal">fal FLUX.3</option>
            <option value="openai">OpenAI sunburst</option>
          </select>
        </label>
        <button className="btn secondary w-fit" type="button" disabled={busy || !salonId} onClick={() => void saveSalon(salonEngine)}>Save override</button>
      </fieldset>
      <p role="status">
        Charged against the cap: ₹{initial.spend.spentInr.toFixed(2)} of ₹{initial.spend.capInr.toFixed(0)} ({initial.spend.calls} calls).
      </p>
      <div className="grid gap-1 text-sm">
        <p className="font-medium">Saved provider keys</p>
        <p>
          OpenAI: {openaiKey.saved ? `saved as ${openaiKey.hint}. This key is available for OpenAI guest try-on and for OpenAI comparison models.` : "not saved."}
          {" "}Saving a Gemini key, a fal key, or an OpenRouter key does not remove it. Enable high quality only unlocks the High tier. A greyed High row means that tier is off. It does not turn the OpenAI key off.
        </p>
        <p>Gemini: {geminiKey.saved ? `saved as ${geminiKey.hint}. Used when the guest provider is Gemini, and for Gemini comparison models.` : "not saved."}</p>
        <p>
          fal: {falKey.saved
            ? `saved as ${falKey.hint}. ${falKey.enabled ? "Comparison calls are on." : "Comparison calls are off until you enable them."}`
            : "not saved."}
        </p>
        <p>
          OpenRouter: {openRouterKey.saved
            ? `saved as ${openRouterKey.hint}. ${openRouterKey.enabled ? "Comparison calls are on." : "Comparison calls are off until you enable them."}`
            : "not saved."}
        </p>
      </div>
      <label className="text-sm">
        Provider
        <select className="field mt-1" value={provider} onChange={(event) => setProvider(event.target.value === "gemini" ? "gemini" : "openai")}>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </select>
      </label>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Quality tier</legend>
        {choices.map((choice: TierRequest) => {
          const blocked = (choice.tier === "medium" && !mediumApproved) || (choice.tier === "high" && !highEnabled);
          return (
            <label key={choice.tier} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="tier"
                className="mt-1"
                checked={tier === choice.tier}
                disabled={blocked}
                onChange={() => setTier(choice.tier)}
              />
              <span>
                <span className="font-medium uppercase">{choice.tier}</span>
                {" · "}
                {choice.model}
                {" · "}
                {choice.quality}
                {" · "}
                {choice.size}
                {" · about ₹"}
                {choice.estimateInr.toFixed(2)}
                {" / image"}
                {choice.tier === "test" && choice.inputLongSide > 0 ? ` · input long side ${choice.inputLongSide}px` : ""}
                {productionModelNotice(choice.model) ? ` · ${productionModelNotice(choice.model)}` : ""}
              </span>
            </label>
          );
        })}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={highEnabled} onChange={(event) => setHighEnabled(event.target.checked)} />
        Enable high quality
      </label>
      <p className="text-xs text-muted">High stays off until this is checked. Guests never use it unless it is enabled and selected.</p>
      <label className="text-sm">
        Provider key
        <input
          className="field mt-1 font-mono"
          type="password"
          name="ai-key"
          autoComplete="off"
          spellCheck={false}
          aria-label="Provider key"
          placeholder={hasKey ? hint || "A key is saved" : "Paste the provider key"}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <p className="text-xs text-muted">
        {hasKey ? `Guest provider key saved as ${hint}. ` : "No key is stored for the guest provider selected above. "}
        The key is encrypted with the server secret. Pasting a new key returns the tier to Test. This page never shows the key again. The guest dropdown chooses which saved key guests use. It does not erase the other provider&apos;s key.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allowByo} onChange={(event) => setAllowByo(event.target.checked)} />
        Let each salon owner store their own key
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn" type="submit" disabled={busy}>Save</button>
        <button className="btn secondary" type="button" disabled={busy} onClick={() => void testConnection()}>Test connection</button>
        <button className="btn secondary" type="button" disabled={busy} onClick={() => void calibrate()}>Calibration run</button>
        <button className="btn secondary" type="button" disabled={busy || !calibrationOk || mediumApproved} onClick={() => void approveMedium()}>
          Approve medium quality
        </button>
      </div>
      {mediumApproved && <p className="text-sm">Medium quality is approved.</p>}
      <div className="grid gap-2 border-t border-line pt-4">
        <p className="text-sm font-medium">fal key</p>
        <p className="text-xs text-muted">
          Separate from the OpenAI and Gemini keys. Paste it here, tick Enable fal comparisons, then Save fal key. Reference comparisons that use fal read this key. They do not call OpenAI or Gemini if it is missing or off.
        </p>
        <label className="text-sm">
          fal key
          <input
            className="field mt-1 font-mono"
            type="password"
            name="fal-key"
            autoComplete="off"
            spellCheck={false}
            aria-label="fal key"
            placeholder={falKey.saved ? falKey.hint || "A fal key is saved" : "Paste the fal key"}
            value={falDraft}
            onChange={(event) => setFalDraft(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={falEnabled} onChange={(event) => setFalEnabled(event.target.checked)} />
          Enable fal comparisons
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void saveFal(false)}>Save fal key</button>
          <button className="btn secondary" type="button" disabled={busy || !falKey.saved} onClick={() => void saveFal(true)}>Remove fal key</button>
        </div>
      </div>
      <div className="grid gap-2 border-t border-line pt-4">
        <p className="text-sm font-medium">OpenRouter key</p>
        <p className="text-xs text-muted">
          Separate from the OpenAI, Gemini, and fal keys. Paste it here, tick Enable OpenRouter comparisons, then Save OpenRouter key. Those comparisons read this key. They do not call another provider if it is missing or off. OpenRouter does not proxy fal.ai.
        </p>
        <label className="text-sm">
          OpenRouter key
          <input
            className="field mt-1 font-mono"
            type="password"
            name="openrouter-key"
            autoComplete="off"
            spellCheck={false}
            aria-label="OpenRouter key"
            placeholder={openRouterKey.saved ? openRouterKey.hint || "An OpenRouter key is saved" : "Paste the OpenRouter key"}
            value={openRouterDraft}
            onChange={(event) => setOpenRouterDraft(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={openRouterEnabled} onChange={(event) => setOpenRouterEnabled(event.target.checked)} />
          Enable OpenRouter comparisons
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void saveOpenRouter(false)}>Save OpenRouter key</button>
          <button className="btn secondary" type="button" disabled={busy || !openRouterKey.saved} onClick={() => void saveOpenRouter(true)}>Remove OpenRouter key</button>
        </div>
      </div>
      {message && <p role="status">{message}</p>}
      {total && <p className="text-sm font-medium">{total}</p>}
      {panels.length > 0 && (
        <div className="grid gap-4">
          {panels.map((panel) => (
            <figure key={`${panel.tool}-${panel.name}`} className="grid gap-2">
              <figcaption className="text-sm font-medium">
                {panel.name} · {panel.tool} · {panel.ok ? "placed" : "rejected"}
                {panel.model ? ` · ${panel.model} · ${panel.quality} · about ₹${Number(panel.estimateInr || 0).toFixed(2)} / image · charged ₹${Number(panel.chargedInr || 0).toFixed(2)}` : ""}
              </figcaption>
              <div className="grid grid-cols-3 gap-2">
                <img src={panel.before} alt={`${panel.name} before`} className="w-full rounded-xl" />
                <img src={panel.overlay} alt={`${panel.name} mask`} className="w-full rounded-xl" />
                <img src={panel.after} alt={`${panel.name} after`} className="w-full rounded-xl" />
              </div>
              <p className="text-xs text-muted">{panel.message}</p>
            </figure>
          ))}
        </div>
      )}
    </form>
  );
}
