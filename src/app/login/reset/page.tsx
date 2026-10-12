"use client";

import { useState } from "react";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const token = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") || "";

  async function requestLink(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/v1/auth/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setMessage(data.message || "If that account exists, we sent a reset link.");
    if (data.devUrl) setMessage(`${data.message} Dev link: ${data.devUrl}`);
  }

  async function choosePassword(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/v1/auth/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    setMessage(data.message || data.error || "Sent");
  }

  return (
    <main className="px-4 py-16">
      <div className="card mx-auto max-w-md p-6">
        <h1 className="page-title">Reset password</h1>
        {token ? (
          <form className="mt-4 space-y-3" onSubmit={choosePassword}>
            <label className="block text-sm">New password
              <input className="field mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} />
            </label>
            <button className="btn w-full" type="submit">Update password</button>
          </form>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={requestLink}>
            <label className="block text-sm">Email
              <input className="field mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <button className="btn w-full" type="submit">Email a reset link</button>
          </form>
        )}
        {message && <p className="mt-3 text-sm" role="status">{message}</p>}
        <p className="mt-4 text-sm"><a href="/login">Back to sign in</a></p>
      </div>
    </main>
  );
}
