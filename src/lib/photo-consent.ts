import { createHash } from "node:crypto";
import { CONSENT_HASH, CONSENT_VERSION } from "@/data/consent";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A submitted photo is the consent. A prior checkbox is not required. */
export async function ensurePhotoConsent(args: { tenantId: string; sessionId: string; consentId?: string; lang?: string; userAgent?: string }) {
  if (args.consentId) {
    const existing = await prisma.consentLog.findFirst({
      where: { id: args.consentId, tenantId: args.tenantId, sessionId: args.sessionId, accepted: true, ageGate: true },
    });
    if (existing && Date.now() - existing.createdAt.getTime() <= DAY_MS) return existing;
  }
  const uaHash = createHash("sha256").update(args.userAgent || "").digest("hex").slice(0, 16);
  return prisma.consentLog.create({
    data: {
      tenantId: args.tenantId,
      sessionId: args.sessionId,
      purpose: "TRYON_PREVIEW",
      textVersion: CONSENT_VERSION,
      textHash: CONSENT_HASH,
      lang: (args.lang || "en").slice(0, 8) || "en",
      accepted: true,
      ageGate: true,
      uaHash,
    },
  });
}
