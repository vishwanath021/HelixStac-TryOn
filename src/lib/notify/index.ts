import { logInfo } from "@/lib/logger";

export type NotifyKind = "joined" | "almost" | "confirmed";

export type NotifyMessage = {
  to: string;
  kind: NotifyKind;
  body: string;
  parameters: string[];
};

export type NotifyResult = { ok: boolean; provider: string; error?: string };

export type NotifyEnv = {
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_ID?: string;
  WHATSAPP_TEMPLATE_JOIN?: string;
  WHATSAPP_TEMPLATE_ALERT?: string;
  WHATSAPP_TEMPLATE_CONFIRMED?: string;
  WHATSAPP_TEMPLATE_LANG?: string;
};

type FetchLike = typeof fetch;

export function whatsAppConfigured(env: NotifyEnv) {
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);
}

export function templateFor(kind: NotifyKind, env: NotifyEnv) {
  if (kind === "joined") return env.WHATSAPP_TEMPLATE_JOIN || "";
  if (kind === "almost") return env.WHATSAPP_TEMPLATE_ALERT || "";
  return env.WHATSAPP_TEMPLATE_CONFIRMED || "";
}

export async function sendWhatsApp(message: NotifyMessage, env: NotifyEnv, fetchImpl: FetchLike = fetch): Promise<NotifyResult> {
  const name = templateFor(message.kind, env);
  if (!whatsAppConfigured(env)) return { ok: false, provider: "whatsapp", error: "OFF" };
  if (!name) return { ok: false, provider: "whatsapp", error: "TEMPLATE" };
  const res = await fetchImpl(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: message.to,
      type: "template",
      template: {
        name,
        language: { code: env.WHATSAPP_TEMPLATE_LANG || "en" },
        components: [
          {
            type: "body",
            parameters: message.parameters.map((text) => ({ type: "text", text: text.slice(0, 200) })),
          },
        ],
      },
    }),
  });
  if (!res.ok) return { ok: false, provider: "whatsapp", error: `HTTP_${res.status}` };
  return { ok: true, provider: "whatsapp" };
}

export async function sendLog(message: NotifyMessage): Promise<NotifyResult> {
  logInfo("queue notify", { provider: "log", kind: message.kind, tail: message.to.slice(-4) });
  return { ok: true, provider: "log" };
}

/** WhatsApp Cloud API when it is configured and the send succeeds. A missing config or a failed send is logged and not retried. */
export async function notifyGuest(message: NotifyMessage, env: NotifyEnv = process.env as NotifyEnv, fetchImpl: FetchLike = fetch): Promise<NotifyResult> {
  if (!message.to) return { ok: false, provider: "none", error: "PHONE" };
  if (whatsAppConfigured(env)) {
    const result = await sendWhatsApp(message, env, fetchImpl);
    if (result.ok) return result;
    await sendLog(message);
    return { ok: false, provider: "log", error: result.error };
  }
  return sendLog(message);
}
