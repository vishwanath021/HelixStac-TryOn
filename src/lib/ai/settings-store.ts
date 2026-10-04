import { z } from "zod";
import { decryptSecret, encryptSecret, keyHint } from "@/lib/crypto/secret";
import { allowByoKey } from "@/lib/ai/credentials";
import { spendSummary } from "@/lib/ai/spend";
import { parseTier, tierCatalog, type ImageProviderName, type ModelTier, type TierRequest } from "@/lib/ai/tiers";
import { prisma } from "@/lib/prisma";

const providerSchema = z.enum(["openai", "gemini"]);

export type SalonAiSettings = {
  provider: ImageProviderName;
  hasKey: boolean;
  hint: string;
  allowByo: boolean;
  tier: ModelTier;
  mediumApproved: boolean;
  highEnabled: boolean;
};

export type StoredKeyStatus = { saved: boolean; hint: string };

export type PlatformAiSettings = SalonAiSettings & {
  calibrationOk: boolean;
  choices: Record<ImageProviderName, TierRequest[]>;
  spend: { spentInr: number; capInr: number; calls: number };
  openaiKey: StoredKeyStatus;
  geminiKey: StoredKeyStatus;
  falKey: StoredKeyStatus & { enabled: boolean };
  openRouterKey: StoredKeyStatus & { enabled: boolean };
};

/** @deprecated Salon pages use SalonAiSettings. Super pages use PlatformAiSettings. */
export type AiSettingsView = PlatformAiSettings;

async function setting(key: string) {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return row?.value ?? "";
}

async function putSetting(key: string, value: string) {
  await prisma.platformSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function tierGate() {
  return {
    highEnabled: (await setting("platform_ai_high_enabled")) === "true",
    mediumApproved: (await setting("platform_ai_medium_approved")) === "true",
    calibrationOk: (await setting("platform_ai_calibration_ok")) === "true",
    platformTier: parseTier(await setting("platform_ai_tier")),
  };
}

export async function readTierFlags(tenantId: string) {
  const gate = await tierGate();
  let stored = gate.platformTier;
  if (tenantId && tenantId !== "platform" && tenantId !== "calibration" && tenantId !== "ai-smoke") {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { aiTier: true } });
    if (tenant?.aiTier) stored = parseTier(tenant.aiTier);
  }
  return { stored, highEnabled: gate.highEnabled, mediumApproved: gate.mediumApproved };
}

async function storedStatus(cipherKey: string, hintKey: string): Promise<StoredKeyStatus> {
  const cipher = await setting(cipherKey);
  return { saved: Boolean(cipher), hint: cipher ? await setting(hintKey) : "" };
}

/** The old single slot, classified so an OpenAI key is not shown as a Gemini key. */
async function legacyKeyStatus(): Promise<{ kind: "openai" | "gemini" | ""; hint: string }> {
  const cipher = await setting("platform_ai_key_cipher");
  if (!cipher) return { kind: "", hint: "" };
  const hint = await setting("platform_ai_key_hint");
  try {
    const plain = decryptSecret(cipher);
    if (plain.startsWith("sk-")) return { kind: "openai", hint };
    if (plain.startsWith("AIza")) return { kind: "gemini", hint };
  } catch {
    return { kind: "", hint };
  }
  const provider = await setting("platform_ai_provider");
  if (provider === "openai" || provider === "gemini") return { kind: provider, hint };
  return { kind: "", hint };
}

