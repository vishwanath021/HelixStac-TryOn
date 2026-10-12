"use client";

import { useState } from "react";

export function DeleteBenchmarkButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function remove() {
    if (busy) return;
    if (!window.confirm("Delete this benchmark and its photos now?")) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/v1/super/ai/benchmark/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.message || "The photos were not deleted.");
        return;
      }
      window.location.href = "/super/ai";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <button className="btn" type="button" disabled={busy} onClick={() => void remove()}>
        {busy ? "Deleting..." : "Delete now"}
      </button>
      {message && <p className="mt-2 text-sm">{message}</p>}
    </div>
  );
}
