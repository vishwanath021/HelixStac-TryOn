function dsnParts(dsn: string) {
  const url = new URL(dsn);
  const projectId = url.pathname.replace(/\//g, "");
  if (!projectId || !url.username) return null;
  return { projectId, key: decodeURIComponent(url.username), host: url.host, protocol: url.protocol };
}

/** Optional. No-op unless SENTRY_DSN is set. Does not log the event body. */
export async function captureException(message: string, meta?: unknown) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const parts = dsnParts(dsn);
  if (!parts) return;
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    message,
    level: "error",
    platform: "node",
    timestamp: Date.now() / 1000,
    extra: meta && typeof meta === "object" ? meta : undefined,
    environment: process.env.NODE_ENV || "development",
  };
  const envelope = `{"event_id":"${eventId}","dsn":${JSON.stringify(dsn)}}\n{"type":"event"}\n${JSON.stringify(event)}`;
  await fetch(`${parts.protocol}//${parts.host}/api/${parts.projectId}/envelope/`, {
    method: "POST",
    headers: {
      "content-type": "application/x-sentry-envelope",
      "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${parts.key}, sentry_client=lookuvi/1`,
    },
    body: envelope,
  }).catch(() => undefined);
}
