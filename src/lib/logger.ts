const BANNED = /photo|image|buffer|dataurl|base64|inlinedata|pixels|selfie|apikey|api_key|secret|cipher|authorization|token/i;
const KEY_TEXT = /(?:^|[^A-Za-z0-9])(?:sk-(?:proj-)?[A-Za-z0-9_\-]{8,}|AIza[0-9A-Za-z\-_]{8,})/;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return "[buffer]";
  if (value instanceof Uint8Array) return "[bytes]";
  if (typeof value === "string") {
    if (value.startsWith("data:image") || value.length > 400 || KEY_TEXT.test(value)) return "[redacted-string]";
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = BANNED.test(key) ? "[redacted]" : redact(entry, depth + 1);
    }
    return out;
  }
  return value;
}

export function logInfo(message: string, meta?: unknown) {
  console.info(message, meta ? redact(meta) : "");
}

export function logError(message: string, meta?: unknown) {
  console.error(message, meta ? redact(meta) : "");
}
