/** A signed generation URL on this app. Anything else is dropped from a WhatsApp message. */
export function shareableLookUrl(value: string | null | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const base = new URL(process.env.APP_BASE_URL || "http://localhost:3000");
    if (url.origin !== base.origin) return "";
    if (url.pathname !== "/api/v1/media") return "";
    const key = url.searchParams.get("key") || "";
    if (!key.startsWith("generations/") || !url.searchParams.get("exp") || !url.searchParams.get("sig")) return "";
    return url.toString();
  } catch {
    return "";
  }
}
