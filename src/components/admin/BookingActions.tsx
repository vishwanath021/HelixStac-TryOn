"use client";

import { useState } from "react";

export function BookingActions({ id, status }: { id: string; status: string }) {
  const [current, setCurrent] = useState(status);
  const [note, setNote] = useState("");

  async function decide(next: "CONFIRMED" | "DECLINED") {
    const res = await fetch(`/api/v1/admin/bookings/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNote(data.message || "Could not update");
      return;
    }
    setCurrent(next);
    if (data.whatsappUrl) {
      window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
      setNote("WhatsApp opened with a short note. Send it yourself.");
    } else {
      setNote("Updated. This guest has no WhatsApp number on the booking.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide">{current}</span>
      {current === "PENDING" && (
        <>
          <button className="btn" type="button" onClick={() => void decide("CONFIRMED")}>Confirm</button>
          <button className="btn secondary" type="button" onClick={() => void decide("DECLINED")}>Decline</button>
        </>
      )}
      {note && <span className="text-xs text-muted" role="status">{note}</span>}
    </div>
  );
}
