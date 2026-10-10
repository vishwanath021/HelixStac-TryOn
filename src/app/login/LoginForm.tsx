"use client";

import { LookuviLockup } from "@/components/brand/LookuviMark";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("owner@demo.helixstac.app");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [magic, setMagic] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function onPassword(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) setMessage("Those details did not match. Check the demo login in the README.");
    else window.location.href = "/admin";
  }

  async function onMagic(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const res = await fetch("/api/v1/auth/magic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (data.devUrl) setMagic(data.devUrl);
    setMessage(data.message || "If the account exists, a link is on its way.");
  }

  async function openMagic() {
    const token = new URL(magic, window.location.origin).searchParams.get("token");
    if (!token) return;
    const result = await signIn("magic", { token, redirect: false });
    if (result?.error) setMessage("That link has expired.");
    else window.location.href = "/admin";
  }

  return (
    <div className="card mx-auto max-w-md p-6">
      <LookuviLockup />
      <h1 className="page-title mt-6">Salon login</h1>
      <p className="mt-2 text-sm text-muted">Owners and staff use email and password. Magic link works when email is configured. In local dev the link can appear here.</p>
      <form className="mt-4 space-y-3" data-ready={ready ? "yes" : "no"} onSubmit={onPassword}>
        <label className="block text-sm">Email
          <input className="field mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="block text-sm">Password
          <input className="field mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
        </label>
        <button className="btn w-full" type="submit">Sign in</button>
      </form>
      <form className="mt-4" onSubmit={onMagic}>
        <button className="btn secondary w-full" type="submit">Email me a link</button>
      </form>
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
      {magic && (
        <button className="btn mt-3 w-full" type="button" onClick={() => void openMagic()}>Continue with the dev link</button>
      )}
    </div>
  );
}
