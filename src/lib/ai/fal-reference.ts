import sharp from "sharp";
import { BilledProviderError, UnbilledProviderError, UncertainBillingError, UnknownModelError } from "@/lib/ai/errors";
import { buildFalEditBody, falModel } from "@/lib/ai/fal-models";
import type { EditSize } from "@/lib/ai/edit-request";
import { numberEnv } from "@/lib/env";
import { logInfo } from "@/lib/logger";

const QUEUE_ORIGIN = "https://queue.fal.run";
const REST_ORIGIN = "https://rest.fal.ai";

/** fal retries a failed queue request up to 10 times. This header turns that off. */
export function falSubmitHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Key ${apiKey}`,
    "Content-Type": "application/json",
    "X-Fal-No-Retry": "1",
  };
}

function scrub(text: string) {
  return text.replace(/sk-[A-Za-z0-9_\-]{8,}/g, "sk-[redacted]").replace(/AIza[0-9A-Za-z\-_]{8,}/g, "AIza[redacted]").replace(/Key\s+[^\s"]+/gi, "Key [redacted]").slice(0, 400);
}

function sameOrigin(url: string, origin: string) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** Queue routes live on the app id (owner/name), not a nested endpoint path. */
export function falQueueAppId(endpointId: string) {
  const [owner, app] = endpointId.split("/").filter(Boolean);
  if (!owner || !app) return endpointId;
  return `${owner}/${app}`;
}

/**
 * Use the URL fal returned when it is on queue.fal.run and names this request.
 * A nested endpoint's status_url is shorter than the submit path, so it must not be rebuilt from the full id.
 */
export function acceptedQueueUrl(raw: string | undefined, requestId: string) {
  if (!raw || !requestId || !sameOrigin(raw, QUEUE_ORIGIN)) return "";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (!parsed.pathname.includes(`/requests/${requestId}`)) return "";
  if (parsed.pathname.endsWith("/cancel")) return "";
  return parsed.toString();
}

function withLogs(url: string) {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("logs")) parsed.searchParams.set("logs", "1");
  return parsed.toString();
}

type StatusBody = {
  status?: string;
  response_url?: string;
  error?: string;
  error_type?: string;
  logs?: { message?: string }[];
};

function statusDetail(status: StatusBody) {
  const logs = Array.isArray(status.logs)
    ? status.logs.map((entry) => entry?.message || "").filter(Boolean).slice(-3).join(" | ")
    : "";
  return scrub([status.error_type, status.error, logs].filter(Boolean).join(" — "));
}

async function imageLooksBlocked(bytes: Buffer, nsfw?: boolean[]) {
  const stats = await sharp(bytes, { failOn: "none" }).stats();
  const mean = stats.channels.reduce((sum, channel) => sum + channel.mean, 0) / Math.max(1, stats.channels.length);
  const black = mean < 8;
  const flagged = Array.isArray(nsfw) && nsfw.some(Boolean);
  return black || flagged;
}

type FetchImpl = typeof fetch;

/** One queue request is polled for this long. Default is one hour. FAL_TIMEOUT_MS overrides the older FAL_QUEUE_DEADLINE_MS. */
export function falTimeoutMs() {
  const named = process.env.FAL_TIMEOUT_MS;
  if (named != null && named !== "") {
    const value = Number(named);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return numberEnv("FAL_QUEUE_DEADLINE_MS", 3_600_000);
}

async function uploadOne(args: {
  fetchImpl: FetchImpl;
  apiKey: string;
  bytes: Buffer;
  fileName: string;
  contentType: string;
}) {
  let initiate: Response;
  try {
    initiate = await args.fetchImpl(`${REST_ORIGIN}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
      method: "POST",
      headers: {
        Authorization: `Key ${args.apiKey}`,
        "Content-Type": "application/json",
        "X-Fal-Object-Lifecycle-Preference": JSON.stringify({ expiration_duration_seconds: 3600 }),
      },
      body: JSON.stringify({ file_name: args.fileName, content_type: args.contentType }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new UnbilledProviderError("The fal upload did not start. No edit was submitted.");
  }
  if (initiate.status === 401 || initiate.status === 403) {
    throw new UnbilledProviderError("fal rejected the key before an edit was submitted.");
  }
  if (!initiate.ok) throw new UnbilledProviderError("The fal upload was refused. No edit was submitted.");
  const payload = (await initiate.json()) as { upload_url?: string; file_url?: string };
  if (!payload.upload_url || !payload.file_url || !payload.upload_url.startsWith("https://") || !payload.file_url.startsWith("https://")) {
    throw new UnbilledProviderError("fal did not return an upload URL. No edit was submitted.");
  }
  let put: Response;
  try {
    put = await args.fetchImpl(payload.upload_url, {
      method: "PUT",
      headers: { "Content-Type": args.contentType },
      body: new Uint8Array(args.bytes),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new UnbilledProviderError("The fal upload did not finish. No edit was submitted.");
  }
  if (!put.ok) throw new UnbilledProviderError("The fal upload was refused. No edit was submitted.");
  return payload.file_url;
}

/**
 * One queue submit, then poll. X-Fal-No-Retry is always sent.
 * A timeout after the submit is an unknown bill. The submit is not repeated.
 * Input CDN files are not deleted: the payloads API leaves input files in place. The upload sets a 1 hour expiry instead.
 */
export async function postFalReferenceEdit(args: {
  apiKey: string;
  endpointId: string;
  prompt: string;
  selfiePng: Buffer;
  referenceJpeg: Buffer;
  size: EditSize;
  estimateUsd: number;
  fetchImpl?: FetchImpl;
  now?: () => number;
  deadlineMs?: number;
  sleep?: (ms: number) => Promise<void>;
}) {
  const row = falModel(args.endpointId);
  if (!row) throw new UnknownModelError(`${args.endpointId} is not a configured fal edit. No other model was called.`);
  const fetchImpl = args.fetchImpl ?? fetch;
  const now = args.now ?? Date.now;
  const deadlineMs = args.deadlineMs ?? falTimeoutMs();
  const sleep = args.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const selfieUrl = await uploadOne({ fetchImpl, apiKey: args.apiKey, bytes: args.selfiePng, fileName: "selfie.png", contentType: "image/png" });
  const referenceUrl = await uploadOne({ fetchImpl, apiKey: args.apiKey, bytes: args.referenceJpeg, fileName: "style-reference.jpg", contentType: "image/jpeg" });
  const body = buildFalEditBody(row.id, { prompt: args.prompt, selfieUrl, referenceUrl, size: args.size });
  if (!body) throw new UnknownModelError(`${row.id} is not a configured fal edit. No other model was called.`);
  const started = now();
  const deadline = started + deadlineMs;
  let submitted = false;
  let requestId = "";
  let statusUrl = "";
  let resultUrl = "";
  try {
    const response = await fetchImpl(`${QUEUE_ORIGIN}/${row.id}`, {
      method: "POST",
      headers: falSubmitHeaders(args.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    submitted = true;
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new UnbilledProviderError("fal rejected the key. The edit was not accepted.");
    }
    let payload: { request_id?: string; status_url?: string; response_url?: string; error?: string } = {};
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      payload = {};
    }
    if (!response.ok || !payload.request_id) {
      if (response.status >= 400 && response.status < 500) {
        throw new UnbilledProviderError(scrub(payload.error || text || "fal refused the edit before it was queued."));
      }
      throw new UncertainBillingError("fal did not confirm the queue request. It was not submitted again.");
    }
    requestId = payload.request_id;
    logInfo("fal queue submit", { endpointId: row.id, requestId });
    const appId = falQueueAppId(row.id);
    statusUrl = acceptedQueueUrl(payload.status_url, requestId) || `${QUEUE_ORIGIN}/${appId}/requests/${requestId}/status`;
    resultUrl = acceptedQueueUrl(payload.response_url, requestId) || `${QUEUE_ORIGIN}/${appId}/requests/${requestId}/response`;
  } catch (error) {
    if (error instanceof UnbilledProviderError || error instanceof UncertainBillingError || error instanceof UnknownModelError) throw error;
    if (submitted) throw new UncertainBillingError("The fal queue request left this server and the reply was lost. It was not submitted again.");
    throw new UncertainBillingError("The fal queue request timed out. It was not submitted again.");
  }

  let completed = false;
  let lastStatusError = "";
  while (now() < deadline) {
    let statusResponse: Response;
    try {
      statusResponse = await fetchImpl(withLogs(statusUrl), {
        headers: { Authorization: `Key ${args.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      await sleep(2_000);
      continue;
    }
    if (!statusResponse.ok) {
      lastStatusError = scrub(await statusResponse.text().catch(() => ""));
      await sleep(2_000);
      continue;
    }
    const status = (await statusResponse.json()) as StatusBody;
    const returned = acceptedQueueUrl(status.response_url, requestId);
    if (returned) resultUrl = returned;
    if (status.status === "IN_QUEUE" || status.status === "IN_PROGRESS") {
      await sleep(2_000);
      continue;
    }
    if (status.status === "COMPLETED") {
      completed = true;
      const detail = statusDetail(status);
      if (status.error || status.error_type) {
        throw new BilledProviderError(args.estimateUsd, undefined, `fal finished with an error. The call was not retried. ${detail}`);
      }
      break;
    }
    lastStatusError = statusDetail(status) || scrub(JSON.stringify(status).slice(0, 400));
    await sleep(2_000);
  }
  if (!completed) {
    throw new UncertainBillingError(`The fal edit did not finish before the deadline. The queue request was not submitted again.${lastStatusError ? ` ${lastStatusError}` : ""}`);
  }
  if (!resultUrl) resultUrl = `${QUEUE_ORIGIN}/${falQueueAppId(row.id)}/requests/${requestId}/response`;

  const resultResponse = await fetchImpl(resultUrl, {
    headers: { Authorization: `Key ${args.apiKey}` },
    signal: AbortSignal.timeout(Math.max(1, deadline - now())),
  }).catch(() => {
    throw new UncertainBillingError("fal marked the edit complete and the result could not be read. It was not submitted again.");
  });
  if (!resultResponse.ok) {
    const body = scrub(await resultResponse.text().catch(() => ""));
    throw new UncertainBillingError(`fal marked the edit complete and the result was refused. It was not submitted again.${body ? ` ${body}` : ""}`);
  }
  const result = (await resultResponse.json()) as {
    images?: { url?: string; width?: number; height?: number }[];
    has_nsfw_concepts?: boolean[];
    error?: string;
    detail?: string;
  };
  if (result.error || (typeof result.detail === "string" && result.detail)) {
    throw new BilledProviderError(args.estimateUsd, undefined, `fal finished with an error. The call was not retried. ${scrub(result.error || result.detail || "")}`);
  }
  const imageUrl = result.images?.[0]?.url || "";
  if (!imageUrl.startsWith("https://")) {
    throw new BilledProviderError(args.estimateUsd, undefined, "fal finished without an image URL. The call was not retried.");
  }
  const imageResponse = await fetchImpl(imageUrl, { signal: AbortSignal.timeout(Math.max(1, deadline - now())) }).catch(() => {
    throw new UncertainBillingError("The fal image URL could not be downloaded. The edit was not submitted again.");
  });
  if (!imageResponse.ok) {
    throw new UncertainBillingError("The fal image URL was refused. The edit was not submitted again.");
  }
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (await imageLooksBlocked(bytes, result.has_nsfw_concepts)) {
    throw new BilledProviderError(
      args.estimateUsd,
      undefined,
      "The safety checker blocked this image. fal returned a black frame or marked it unsafe. The call was not retried.",
    );
  }
  const png = await sharp(bytes, { failOn: "none" }).rotate().png().toBuffer();
  const meta = await sharp(png, { failOn: "none" }).metadata();
  const width = meta.width || result.images?.[0]?.width || 0;
  const height = meta.height || result.images?.[0]?.height || 0;
  return { image: png, requestId, outputSize: width && height ? `${width}x${height}` : "" };
}
