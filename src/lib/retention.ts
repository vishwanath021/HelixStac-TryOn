import { rm } from "node:fs/promises";
import { BENCHMARK_STAGES } from "@/lib/ai/benchmark";
import { numberEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { purgeOldQueueEntries, sweepAllQueues } from "@/lib/queue/service";
import { deleteObject } from "@/lib/storage";

/** Deletes expired preview objects and benchmark selfies. Safe to run on every instance. */
export async function runRetention() {
  const staleJobs = await prisma.generationJob.findMany({ where: { expiresAt: { lt: new Date() } }, take: 50 });
  for (const row of staleJobs) {
    if (row.imagePath && !row.imagePath.startsWith("/")) await deleteObject(row.imagePath).catch(() => undefined);
    await prisma.generationJob.delete({ where: { id: row.id } }).catch(() => undefined);
  }

  const hours = Math.max(1, numberEnv("BENCHMARK_RETENTION_HOURS", 72));
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const staleRuns = await prisma.benchmarkRun.findMany({ where: { createdAt: { lt: cutoff } }, take: 20 });
  for (const row of staleRuns) {
    await rm(row.dir, { recursive: true, force: true }).catch(() => undefined);
    for (const stage of BENCHMARK_STAGES) {
      await deleteObject(`benchmarks/${row.id}/${stage}`).catch(() => undefined);
    }
    await prisma.benchmarkRun.delete({ where: { id: row.id } }).catch(() => undefined);
  }

  const oldBuckets = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await prisma.rateBucket.deleteMany({ where: { resetAt: { lt: oldBuckets } } }).catch(() => undefined);
  const queue = await purgeOldQueueEntries().catch(() => 0);
  const alerts = await sweepAllQueues().catch(() => ({ sent: 0, salons: 0 }));
  return { jobs: staleJobs.length, benchmarks: staleRuns.length, queue, alerts: alerts.sent };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startRetentionLoop() {
  if (timer || process.env.NODE_ENV === "test") return;
  timer = setInterval(() => {
    void runRetention().catch(() => undefined);
  }, 15 * 60 * 1000);
  timer.unref?.();
}
