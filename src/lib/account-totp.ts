import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/secret";
import { base32Decode, hashRecovery, verifyTotp } from "@/lib/totp";

type TotpUser = {
  id: string;
  totpEnabled: boolean;
  totpSecretCipher: string;
  recoveryCodeHashes: string;
};

function hashesOf(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Missing means the account has an authenticator and the caller sent no code. */
export async function checkUserTotp(user: TotpUser, code: string): Promise<"ok" | "missing" | "invalid"> {
  if (!user.totpEnabled) return "ok";
  const clean = code.trim();
  if (!clean) return "missing";
  try {
    const secret = base32Decode(decryptSecret(user.totpSecretCipher));
    if (verifyTotp(secret, clean)) return "ok";
  } catch {
    return "invalid";
  }
  const hash = hashRecovery(clean);
  try {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUnique({ where: { id: user.id }, select: { recoveryCodeHashes: true } });
      const hashes = hashesOf(fresh?.recoveryCodeHashes || "[]");
      if (!hashes.includes(hash)) throw new Error("miss");
      await tx.user.update({
        where: { id: user.id },
        data: { recoveryCodeHashes: JSON.stringify(hashes.filter((item) => item !== hash)) },
      });
    });
    return "ok";
  } catch {
    return "invalid";
  }
}
