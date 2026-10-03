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
