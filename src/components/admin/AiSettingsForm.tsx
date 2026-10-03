"use client";

import { useState } from "react";
import type { AiSettingsView } from "@/lib/ai/settings-store";

export function AiSettingsForm({
  scope,
  initial,
  canToggleByo = false,
}: {
  scope: "platform" | "salon";
  initial: AiSettingsView;
  canToggleByo?: boolean;
}) {
  const [provider, setProvider] = useState<"openai" | "gemini">(initial.provider);
  const [apiKey, setApiKey] = useState("");
  const [allowByo, setAllowByo] = useState(initial.allowByo);
  const [hint, setHint] = useState(initial.hint);
  const [hasKey, setHasKey] = useState(initial.hasKey);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = scope === "platform" ? "/api/v1/super/ai" : "/api/v1/admin/ai";

  async function save() {
    setBusy(true);
    setMessage("");
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, apiKey, allowByo }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.message || "Could not save those settings.");
      return;
    }
    setHint(data.hint || "");
    setHasKey(Boolean(data.hasKey));
    setApiKey("");
    setMessage(hasKey && !apiKey ? "Provider saved. The stored key was kept." : "Saved. The key stays on the server.");
  }

  async function testConnection() {
    setBusy(true);
    setMessage("");
    const res = await fetch(`${endpoint}/test`, {
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
      className="card grid max-w-xl gap-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p role="status">
        Paid preview estimate: ₹{initial.spend.spentInr.toFixed(2)} of ₹{initial.spend.capInr.toFixed(0)} ({initial.spend.calls} calls).
      </p>
      <label className="text-sm">
        Provider
        <select className="field mt-1" value={provider} onChange={(event) => setProvider(event.target.value === "gemini" ? "gemini" : "openai")}>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </select>
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
      <p className="text-xs text-muted">
        {hasKey ? `Saved as ${hint}. ` : ""}
        The key is encrypted on the server. This page never shows it again and it is not written to logs.
      </p>
      {canToggleByo && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allowByo} onChange={(event) => setAllowByo(event.target.checked)} />
          Let each salon owner store their own key
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn" type="submit" disabled={busy}>Save</button>
        <button className="btn secondary" type="button" disabled={busy} onClick={() => void testConnection()}>Test connection</button>
      </div>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
