"use client";

import { useState } from "react";

export function PasswordPanel() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const res = await fetch("/api/v1/account/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setOk(res.ok);
    setMessage(data.message || (res.ok ? "Password changed." : "Could not change the password."));
    if (res.ok) {
      setCurrent("");
      setNew("");
      setConfirm("");
    }
  }

  return (
    <form className="card max-w-lg space-y-3 p-6" onSubmit={submit}>
      <h2 className="page-title">Change password</h2>
      <label className="block text-sm">Current password
        <input className="field mt-1" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className="block text-sm">New password (at least 12 characters)
        <input className="field mt-1" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(e) => setNew(e.target.value)} required />
      </label>
      <label className="block text-sm">Confirm new password
        <input className="field mt-1" type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} required />
      </label>
      <button className="btn" type="submit">Change password</button>
      {message && <p className={ok ? "text-sm" : "text-sm text-red-700"} role="status">{message}</p>}
    </form>
  );
}
