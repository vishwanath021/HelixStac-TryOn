"use client";

import { useState } from "react";

export function TotpPanel({ enabled, required }: { enabled: boolean; required: boolean }) {
  const [on, setOn] = useState(enabled);
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  async function start() {
    setMessage("");
    setRecovery([]);
    const res = await fetch("/api/v1/account/totp", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.message || "Could not start authenticator setup.");
      return;
    }
    setSecret(data.secret || "");
    setQr(data.qr || "");
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const res = await fetch("/api/v1/account/totp/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.message || "That code was not accepted.");
      return;
    }
    setOn(true);
    setSecret("");
    setQr("");
    setCode("");
    setRecovery(data.recoveryCodes || []);
    setMessage(data.message || "Authenticator is on.");
  }

  async function disable(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const res = await fetch("/api/v1/account/totp/disable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password, code }),
    });
    const data = await res.json();
    setMessage(data.message || (res.ok ? "Authenticator turned off." : "Could not turn it off."));
    if (res.ok) {
      setOn(false);
      setPassword("");
      setCode("");
    }
  }

  return (
    <div className="card max-w-lg space-y-4 p-6">
      <h1 className="page-title">Authenticator</h1>
      <p className="text-sm text-muted">
        {required
          ? "Production super-admin accounts must use an authenticator app. Recovery codes are the backup if you lose the phone."
          : "Optional for salon owners. Add an authenticator app if you want a second step at sign-in."}
      </p>
      <p className="text-sm">{on ? "Authenticator is on." : "Authenticator is off."}</p>
      <button className="btn" type="button" onClick={() => void start()}>{on ? "Replace authenticator" : "Set up authenticator"}</button>
      {qr && (
        <form className="space-y-3" onSubmit={confirm}>
          <img src={qr} alt="Authenticator QR code" width={180} height={180} />
          <p className="break-all text-xs">If you cannot scan, type this secret: {secret}</p>
          <label className="block text-sm">6-digit code
            <input className="field mt-1" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required />
          </label>
          <button className="btn" type="submit">Confirm and show recovery codes</button>
        </form>
      )}
      {recovery.length > 0 && (
        <div>
          <p className="text-sm">Save these codes somewhere offline. Each one works once.</p>
          <ul className="mt-2 font-mono text-sm">
            {recovery.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {on && !required && (
        <form className="space-y-3" onSubmit={disable}>
          <label className="block text-sm">Password
            <input className="field mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <label className="block text-sm">Current code or a recovery code
            <input className="field mt-1" value={code} onChange={(event) => setCode(event.target.value)} required />
          </label>
          <button className="btn secondary" type="submit">Turn off authenticator</button>
        </form>
      )}
      {message && <p className="text-sm" role="status">{message}</p>}
    </div>
  );
}
