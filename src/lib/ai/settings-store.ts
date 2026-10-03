import { z } from "zod";
import { decryptSecret, encryptSecret, keyHint } from "@/lib/crypto/secret";
import { allowByoKey } from "@/lib/ai/credentials";
import { spendSummary } from "@/lib/ai/spend";
import { prisma } from "@/lib/prisma";

const providerSchema = z.enum(["openai", "gemini"]);

export type AiSettingsView = {
  provider: "openai" | "gemini";
  hasKey: boolean;
  hint: string;
  allowByo: boolean;
  spend: { spentInr: number; capInr: number; calls: number };
};

async function setting(key: string) {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return row?.value ?? "";
}

async function putSetting(key: string, value: string) {
  await prisma.platformSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function platformAiView(): Promise<AiSettingsView> {
  const provider = providerSchema.safeParse(await setting("platform_ai_provider"));
  const cipher = await setting("platform_ai_key_cipher");
  return {
    provider: provider.success ? provider.data : "openai",
    hasKey: Boolean(cipher),
    hint: await setting("platform_ai_key_hint"),
    allowByo: await allowByoKey(),
    spend: await spendSummary(),
  };
}

export async function salonAiView(tenantId: string): Promise<AiSettingsView> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { aiProvider: true, aiKeyCipher: true, aiKeyHint: true },
  });
  const provider = providerSchema.safeParse(tenant?.aiProvider);
  return {
    provider: provider.success ? provider.data : "openai",
    hasKey: Boolean(tenant?.aiKeyCipher),
    hint: tenant?.aiKeyHint || "",
    allowByo: await allowByoKey(),
    spend: await spendSummary(),
  };
}

function freshKey(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("•")) return null;
  if (!/^[A-Za-z0-9_\-.]{12,300}$/.test(trimmed)) {
    throw new Error("INVALID_KEY");
  }
  return trimmed;
}

export async function savePlatformAi(input: { provider: "openai" | "gemini"; apiKey: string; allowByo: boolean }, actorId: string) {
  const next = freshKey(input.apiKey);
  await putSetting("platform_ai_provider", input.provider);
  await putSetting("allow_byo_key", input.allowByo ? "true" : "false");
  if (next) {
    await putSetting("platform_ai_key_cipher", encryptSecret(next));
    await putSetting("platform_ai_key_hint", keyHint(next));
  }
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "AI_KEY_UPDATE",
      target: "platform",
      meta: JSON.stringify({ provider: input.provider, rotated: Boolean(next), allowByo: input.allowByo }),
    },
  });
}

export async function saveSalonAi(tenantId: string, input: { provider: "openai" | "gemini"; apiKey: string }, actorId: string) {
  if (!(await allowByoKey())) throw new Error("BYO_OFF");
  const next = freshKey(input.apiKey);
  const current = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { aiKeyCipher: true } });
  if (!next && !current?.aiKeyCipher) throw new Error("INVALID_KEY");
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      aiProvider: input.provider,
      ...(next ? { aiKeyCipher: encryptSecret(next), aiKeyHint: keyHint(next) } : {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "AI_KEY_UPDATE",
      target: tenantId,
      meta: JSON.stringify({ provider: input.provider, rotated: Boolean(next), scope: "salon" }),
    },
  });
}

export async function storedKey(scope: "platform" | { tenantId: string }) {
  if (scope === "platform") {
    const cipher = await setting("platform_ai_key_cipher");
    const provider = providerSchema.safeParse(await setting("platform_ai_provider"));
    if (!cipher || !provider.success) return null;
    return { provider: provider.data, apiKey: decryptSecret(cipher) };
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { aiProvider: true, aiKeyCipher: true },
  });
  const provider = providerSchema.safeParse(tenant?.aiProvider);
  if (!tenant?.aiKeyCipher || !provider.success) return null;
  return { provider: provider.data, apiKey: decryptSecret(tenant.aiKeyCipher) };
}

/** Auth check only. This does not call an image model and does not charge the spend cap. */
export async function testProviderKey(provider: "openai" | "gemini", apiKey: string) {
  try {
    const response = provider === "openai"
      ? await fetch("https://api.openai.com/v1/models", {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(12_000),
        })
      : await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
          headers: { "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(12_000),
        });
    if (!response.ok) return { ok: false as const, message: "The provider rejected that key." };
    return { ok: true as const, message: "Connected." };
  } catch {
    return { ok: false as const, message: "Could not reach the provider." };
  }
}
