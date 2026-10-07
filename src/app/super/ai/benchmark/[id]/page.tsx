import { access } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteBenchmarkButton } from "@/components/admin/DeleteBenchmarkButton";
import { BENCHMARK_STAGES, benchmarkDir } from "@/lib/ai/benchmark";
import { bufferedInr } from "@/lib/ai/tiers";
import { numberEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { pageSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

const EXTRA = ["restored-output.png", "provider-input.png", "provider-reference.jpg", "original-input.jpg"];
const COMPOSITE_STAGES: { file: string; caption: string }[] = [
  { file: "aligned-output.png", caption: "Aligned generated frame. This is not the raw provider output." },
  { file: "mask-overlay.png", caption: "Original hair in blue, generated hair in magenta, protected face in gold." },
  { file: "face-check.png", caption: "Eyes, brows, nose and mouth. Green is the selfie. Red is the generated face after alignment. A warning only. This does not accept or reject the image." },
];

export default async function BenchmarkReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await pageSuper();
  const { id } = await params;
  const run = await prisma.benchmarkRun.findUnique({ where: { id } });
  if (!run) notFound();
  const retentionHours = Math.max(1, numberEnv("BENCHMARK_RETENTION_HOURS", 72));
  const hasUsage = run.inputTokens > 0 || run.outputTokens > 0 || run.actualUsd > 0;
  const compositeStages: { file: string; caption: string }[] = [];
  for (const stage of COMPOSITE_STAGES) {
    try {
      await access(path.join(benchmarkDir(run.id), stage.file));
      compositeStages.push(stage);
    } catch {
      // This run did not save that stage.
    }
  }
  const bufferedActual = run.actualUsd > 0 ? bufferedInr(run.actualUsd) : 0;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">Super admin</p>
      <h1 className="font-serif text-4xl">Unvalidated model output</h1>
      <p className="mt-2 text-sm leading-6">
        Hairstyle benchmark for {run.styleId}. Model {run.model}, quality {run.quality}, size {run.size}. Status {run.status}. Source {run.source === "tryon" ? "salon try-on" : "benchmark form"}.
        The right-hand photograph is the raw provider body, before any crop. Nothing here was accepted as a finished haircut.
      </p>
      <p className="mt-3 rounded-xl border border-line bg-white p-3 text-sm leading-6">
        Real family photos are personal data. This run sent them only to OpenAI. The files stay on this server under var/benchmarks
        and are removed after {retentionHours} hours, or when you press Delete now.
      </p>
      <p className="mt-3 text-sm"><Link className="underline" href="/super/ai">Back to AI settings</Link></p>
      {run.clothingWarning === "clothing_changed" && (
        <p className="mt-3 rounded-xl border border-line bg-white p-3 text-sm leading-6">
          Warning: clothing_changed. The neckline or shoulder band moved relative to the selfie. This is a finding, not an accepted result.
        </p>
      )}
      {run.message && <p className="mt-3 text-sm">{run.message}</p>}
      <dl className="mt-4 grid gap-2 text-sm leading-6 sm:grid-cols-2">
        <div>
          <dt className="text-muted">Estimate before the call</dt>
          <dd>₹{run.estimateInr.toFixed(2)} (${run.estimateUsd.toFixed(3)}). Estimate, actual from provider usage.</dd>
        </div>
        <div>
          <dt className="text-muted">Actual from provider usage</dt>
          <dd>
            {hasUsage
              ? `$${run.actualUsd.toFixed(3)}, ₹${run.actualInr.toFixed(2)} at FX with no buffer. With the estimate's 1.08 buffer that usage is ₹${bufferedActual.toFixed(2)}.`
              : "No usage payload was stored for this run."}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Usage</dt>
          <dd>
            {hasUsage
              ? `input ${run.inputTokens} (image ${run.imageTokens}, text ${run.textTokens}), output ${run.outputTokens}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Latency</dt>
          <dd>{run.latencyMs > 0 ? `${(run.latencyMs / 1000).toFixed(1)} s` : "—"}</dd>
        </div>
      </dl>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <figure className="rounded-2xl border border-line bg-white p-3">
          <figcaption className="mb-2 text-sm font-medium">Before · sanitized input</figcaption>
          <img alt="" src={`/api/v1/super/ai/benchmark/${run.id}/file?stage=sanitized-input.jpg`} className="max-h-[36rem] w-full object-contain" />
        </figure>
        <figure className="rounded-2xl border border-line bg-white p-3">
          <figcaption className="mb-2 text-sm font-medium">UNVALIDATED · provider-response.png</figcaption>
          <img alt="" src={`/api/v1/super/ai/benchmark/${run.id}/file?stage=provider-response.png`} className="max-h-[36rem] w-full object-contain" />
        </figure>
      </div>
      {compositeStages.length > 0 && (
        <div className="mt-4 grid gap-4">
          {compositeStages.map((stage) => (
            <figure key={stage.file} className="rounded-2xl border border-line bg-white p-3">
              <figcaption className="mb-2 text-sm font-medium">{stage.caption}</figcaption>
              <img alt="" src={`/api/v1/super/ai/benchmark/${run.id}/file?stage=${stage.file}`} className="max-h-[32rem] w-full object-contain" />
            </figure>
          ))}
        </div>
      )}
      <div className="mt-4 grid gap-4">
        {EXTRA.map((stage) => (
          <figure key={stage} className="rounded-2xl border border-line bg-white p-3">
            <figcaption className="mb-2 text-sm font-medium">{stage}</figcaption>
            <img alt="" src={`/api/v1/super/ai/benchmark/${run.id}/file?stage=${stage}`} className="max-h-[32rem] w-full object-contain" />
          </figure>
        ))}
      </div>
      <ul className="mt-4 text-sm leading-6">
        {BENCHMARK_STAGES.filter((stage) => stage.endsWith(".json")).map((stage) => (
          <li key={stage}><a className="underline" href={`/api/v1/super/ai/benchmark/${run.id}/file?stage=${stage}`}>{stage}</a></li>
        ))}
      </ul>
      <DeleteBenchmarkButton id={run.id} />
    </main>
  );
}
