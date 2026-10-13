import { logInfo } from "@/lib/logger";

export type NotifyKind = "joined" | "almost" | "called" | "confirmed";

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
  WHATSAPP_TEMPLATE_CALLED?: string;
  WHATSAPP_TEMPLATE_CONFIRMED?: string;
  WHATSAPP_TEMPLATE_LANG?: string;
  MSG91_AUTH_KEY?: string;
  MSG91_SENDER_ID?: string;
};

type FetchLike = typeof fetch;

export function whatsAppConfigured(env: NotifyEnv) {
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);
}

export function msg91Configured(env: NotifyEnv) {
  return Boolean(env.MSG91_AUTH_KEY && env.MSG91_SENDER_ID);
}

export function templateFor(kind: NotifyKind, env: NotifyEnv) {
  if (kind === "joined") return env.WHATSAPP_TEMPLATE_JOIN || "";
  if (kind === "almost") return env.WHATSAPP_TEMPLATE_ALERT || "";
  if (kind === "called") return env.WHATSAPP_TEMPLATE_CALLED || "";
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

export async function sendMsg91(message: NotifyMessage, env: NotifyEnv, fetchImpl: FetchLike = fetch): Promise<NotifyResult> {
  if (!msg91Configured(env)) return { ok: false, provider: "msg91", error: "OFF" };
  const res = await fetchImpl("https://control.msg91.com/api/v5/sms", {
    method: "POST",
    headers: {
      authkey: env.MSG91_AUTH_KEY || "",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: env.MSG91_SENDER_ID,
      route: "4",
      country: "91",
      sms: [{ message: message.body.slice(0, 480), to: [message.to] }],
    }),
  });
  if (!res.ok) return { ok: false, provider: "msg91", error: `HTTP_${res.status}` };
  return { ok: true, provider: "msg91" };
}

export async function sendLog(message: NotifyMessage): Promise<NotifyResult> {
  logInfo("queue notify", { provider: "log", kind: message.kind, tail: message.to.slice(-4) });
  return { ok: true, provider: "log" };
}

/** WhatsApp Cloud API when both env values are set, MSG91 SMS if that send cannot run, otherwise a log line. */
export async function notifyGuest(message: NotifyMessage, env: NotifyEnv = process.env as NotifyEnv, fetchImpl: FetchLike = fetch): Promise<NotifyResult> {
  if (!message.to) return { ok: false, provider: "none", error: "PHONE" };
  if (whatsAppConfigured(env)) {
    const result = await sendWhatsApp(message, env, fetchImpl);
    if (result.ok) return result;
    if (msg91Configured(env)) return sendMsg91(message, env, fetchImpl);
    logInfo("queue notify skipped", { provider: "whatsapp", kind: message.kind, error: result.error || "" });
    return result;
  }
  if (msg91Configured(env)) return sendMsg91(message, env, fetchImpl);
  return sendLog(message);
}
