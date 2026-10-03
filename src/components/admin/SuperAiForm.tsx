"use client";

import { useState } from "react";
import type { PlatformAiSettings } from "@/lib/ai/settings-store";
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

export function SuperAiForm({ initial }: { initial: PlatformAiSettings }) {
  const [provider, setProvider] = useState<ImageProviderName>(initial.provider);
  const [tier, setTier] = useState(initial.tier);
  const [apiKey, setApiKey] = useState("");
  const [allowByo, setAllowByo] = useState(initial.allowByo);
  const [highEnabled, setHighEnabled] = useState(initial.highEnabled);
  const [mediumApproved, setMediumApproved] = useState(initial.mediumApproved);
  const [calibrationOk, setCalibrationOk] = useState(initial.calibrationOk);
  const [hint, setHint] = useState(initial.hint);
  const [hasKey, setHasKey] = useState(initial.hasKey);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [total, setTotal] = useState("");
  const choices = initial.choices[provider];

  function applyView(data: PlatformAiSettings) {
    setHint(data.hint || "");
    setHasKey(Boolean(data.hasKey));
    setAllowByo(data.allowByo);
    setHighEnabled(data.highEnabled);
    setMediumApproved(data.mediumApproved);
    setCalibrationOk(data.calibrationOk);
    if (data.tier) setTier(data.tier);
    if (data.provider) setProvider(data.provider);
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

  return (
    <form
      className="card grid max-w-3xl gap-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p role="status">
        Charged against the cap: ₹{initial.spend.spentInr.toFixed(2)} of ₹{initial.spend.capInr.toFixed(0)} ({initial.spend.calls} calls).
      </p>
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
        {hasKey ? `Saved as ${hint}. ` : ""}
        The key is encrypted on the server. Pasting a new key returns the tier to Test. This page never shows the key again.
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
