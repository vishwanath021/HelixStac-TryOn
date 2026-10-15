"use client";

import { LookuviLockup } from "@/components/brand/LookuviMark";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

export function LoginForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function onPassword(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const result = await signIn("credentials", { email, password, totp, redirect: false });
    if (result?.code === "rate_limit") setMessage("Too many sign-in attempts. Wait a few minutes and try again.");
    else if (result?.code === "totp_required" || result?.code === "totp_invalid") {
      setNeedTotp(true);
      setMessage(result.code === "totp_invalid" ? "That authenticator code was not accepted." : "Enter the 6-digit code from your authenticator, or a recovery code.");
    } else if (result?.error) setMessage("Those details did not match.");
    else window.location.href = "/admin";
  }

  return (
    <div className="card mx-auto max-w-md p-6">
      <LookuviLockup />
      <h1 className="page-title mt-6">Salon login</h1>
      <p className="mt-2 text-sm text-muted">Owners and staff sign in with email and password.</p>
      <form className="mt-4 space-y-3" method="post" action="/login" data-ready={ready ? "yes" : "no"} onSubmit={onPassword}>
        <label className="block text-sm">Email
          <input className="field mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="block text-sm">Password
          <input className="field mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
        </label>
        {needTotp && (
          <label className="block text-sm">Authenticator or recovery code
            <input className="field mt-1" inputMode="text" autoComplete="one-time-code" value={totp} onChange={(event) => setTotp(event.target.value)} required />
          </label>
        )}
        <button className="btn w-full" type="submit" disabled={!ready}>{ready ? "Sign in" : "Loading…"}</button>
      </form>
      <p className="mt-3 text-sm"><a href="/login/reset">Forgot password</a></p>
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </div>
  );
}
