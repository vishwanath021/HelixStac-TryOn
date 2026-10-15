"use client";

import { useState } from "react";

const NEXT: Record<string, string> = {
  NEW: "CONTACTED",
  CONTACTED: "BOOKED",
  BOOKED: "CLOSED",
  CLOSED: "NEW",
};

const LABEL: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  BOOKED: "Booked",
  CLOSED: "Closed",
};

export function LeadStatus({ id, status }: { id: string; status: string }) {
  const [current, setCurrent] = useState(status);
  const label = LABEL[current] || current;

  async function cycle() {
    const next = NEXT[current] || "CONTACTED";
    setCurrent(next);
    const res = await fetch(`/api/v1/admin/leads/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) setCurrent(current);
  }

  return (
    <button className="chip" type="button" aria-label={`Status ${label}. Tap to change.`} onClick={() => void cycle()}>
      {label}
    </button>
  );
}
