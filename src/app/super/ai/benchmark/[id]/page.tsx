import Link from "next/link";
import { notFound } from "next/navigation";
import { BENCHMARK_STAGES } from "@/lib/ai/benchmark";
import { prisma } from "@/lib/prisma";
import { pageSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

const PICTURES = ["provider-response.png", "restored-output.png", "provider-input.png", "provider-reference.jpg", "sanitized-input.jpg", "original-input.jpg"];

export default async function BenchmarkReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await pageSuper();
  const { id } = await params;
  const run = await prisma.benchmarkRun.findUnique({ where: { id } });
  if (!run) notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">Super admin</p>
      <h1 className="font-serif text-4xl">Unvalidated model output</h1>
      <p className="mt-2 text-sm leading-6">
        This is the benchmark for {run.styleId}. Model {run.model}, quality {run.quality}, size {run.size}.
        Status {run.status}. Estimated output cost ₹{run.estimateInr.toFixed(2)} before input tokens.
        The provider response file is the decoded bytes before any crop. The restored file is a separate crop.
        Nothing here was accepted as a finished haircut.
      </p>
      <p className="mt-3 text-sm"><Link className="underline" href="/super/ai">Back to AI settings</Link></p>
      {run.message && <p className="mt-3 text-sm">{run.message}</p>}
      <div className="mt-6 grid gap-4">
        {PICTURES.map((stage) => (
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
    </main>
  );
}
