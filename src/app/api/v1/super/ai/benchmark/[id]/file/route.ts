import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { BENCHMARK_STAGES, benchmarkDir } from "@/lib/ai/benchmark";
import { requireSuper } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".json": "application/json",
};

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const { id } = await context.params;
  const url = new URL(_req.url);
  const stage = path.basename(url.searchParams.get("stage") || "");
  if (!BENCHMARK_STAGES.includes(stage as (typeof BENCHMARK_STAGES)[number])) {
    return NextResponse.json({ error: "STAGE", message: "That debug stage is not available." }, { status: 404 });
  }
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) {
    return NextResponse.json({ error: "ID", message: "Unknown benchmark." }, { status: 404 });
  }
  const file = path.join(benchmarkDir(id), stage);
  try {
    const bytes = await readFile(file);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": MIME[path.extname(stage)] || "application/octet-stream",
        "cache-control": "no-store",
        "x-benchmark-label": "unvalidated-model-output",
      },
    });
  } catch {
    return NextResponse.json({ error: "MISSING", message: "That stage was not saved." }, { status: 404 });
  }
}
