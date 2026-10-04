import sharp from "sharp";
import { BilledProviderError, UnbilledProviderError, UncertainBillingError, UnknownModelError } from "@/lib/ai/errors";
import { buildFalEditBody, falModel } from "@/lib/ai/fal-models";
import type { EditSize } from "@/lib/ai/edit-request";
import { numberEnv } from "@/lib/env";

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

async function imageLooksBlocked(bytes: Buffer, nsfw?: boolean[]) {
  const stats = await sharp(bytes, { failOn: "none" }).stats();
  const mean = stats.channels.reduce((sum, channel) => sum + channel.mean, 0) / Math.max(1, stats.channels.length);
  const black = mean < 8;
  const flagged = Array.isArray(nsfw) && nsfw.some(Boolean);
  return black || flagged;
}

type FetchImpl = typeof fetch;

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
  const deadlineMs = args.deadlineMs ?? numberEnv("FAL_QUEUE_DEADLINE_MS", 180_000);
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
    let payload: { request_id?: string; status_url?: string; error?: string } = {};
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      payload = {};
    }
    if (!response.ok || !payload.request_id) {
      if (response.status >= 400 && response.status < 500) {
        throw new UnbilledProviderError(scrub(payload.error || "fal refused the edit before it was queued."));
      }
      throw new UncertainBillingError("fal did not confirm the queue request. It was not submitted again.");
    }
    requestId = payload.request_id;
    const expected = `${QUEUE_ORIGIN}/${row.id}/requests/${requestId}/status`;
    statusUrl = payload.status_url && payload.status_url.startsWith(expected) ? payload.status_url : expected;
    if (!sameOrigin(statusUrl, QUEUE_ORIGIN)) statusUrl = expected;
  } catch (error) {
    if (error instanceof UnbilledProviderError || error instanceof UncertainBillingError || error instanceof UnknownModelError) throw error;
    if (submitted) throw new UncertainBillingError("The fal queue request left this server and the reply was lost. It was not submitted again.");
    throw new UncertainBillingError("The fal queue request timed out. It was not submitted again.");
  }

  let completed = false;
  let resultUrl = `${QUEUE_ORIGIN}/${row.id}/requests/${requestId}`;
  while (now() < deadline) {
    let statusResponse: Response;
    try {
      statusResponse = await fetchImpl(statusUrl, {
        headers: { Authorization: `Key ${args.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      await sleep(2_000);
      continue;
    }
    if (!statusResponse.ok) {
      await sleep(2_000);
      continue;
    }
    const status = (await statusResponse.json()) as { status?: string; response_url?: string; error?: string };
    if (status.status === "COMPLETED") {
      completed = true;
      if (status.response_url && status.response_url.startsWith(`${QUEUE_ORIGIN}/${row.id}/requests/${requestId}`)) {
        resultUrl = status.response_url;
      }
      if (status.error) {
        throw new BilledProviderError(args.estimateUsd, undefined, `fal finished with an error. The call was not retried. ${scrub(status.error)}`);
      }
      break;
    }
    await sleep(2_000);
  }
  if (!completed) {
    throw new UncertainBillingError("The fal edit did not finish before the deadline. The queue request was not submitted again.");
  }

  const resultResponse = await fetchImpl(resultUrl, {
    headers: { Authorization: `Key ${args.apiKey}` },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => {
    throw new UncertainBillingError("fal marked the edit complete and the result could not be read. It was not submitted again.");
  });
  if (!resultResponse.ok) {
    throw new UncertainBillingError("fal marked the edit complete and the result was refused. It was not submitted again.");
  }
  const result = (await resultResponse.json()) as {
    images?: { url?: string }[];
    has_nsfw_concepts?: boolean[];
  };
  const imageUrl = result.images?.[0]?.url || "";
  if (!imageUrl.startsWith("https://")) {
    throw new BilledProviderError(args.estimateUsd, undefined, "fal finished without an image URL. The call was not retried.");
  }
  const imageResponse = await fetchImpl(imageUrl, { signal: AbortSignal.timeout(30_000) }).catch(() => {
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
  return { image: png, requestId };
}