export async function platformAiView(): Promise<PlatformAiSettings> {
  const provider = providerSchema.safeParse(await setting("platform_ai_provider"));
  const active = provider.success ? provider.data : "openai";
  const legacyCipher = await setting("platform_ai_key_cipher");
  const gate = await tierGate();
  const fal = await storedStatus("platform_fal_key_cipher", "platform_fal_key_hint");
  const openaiDedicated = await storedStatus("platform_openai_key_cipher", "platform_openai_key_hint");
  const geminiDedicated = await storedStatus("platform_gemini_key_cipher", "platform_gemini_key_hint");
  const legacy = await legacyKeyStatus();
  const openaiKey = openaiDedicated.saved ? openaiDedicated : legacy.kind === "openai" ? { saved: true, hint: legacy.hint } : openaiDedicated;
  const geminiKey = geminiDedicated.saved ? geminiDedicated : legacy.kind === "gemini" ? { saved: true, hint: legacy.hint } : geminiDedicated;
  const activeStatus = active === "openai" ? openaiKey : geminiKey;
  return {
    provider: active,
    hasKey: activeStatus.saved || Boolean(legacyCipher),
    hint: activeStatus.hint || (await setting("platform_ai_key_hint")),
    allowByo: await allowByoKey(),
    tier: gate.platformTier,
    mediumApproved: gate.mediumApproved,
    highEnabled: gate.highEnabled,
    calibrationOk: gate.calibrationOk,
    choices: { openai: tierCatalog("openai"), gemini: tierCatalog("gemini") },
    spend: await spendSummary(),
    openaiKey,
    geminiKey,
    falKey: { ...fal, enabled: fal.saved && (await setting("platform_fal_enabled")) === "true" },
    openRouterKey: {
      ...(await storedStatus("platform_openrouter_key_cipher", "platform_openrouter_key_hint")),
      enabled: Boolean(await setting("platform_openrouter_key_cipher")) && (await setting("platform_openrouter_enabled")) === "true",
    },
  };
}

export async function salonAiView(tenantId: string): Promise<SalonAiSettings> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { aiProvider: true, aiKeyCipher: true, aiKeyHint: true, aiTier: true },
  });
  const provider = providerSchema.safeParse(tenant?.aiProvider);
  const gate = await tierGate();
  return {
    provider: provider.success ? provider.data : "openai",
    hasKey: Boolean(tenant?.aiKeyCipher),
    hint: tenant?.aiKeyHint || "",
    allowByo: await allowByoKey(),
    tier: tenant?.aiTier ? parseTier(tenant.aiTier) : "test",
    mediumApproved: gate.mediumApproved,
    highEnabled: gate.highEnabled,
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

function freshFalKey(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("•")) return null;
  if (!/^[A-Za-z0-9_\-.:]{12,400}$/.test(trimmed)) throw new Error("INVALID_KEY");
  return trimmed;
}

function freshOpenRouterKey(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("•")) return null;
  if (!/^[A-Za-z0-9_\-.]{12,400}$/.test(trimmed)) throw new Error("INVALID_KEY");
  return trimmed;
}

async function migrateLegacySlot() {
  const legacy = await legacyKeyStatus();
  if (!legacy.kind) return;
  const cipherKey = legacy.kind === "openai" ? "platform_openai_key_cipher" : "platform_gemini_key_cipher";
  const hintKey = legacy.kind === "openai" ? "platform_openai_key_hint" : "platform_gemini_key_hint";
  if (await setting(cipherKey)) return;
  const cipher = await setting("platform_ai_key_cipher");
  if (!cipher) return;
  await putSetting(cipherKey, cipher);
  await putSetting(hintKey, legacy.hint);
}

export async function saveFalKey(
  input: { apiKey: string; enabled: boolean; remove: boolean },
  actorId: string,
) {
  if (input.remove) {
    await putSetting("platform_fal_key_cipher", "");
    await putSetting("platform_fal_key_hint", "");
    await putSetting("platform_fal_enabled", "false");
  } else {
    const next = freshFalKey(input.apiKey);
    if (next) {
      await putSetting("platform_fal_key_cipher", encryptSecret(next));
      await putSetting("platform_fal_key_hint", keyHint(next));
    } else if (!(await setting("platform_fal_key_cipher")) && input.apiKey.trim()) {
      throw new Error("INVALID_KEY");
    }
    const saved = Boolean(await setting("platform_fal_key_cipher"));
    await putSetting("platform_fal_enabled", saved && input.enabled ? "true" : "false");
  }
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "AI_KEY_UPDATE",
      target: "platform",
      meta: JSON.stringify({ provider: "fal", rotated: Boolean(input.apiKey.trim()), removed: input.remove, enabled: input.enabled }),
    },
  });
}

