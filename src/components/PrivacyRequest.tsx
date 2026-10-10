"use client";

import { useState } from "react";

export function PrivacyRequest() {
  const [slug, setSlug] = useState("demo-salon");
  const [contact, setContact] = useState("");
  const [kind, setKind] = useState("delete");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const sessionId = sessionStorage.getItem("helix_session");
    const res = await fetch("/api/v1/data-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, kind, contact, sessionId }),
    });
    const data = await res.json();
    setMessage(data.message || data.error || "Sent");
  }

  return (
    <form className="card space-y-3 p-4" onSubmit={submit}>
      <h2 className="font-serif text-2xl">Request access, deletion, or withdrawal</h2>
      <label className="block text-sm">Salon slug
        <input className="field mt-1" value={slug} onChange={(event) => setSlug(event.target.value)} required />
      </label>
      <label className="block text-sm">Email or phone
        <input className="field mt-1" value={contact} onChange={(event) => setContact(event.target.value)} required />
      </label>
      <label className="block text-sm">Request
        <select className="field mt-1" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="withdraw">Withdraw consent</option>
          <option value="delete">Delete my lead</option>
          <option value="access">Access what you store</option>
        </select>
      </label>
      <button className="btn" type="submit">Send</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
