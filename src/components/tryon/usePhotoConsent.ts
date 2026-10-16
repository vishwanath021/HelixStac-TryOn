"use client";

import { useEffect, useRef, useState } from "react";

function sessionId() {
  const key = "helix_session";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
}

/** One photo notice per browser session. The camera stays closed until the guest agrees. */
export function usePhotoConsent(slug: string, lang: string) {
  const idRef = useRef("");
  const pending = useRef<null | (() => void)>(null);
  const [open, setOpen] = useState(false);
  const storageKey = `lookuvi-consent-${slug}`;

  if (typeof window !== "undefined" && !idRef.current) {
    try {
      idRef.current = sessionStorage.getItem(storageKey) || "";
    } catch {
      /* Private mode can refuse storage. The sheet still shows once in memory. */
    }
  }

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) idRef.current = saved;
    } catch {
      /* The in-memory id still gates this page. */
    }
  }, [storageKey]);

  async function persist() {
    if (idRef.current) return idRef.current;
    const res = await fetch("/api/v1/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, sessionId: sessionId(), lang: lang || "en", accepted: true, ageGate: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.id) return "";
    idRef.current = String(data.id);
    try {
      sessionStorage.setItem(storageKey, idRef.current);
    } catch {
      /* The id still lives for this page. */
    }
    return idRef.current;
  }

  function gate(action: () => void) {
    if (idRef.current) {
      action();
      return;
    }
    pending.current = action;
    setOpen(true);
  }

  function agree() {
    const next = pending.current;
    pending.current = null;
    setOpen(false);
    next?.();
    void persist();
  }

  function close() {
    pending.current = null;
    setOpen(false);
  }

  return { open, gate, agree, close, persist, consentId: () => idRef.current };
}
