"use client";

import { useState, type ReactNode } from "react";
import type { GuestEngine } from "@/lib/ai/guest-hairstyle";
import type { PlatformAiSettings, StoredKeyStatus } from "@/lib/ai/settings-store";
import { formatAiInr } from "@/lib/display";
import { productionModelNotice } from "@/lib/ai/model-notices";
import type { ImageProviderName, TierRequest } from "@/lib/ai/tiers";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/tooltip";

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
  advanced,
}: {
  initial: PlatformAiSettings;
  advanced?: ReactNode;
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
  const [openaiDraft, setOpenaiDraft] = useState("");
  const [geminiDraft, setGeminiDraft] = useState("");
  const [guestEngine, setGuestEngine] = useState<GuestEngine>(initial.guestEngine || "openai");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [total, setTotal] = useState("");
  const choices = initial.choices[provider];
  const retiringHigh = Object.values(initial.choices).some((rows) => rows.some((row) => row.model === "gpt-image-1"));
  const capPct = initial.spend.capInr > 0 ? Math.min(100, (initial.spend.spentInr / initial.spend.capInr) * 100) : 0;

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

  async function save(overrides?: { provider?: ImageProviderName; apiKey?: string }) {
    const nextProvider = overrides?.provider ?? provider;
    const nextKey = overrides?.apiKey ?? apiKey;
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/super/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: nextProvider, apiKey: nextKey, allowByo, tier, highEnabled }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "Could not save those settings.");
      return;
    }
    applyView(data);
    setApiKey("");
    setOpenaiDraft("");
    setGeminiDraft("");
    setMessage(hasKey && !nextKey ? "Saved. The stored key was kept." : "Saved. A new key starts on Test.");
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
    setMessage("Medium quality is approved for calibration. Guest try-on uses the model above.");
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

  async function testConnection(which: ImageProviderName = provider, key = apiKey) {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/super/ai/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: which, apiKey: key }),
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
    <div className="grid max-w-5xl gap-4">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset className="card grid gap-3 p-5" aria-label="Salon hairstyle model">
          <legend className="px-1 text-base font-semibold">Salon hairstyle model</legend>
          <p className="text-sm text-muted">Hairstyle, beard, colour, makeup, and bridal use this model.</p>
          <p className="text-sm">Brows follow this choice. OpenAI gpt-image-2.5-sunburst at quality medium is the default. fal FLUX.3 runs automatically if OpenAI fails.</p>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="guest-engine" checked={guestEngine === "openai"} onChange={() => setGuestEngine("openai")} />
            OpenAI gpt-image-2.5-sunburst, quality medium (default)
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="guest-engine" checked={guestEngine === "fal"} onChange={() => setGuestEngine("fal")} />
            fal FLUX.3 (fallback)
          </label>
          <button className="btn w-fit" type="button" disabled={busy} onClick={() => void saveGuest(guestEngine)}>Save salon default</button>
        </fieldset>

        <section className="grid gap-3">
          <div className="flex items-center gap-1">
            <h2 className="text-base font-semibold">Provider keys</h2>
            <Hint label="About provider keys">Each key is stored on its own. Saving one does not remove the others.</Hint>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <KeyCard
              title="OpenAI"
              status={openaiKey}
              draft={openaiDraft}
              onDraft={setOpenaiDraft}
              ariaLabel="OpenAI key"
              helper="Used when the guest engine is OpenAI."
              busy={busy}
              onSave={() => void save({ provider: "openai", apiKey: openaiDraft })}
              onTest={() => void testConnection("openai", openaiDraft)}
            />
            <article className="card grid gap-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">fal</h3>
                <Badge tone={falKey.saved ? "good" : "neutral"}>{falKey.saved ? "Saved" : "Not saved"}</Badge>
                <Badge tone={falKey.enabled ? "good" : "warn"}>{falKey.enabled ? "Enabled" : "Off"}</Badge>
              </div>
              <p className="text-sm text-muted">{falKey.saved ? `Saved as ${falKey.hint}.` : "No key saved."}</p>
              <p className="text-sm">Enabling is required for guest try-on when the engine is fal.</p>
              <label className="text-sm">fal key
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
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={falEnabled} onChange={(event) => setFalEnabled(event.target.checked)} />
                Enable fal (guest try-on when the engine is fal, and comparisons)
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="btn secondary" type="button" disabled={busy} onClick={() => void saveFal(false)}>Save fal key</button>
                <button className="btn secondary" type="button" disabled={busy || !falKey.saved} onClick={() => void saveFal(true)}>Remove fal key</button>
                <button className="btn secondary" type="button" disabled={busy} onClick={() => setMessage("fal has no connection test. Save the key and enable it.")}>Test</button>
              </div>
            </article>
          </div>
        </section>

        <section className="card grid gap-2 p-5">
          <div className="flex items-center gap-1">
            <h2 className="text-base font-semibold">Spend cap</h2>
            <Hint label="About the spend cap">Further paid calls stop at the cap and return a labelled sample.</Hint>
          </div>
          <p className="text-sm">{formatAiInr(initial.spend.spentInr)} of {formatAiInr(initial.spend.capInr)} · {initial.spend.calls} calls</p>
          <div className="h-2 overflow-hidden rounded-full bg-sand" aria-hidden>
            <div className="h-full bg-aubergine" style={{ width: `${capPct}%` }} />
          </div>
        </section>

        {retiringHigh ? (
          <p className="text-sm" role="status">
            Calibration high still names gpt-image-1, which shuts down 23 Oct 2026. Guest try-on does not use it. The salon default is fal FLUX.
          </p>
        ) : null}
        <details className="card p-5">
          <summary className="cursor-pointer text-base font-semibold">Advanced (internal)</summary>
          <div className="mt-4 grid gap-4">
            <p className="text-sm text-muted">Calibration tiers, benchmarks, Gemini, OpenRouter, and bring-your-own keys. Guest try-on does not use these tiers.</p>
            <KeyCard
              title="Gemini"
              status={geminiKey}
              draft={geminiDraft}
              onDraft={setGeminiDraft}
              ariaLabel="Gemini key"
              helper="Used when calibration selects Gemini."
              busy={busy}
              onSave={() => void save({ provider: "gemini", apiKey: geminiDraft })}
              onTest={() => void testConnection("gemini", geminiDraft)}
            />
            <article className="card grid gap-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">OpenRouter</h3>
                <Badge tone={openRouterKey.saved ? "good" : "neutral"}>{openRouterKey.saved ? "Saved" : "Not saved"}</Badge>
                <Badge tone={openRouterKey.enabled ? "good" : "warn"}>{openRouterKey.enabled ? "Enabled" : "Off"}</Badge>
              </div>
              <p className="text-sm text-muted">{openRouterKey.saved ? `Saved as ${openRouterKey.hint}.` : "No key saved."}</p>
              <p className="text-sm">Comparisons only. OpenRouter does not proxy fal.</p>
              <label className="text-sm">OpenRouter key
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
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={openRouterEnabled} onChange={(event) => setOpenRouterEnabled(event.target.checked)} />
                Enable OpenRouter comparisons
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="btn secondary" type="button" disabled={busy} onClick={() => void saveOpenRouter(false)}>Save OpenRouter key</button>
                <button className="btn secondary" type="button" disabled={busy || !openRouterKey.saved} onClick={() => void saveOpenRouter(true)}>Remove OpenRouter key</button>
                <button className="btn secondary" type="button" disabled={busy} onClick={() => setMessage("OpenRouter has no connection test. Save the key and enable it.")}>Test</button>
              </div>
            </article>
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
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={highEnabled} onChange={(event) => setHighEnabled(event.target.checked)} />
              Enable high quality
            </label>
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
            <p className="text-sm text-muted">{hasKey ? `Saved as ${hint}.` : "No key stored for the provider above."}</p>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={allowByo} onChange={(event) => setAllowByo(event.target.checked)} />
              Let each salon owner store their own key
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
              <button className="btn secondary" type="button" disabled={busy} onClick={() => void testConnection()}>Test connection</button>
              <button className="btn secondary" type="button" disabled={busy} onClick={() => void calibrate()}>Calibration run</button>
              <button className="btn secondary" type="button" disabled={busy || !calibrationOk || mediumApproved} onClick={() => void approveMedium()}>
                Approve medium quality
              </button>
            </div>
            {mediumApproved ? <p className="text-sm">Medium quality is approved.</p> : null}
            {advanced}
          </div>
        </details>
      </form>
      {message ? <p role="status">{message}</p> : null}
      {total ? <p className="text-sm font-medium">{total}</p> : null}
      {panels.length > 0 ? (
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
      ) : null}
    </div>
  );
}

function KeyCard({
  title,
  status,
  draft,
  onDraft,
  ariaLabel,
  helper,
  busy,
  onSave,
  onTest,
}: {
  title: string;
  status: StoredKeyStatus;
  draft: string;
  onDraft: (value: string) => void;
  ariaLabel: string;
  helper: string;
  busy: boolean;
  onSave: () => void;
  onTest: () => void;
}) {
  return (
    <article className="card grid gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        <Badge tone={status.saved ? "good" : "neutral"}>{status.saved ? "Saved" : "Not saved"}</Badge>
      </div>
      <p className="text-sm text-muted">{status.saved ? `Saved as ${status.hint}.` : "No key saved."}</p>
      <p className="text-sm">{helper}</p>
      <label className="text-sm">{title} key
        <input
          className="field mt-1 font-mono"
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
          placeholder={status.saved ? status.hint || "A key is saved" : "Paste the key"}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn secondary" type="button" disabled={busy} onClick={onSave}>Save key</button>
        <button className="btn secondary" type="button" disabled={busy} onClick={onTest}>Test</button>
      </div>
    </article>
  );
}
