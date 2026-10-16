"use client";

export const GUEST_SESSION_KEY = "helix_session";

/** One browser session id, shared by try-on, bridal, and the photo notice. */
export function guestSessionId() {
  const existing = sessionStorage.getItem(GUEST_SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(GUEST_SESSION_KEY, created);
  return created;
}
