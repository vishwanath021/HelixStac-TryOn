import { numberEnv } from "@/lib/env";

/** One hour. The super-admin comparison keeps the same fal request for this long. */
export const FAL_TIMEOUT_DEFAULT_MS = 3_600_000;

/** Extra time for the upload, the response write, and the browser, after the poll window. */
export const FAL_HOLD_MS = 180_000;

/**
 * Poll window for one fal queue request.
 * FAL_TIMEOUT_MS wins. FAL_QUEUE_DEADLINE_MS remains as the older name.
 */
export function falTimeoutMs() {
  const named = process.env.FAL_TIMEOUT_MS;
  if (named != null && named !== "") {
    const value = Number(named);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return numberEnv("FAL_QUEUE_DEADLINE_MS", FAL_TIMEOUT_DEFAULT_MS);
}

export function falRouteHoldMs() {
  return falTimeoutMs() + FAL_HOLD_MS;
}

export function falWaitingLabel(elapsedSeconds: number, waitSeconds: number) {
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  const wait = Math.max(0, Math.floor(waitSeconds));
  return `Still waiting. ${elapsed}s elapsed. This can take up to ${wait} seconds.`;
}
