import { rm } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { benchmarkDir } from "@/lib/ai/benchmark";
import { prisma } from "@/lib/prisma";
import { requireSuper } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const { id } = await context.params;
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) {
    return NextResponse.json({ error: "ID", message: "Unknown benchmark." }, { status: 404 });
  }
  const run = await prisma.benchmarkRun.findUnique({ where: { id } });
  if (!run) return NextResponse.json({ error: "MISSING", message: "That benchmark is already gone." }, { status: 404 });
  const root = path.resolve(benchmarkDir(id));
  const stored = path.resolve(run.dir);
  if (stored === root || stored.startsWith(`${root}${path.sep}`)) {
    await rm(stored, { recursive: true, force: true }).catch(() => undefined);
  }
  await rm(root, { recursive: true, force: true }).catch(() => undefined);
  await prisma.benchmarkRun.delete({ where: { id } }).catch(() => undefined);
  return NextResponse.json({ ok: true, id });
}
