import { BenchmarkPanel } from "@/components/admin/BenchmarkPanel";
import { SuperAiForm } from "@/components/admin/SuperAiForm";
import { STYLES } from "@/data/styles";
import { quoteBenchmark } from "@/lib/ai/benchmark";
import { platformAiView } from "@/lib/ai/settings-store";
import { prisma } from "@/lib/prisma";
import { pageSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SuperAiPage() {
  await pageSuper();
  const initial = await platformAiView();
  const salons = await prisma.tenant.findMany({
    select: { id: true, name: true, hairstyleEngine: true },
    orderBy: { name: "asc" },
  });
  const squareQuote = quoteBenchmark(1024, 1024);
  const styles = STYLES.map((style) => ({ id: style.id, name: style.name, lengthCategory: style.lengthCategory }));
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="page-title">AI</h1>
      <p className="mt-2 mb-4 text-sm text-muted">Guest engine, provider keys, and the monthly spend cap.</p>
      <SuperAiForm
        initial={initial}
        salons={salons}
        advanced={(
          <>
            {squareQuote.ok ? (
              <p className="text-sm">
                Reference benchmark, off for guests: {squareQuote.model} at 1024×1024 is about ₹{squareQuote.estimateInr.toFixed(2)}.
              </p>
            ) : null}
            <BenchmarkPanel styles={styles} />
          </>
        )}
      />
    </main>
  );
}
