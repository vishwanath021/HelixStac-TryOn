"use client";

import { useState } from "react";

export function SalonModeCard({ initialUrl, canRotate }: { initialUrl: string; canRotate: boolean }) {
  const [url, setUrl] = useState(initialUrl);
  const [qr, setQr] = useState("");
  const [message, setMessage] = useState("");

  async function rotate() {
    const res = await fetch("/api/v1/admin/salon-token", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.message || "Only the owner can create this link.");
      return;
    }
    setUrl(data.url);
    setQr(data.qr || "");
    setMessage("New salon-mode link. Older links for this salon stop working.");
  }

  return (
    <article className="card p-4 md:col-span-2">
      <h2 className="font-serif text-2xl">Salon mode</h2>
      <p className="mt-2 text-sm leading-6">
        This link is for a phone or QR at the chair. Guests who open it skip the anonymous daily preview cap. The public standee does not include it.
      </p>
      {url ? (
        <>
          {qr && <img className="mt-3 w-40" src={qr} alt="" />}
          <p className="mt-3 break-all text-xs text-muted">{url}</p>
        </>
      ) : (
        <p className="mt-3 text-sm">No salon-mode link yet.</p>
      )}
      {canRotate ? (
        <button className="btn mt-3" type="button" onClick={() => void rotate()}>{url ? "Rotate link" : "Create salon-mode link"}</button>
      ) : (
        <p className="mt-3 text-sm text-muted">Ask the owner to create or rotate this link.</p>
      )}
      {message && <p className="mt-2 text-sm" role="status">{message}</p>}
    </article>
  );
}