export async function saveOpenRouterKey(
  input: { apiKey: string; enabled: boolean; remove: boolean },
  actorId: string,
) {
  if (input.remove) {
    await putSetting("platform_openrouter_key_cipher", "");
    await putSetting("platform_openrouter_key_hint", "");
    await putSetting("platform_openrouter_enabled", "false");
  } else {
    const next = freshOpenRouterKey(input.apiKey);
    if (next) {
      await putSetting("platform_openrouter_key_cipher", encryptSecret(next));
      await putSetting("platform_openrouter_key_hint", keyHint(next));
    } else if (!(await setting("platform_openrouter_key_cipher")) && input.apiKey.trim()) {
      throw new Error("INVALID_KEY");
    }
    const saved = Boolean(await setting("platform_openrouter_key_cipher"));
    await putSetting("platform_openrouter_enabled", saved && input.enabled ? "true" : "false");
  }
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "AI_KEY_UPDATE",
      target: "platform",
      meta: JSON.stringify({ provider: "openrouter", rotated: Boolean(input.apiKey.trim()), removed: input.remove, enabled: input.enabled }),
    },
  });
}

export async function savePlatformAi(
  input: { provider: "openai" | "gemini"; apiKey: string; allowByo: boolean; tier: ModelTier; highEnabled: boolean },
  actorId: string,
) {
  await migrateLegacySlot();
  const next = freshKey(input.apiKey);
  const gate = await tierGate();
  await putSetting("platform_ai_provider", input.provider);
  await putSetting("allow_byo_key", input.allowByo ? "true" : "false");
  await putSetting("platform_ai_high_enabled", input.highEnabled ? "true" : "false");
  const cipherKey = input.provider === "openai" ? "platform_openai_key_cipher" : "platform_gemini_key_cipher";
  const hintKey = input.provider === "openai" ? "platform_openai_key_hint" : "platform_gemini_key_hint";
  if (next) {
    const cipher = encryptSecret(next);
    const hint = keyHint(next);
    await putSetting(cipherKey, cipher);
    await putSetting(hintKey, hint);
    await putSetting("platform_ai_key_cipher", cipher);
    await putSetting("platform_ai_key_hint", hint);
    await putSetting("platform_ai_tier", "test");
    await putSetting("platform_ai_medium_approved", "false");
    await putSetting("platform_ai_calibration_ok", "false");
  } else {
    let tier = input.tier;
    if (tier === "high" && !input.highEnabled) tier = "test";
    if (tier === "medium" && !gate.mediumApproved) tier = "test";
    await putSetting("platform_ai_tier", tier);
    const kept = await setting(cipherKey);
    if (kept) {
      await putSetting("platform_ai_key_cipher", kept);
      await putSetting("platform_ai_key_hint", await setting(hintKey));
    } else {
      await putSetting("platform_ai_key_cipher", "");
      await putSetting("platform_ai_key_hint", "");
    }
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

export async function saveSalonAi(
  tenantId: string,
  input: { provider: "openai" | "gemini"; apiKey: string; tier: ModelTier },
  actorId: string,
) {
  const gate = await tierGate();
  const next = freshKey(input.apiKey);
  const current = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { aiKeyCipher: true } });
  const byo = await allowByoKey();
  if (!byo && next) throw new Error("BYO_OFF");
  if (byo && !next && !current?.aiKeyCipher && input.apiKey.trim()) throw new Error("INVALID_KEY");
  let tier: ModelTier = next ? "test" : input.tier;
  if (tier === "high" && !gate.highEnabled) tier = "test";
  if (tier === "medium" && !gate.mediumApproved) tier = "test";
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      aiTier: tier,
      ...(byo ? { aiProvider: input.provider, ...(next ? { aiKeyCipher: encryptSecret(next), aiKeyHint: keyHint(next) } : {}) } : {}),
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

export async function approveMediumQuality() {
  if ((await setting("platform_ai_calibration_ok")) !== "true") throw new Error("CALIBRATION_REQUIRED");
  await putSetting("platform_ai_medium_approved", "true");
}

export async function markCalibration(ok: boolean) {
  await putSetting("platform_ai_calibration_ok", ok ? "true" : "false");
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
