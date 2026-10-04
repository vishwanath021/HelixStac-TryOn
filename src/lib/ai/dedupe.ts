import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { numberEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { releasePaidCall } from "@/lib/ai/spend";

const STALE_MS = 90_000;

export function jobFingerprint(parts: { photo: Buffer; styleId: string; tool: string; shadeId: string; mode: string }) {
  const hash = createHash("sha256");
  hash.update(parts.photo);
  hash.update("\0");
  hash.update([parts.mode, parts.tool, parts.styleId, parts.shadeId].join("\0"));
  return hash.digest("hex");
}

function jobDir(tenantId: string, requestId: string) {
  return path.join(process.cwd(), "var", "generation-jobs", tenantId, requestId);
}

function ttlDate() {
  return new Date(Date.now() + numberEnv("GENERATION_JOB_TTL_HOURS", 24) * 60 * 60 * 1000);
}

async function purgeExpired() {
  const stale = await prisma.generationJob.findMany({ where: { expiresAt: { lt: new Date() } }, take: 20 });
  for (const row of stale) {
    await rm(jobDir(row.tenantId, row.requestId), { recursive: true, force: true }).catch(() => undefined);
    await prisma.generationJob.delete({ where: { id: row.id } }).catch(() => undefined);
  }
}

export type JobClaim =
  | { kind: "start"; id: string }
  | { kind: "replay"; image: Buffer; demoReason: string }
  | { kind: "conflict"; message: string }
  | { kind: "inflight"; message: string }
  | { kind: "repeat"; status: number; message: string };

/**
 * One request id maps to one provider attempt.
 * SQLite serializes writers of this file. Two app instances only share that lock when they share DATABASE_URL.
 * The in-process queue in spend.ts does not cross processes.
 */
export async function claimGenerationJob(args: { tenantId: string; requestId: string; fingerprint: string }): Promise<JobClaim> {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(args.requestId)) {
    return { kind: "conflict", message: "Send a request id for this preview." };
  }
  await purgeExpired().catch(() => undefined);
  const existingFirst = await prisma.generationJob.findUnique({
    where: { tenantId_requestId: { tenantId: args.tenantId, requestId: args.requestId } },
  });
  if (existingFirst) return resolveExisting(existingFirst, args.fingerprint);
  try {
    const row = await prisma.generationJob.create({
      data: {
        tenantId: args.tenantId,
        requestId: args.requestId,
        fingerprint: args.fingerprint,
        status: "PENDING",
        expiresAt: ttlDate(),
      },
    });
    return { kind: "start", id: row.id };
  } catch {
    const existing = await prisma.generationJob.findUnique({
      where: { tenantId_requestId: { tenantId: args.tenantId, requestId: args.requestId } },
    });
    if (!existing) return { kind: "inflight", message: "That preview is already running." };
    return resolveExisting(existing, args.fingerprint);
  }
}

function repeatStatus(outcome: string) {
  if (outcome === "placement") return 422;
  if (outcome === "credits") return 402;
  if (outcome === "suspended") return 403;
  if (outcome === "uncertain") return 504;
  return 502;
}

async function resolveExisting(existing: {
  id: string;
  fingerprint: string;
  status: string;
  createdAt: Date;
  callId: string;
  imagePath: string;
  demoReason: string;
  outcome: string;
  message: string;
}, fingerprint: string): Promise<JobClaim> {
  if (existing.fingerprint !== fingerprint) {
    return { kind: "conflict", message: "That request id was already used for a different photo or style." };
  }
  if (existing.status === "PENDING") {
    const age = Date.now() - existing.createdAt.getTime();
    if (age < STALE_MS) return { kind: "inflight", message: "That preview is already running." };
    if (existing.callId) await releasePaidCall(existing.callId, "UNCERTAIN");
    await prisma.generationJob.update({
      where: { id: existing.id },
      data: { status: "UNCERTAIN", outcome: "uncertain", message: "The first attempt did not finish. It was not started again." },
    });
    return { kind: "repeat", status: 504, message: "The first attempt did not finish. It was not started again." };
  }
  if (existing.status === "READY" && existing.imagePath) {
    try {
      const image = await readFile(existing.imagePath);
      return { kind: "replay", image, demoReason: existing.demoReason };
    } catch {
      return { kind: "repeat", status: 410, message: "That preview expired and was not generated again." };
    }
  }
  return {
    kind: "repeat",
    status: repeatStatus(existing.outcome),
    message: existing.message || "That preview already finished and was not generated again.",
  };
}

export async function completeGenerationJob(id: string, args: { tenantId: string; requestId: string; image: Buffer; demoReason?: string; callId?: string }) {
  const dir = jobDir(args.tenantId, args.requestId);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "result.jpg");
  await writeFile(file, args.image);
  await prisma.generationJob.update({
    where: { id },
    data: {
      status: "READY",
      imagePath: file,
      demoReason: args.demoReason || "",
      outcome: args.demoReason || "paid",
      callId: args.callId || "",
      expiresAt: ttlDate(),
    },
  });
}

export async function failGenerationJob(id: string, args: { outcome: string; message: string; callId?: string }) {
  if (!id) return;
  await prisma.generationJob.update({
    where: { id },
    data: { status: "FAILED", outcome: args.outcome, message: args.message, callId: args.callId || "" },
  }).catch(() => undefined);
}
