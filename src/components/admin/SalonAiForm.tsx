"use client";

import { useState } from "react";
import type { SalonAiSettings } from "@/lib/ai/settings-store";

export function SalonAiForm({ initial, showKey }: { initial: SalonAiSettings; showKey: boolean }) {
  const [provider, setProvider] = useState(initial.provider);
  const [tier, setTier] = useState(initial.tier);
  const [apiKey, setApiKey] = useState("");
  const [hint, setHint] = useState(initial.hint);
  const [hasKey, setHasKey] = useState(initial.hasKey);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/admin/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, apiKey, tier }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "Could not save those settings.");
      return;
    }
    setHint(data.hint || "");
    setHasKey(Boolean(data.hasKey));
    if (data.tier === "test" || data.tier === "medium" || data.tier === "high") setTier(data.tier);
    setApiKey("");
    setMessage("Saved.");
  }

  async function testConnection() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/v1/admin/ai/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });
    const data = await res.json().catch(() => ({ message: "Could not reach the provider." }));
    setBusy(false);
    setMessage(data.message || (res.ok ? "Connected." : "The key was rejected."));
  }

  return (
    <form
      className="card grid max-w-xl gap-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Guest preview quality</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="tier" checked={tier === "test"} onChange={() => setTier("test")} />
          Test
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="tier" checked={tier === "medium"} disabled={!initial.mediumApproved} onChange={() => setTier("medium")} />
          Medium
          {!initial.mediumApproved && <span className="text-muted">Available after a calibration run is approved.</span>}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="tier" checked={tier === "high"} disabled={!initial.highEnabled} onChange={() => setTier("high")} />
          High
          {!initial.highEnabled && <span className="text-muted">Turned off.</span>}
        </label>
      </fieldset>
      {showKey && (
        <>
          <label className="text-sm">
            Key type
            <select className="field mt-1" value={provider} onChange={(event) => setProvider(event.target.value === "gemini" ? "gemini" : "openai")}>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>
          <label className="text-sm">
            API key
            <input
              className="field mt-1 font-mono"
              type="password"
              name="ai-key"
              autoComplete="off"
              spellCheck={false}
              aria-label="API key"
              placeholder={hasKey ? hint || "A key is saved" : "Paste the key"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
          <p className="text-xs text-muted">
            {hasKey ? `Saved as ${hint}. ` : ""}
            The key is encrypted on the server. This page never shows it again and it is not written to logs.
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn" type="submit" disabled={busy}>Save</button>
        {showKey && (
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void testConnection()}>Test connection</button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
