import { SalonsBoard } from "@/components/admin/SalonsBoard";
import { loadSalons } from "@/lib/super/directory";
import { pageSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SalonsPage() {
  await pageSuper();
  const rows = await loadSalons();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <SalonsBoard rows={rows} />
    </main>
  );
}
