import { decryptSecret } from "@/lib/crypto/secret";
import type { ProviderChoice } from "@/lib/ai/router";
import { aiProviderName } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const PAID = new Set(["openai", "gemini"]);

async function setting(key: string) {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return row?.value ?? "";
}

export async function allowByoKey() {
  return (await setting("allow_byo_key")) !== "false";
}

function paidChoice(provider: string, cipher: string): ProviderChoice | null {
  if (!PAID.has(provider) || !cipher) return null;
  try {
    const apiKey = decryptSecret(cipher);
    if (!apiKey) return null;
    return { name: provider, apiKey };
  } catch {
    return null;
  }
}

/** Tenant key, then platform key, then env. The key stays in memory for the call. */
export async function resolveProviderChoice(tenantId: string): Promise<ProviderChoice> {
  if (await allowByoKey()) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { aiProvider: true, aiKeyCipher: true },
    });
    const byo = tenant ? paidChoice(tenant.aiProvider, tenant.aiKeyCipher) : null;
    if (byo) return byo;
  }
  const platform = paidChoice(await setting("platform_ai_provider"), await setting("platform_ai_key_cipher"));
  if (platform) return platform;
  return { name: aiProviderName() };
}

function keyKind(plain: string): "openai" | "gemini" | "" {
  if (plain.startsWith("sk-")) return "openai";
  if (plain.startsWith("AIza")) return "gemini";
  return "";
}

async function dedicatedKey(slot: "openai" | "gemini") {
  const cipher = await setting(slot === "openai" ? "platform_openai_key_cipher" : "platform_gemini_key_cipher");
  if (!cipher) return "";
  try {
    return decryptSecret(cipher);
  } catch {
    return "";
  }
}

/** Legacy single slot. A saved OpenAI key stays an OpenAI key even if the guest provider dropdown moved. */
async function legacyKey(slot: "openai" | "gemini") {
  const cipher = await setting("platform_ai_key_cipher");
  if (!cipher) return "";
  let plain = "";
  try {
    plain = decryptSecret(cipher);
  } catch {
    return "";
  }
  const kind = keyKind(plain);
  if (kind === slot) return plain;
  if (!kind && (await setting("platform_ai_provider")) === slot) return plain;
  return "";
}

/** Gemini key only. A comparison does not borrow the OpenAI key. */
export async function resolveGeminiKey() {
  const dedicated = await dedicatedKey("gemini");
  if (dedicated) return dedicated;
  const legacy = await legacyKey("gemini");
  if (legacy) return legacy;
  return process.env.GEMINI_API_KEY || null;
}

/** OpenAI key only. Benchmark mode does not use a Gemini key or a mock. */
export async function resolveOpenAIKey() {
  const dedicated = await dedicatedKey("openai");
  if (dedicated) return dedicated;
  const legacy = await legacyKey("openai");
  if (legacy) return legacy;
  return process.env.OPENAI_API_KEY || null;
}

/**
 * fal key from its own cipher. A saved key that is not enabled does not fall back to the environment.
 * No saved key may use FAL_KEY. This comparison does not borrow an OpenAI or Gemini key.
 */
export async function resolveFalKey(): Promise<{ ok: true; apiKey: string } | { ok: false; reason: "missing" | "off" }> {
  const cipher = await setting("platform_fal_key_cipher");
  if (cipher) {
    if ((await setting("platform_fal_enabled")) !== "true") return { ok: false, reason: "off" };
    try {
      const apiKey = decryptSecret(cipher);
      if (apiKey) return { ok: true, apiKey };
    } catch {
      return { ok: false, reason: "missing" };
    }
  }
  const envKey = process.env.FAL_KEY?.trim() || "";
  if (envKey) return { ok: true, apiKey: envKey };
  return { ok: false, reason: "missing" };
}

/**
 * OpenRouter key from its own cipher. A saved key that is not enabled does not fall back to the environment.
 * No saved key may use OPENROUTER_API_KEY. This comparison does not borrow an OpenAI, Gemini, or fal key.
 */
export async function resolveOpenRouterKey(): Promise<{ ok: true; apiKey: string } | { ok: false; reason: "missing" | "off" }> {
  const cipher = await setting("platform_openrouter_key_cipher");
  if (cipher) {
    if ((await setting("platform_openrouter_enabled")) !== "true") return { ok: false, reason: "off" };
    try {
      const apiKey = decryptSecret(cipher);
      if (apiKey) return { ok: true, apiKey };
    } catch {
      return { ok: false, reason: "missing" };
    }
  }
  const envKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  if (envKey) return { ok: true, apiKey: envKey };
  return { ok: false, reason: "missing" };
}
