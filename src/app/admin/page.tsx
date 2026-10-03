import { prisma } from "@/lib/prisma";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const { tenant } = await pageTenant();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [styleCount, leads, whatsapp, colours] = await Promise.all([
    prisma.tryOn.count({ where: { tenantId: tenant.id, kind: { in: ["STYLE", "BROWS", "BEARD", "NAILS"] }, status: "SUCCEEDED", createdAt: { gte: since } } }),
    prisma.lead.count({ where: { tenantId: tenant.id, createdAt: { gte: since } } }),
    prisma.usageEvent.count({ where: { tenantId: tenant.id, name: "whatsapp_clicked", createdAt: { gte: since } } }),
    prisma.usageEvent.findMany({ where: { tenantId: tenant.id, name: "colour_selected", createdAt: { gte: since } }, take: 200 }),
  ]);
  const topStyles = await prisma.tryOn.groupBy({
    by: ["styleId"],
    where: { tenantId: tenant.id, status: "SUCCEEDED", createdAt: { gte: since } },
    _count: { styleId: true },
    orderBy: { _count: { styleId: "desc" } },
    take: 5,
  });
  const shadeCounts = new Map<string, number>();
  for (const event of colours) {
    try {
      const shade = String(JSON.parse(event.props).shade || "");
      if (shade) shadeCounts.set(shade, (shadeCounts.get(shade) || 0) + 1);
    } catch {
      /* ignore malformed props */
    }
  }
  const conversion = styleCount ? Math.round((whatsapp / styleCount) * 100) : 0;
  return (
    <main>
      <h1 className="font-serif text-4xl">This month</h1>
      <p className="mt-1 text-sm text-muted">Counts from the last 30 days. Photos are not in these numbers.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["AI previews", styleCount],
          ["Leads", leads],
          ["WhatsApp taps", whatsapp],
          ["WhatsApp / preview", `${conversion}%`],
        ].map(([label, value]) => (
          <article key={String(label)} className="card p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
            <p className="font-serif text-3xl">{value}</p>
          </article>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="card p-4">
          <h2 className="font-serif text-2xl">Popular styles</h2>
          {topStyles.length === 0 && <p className="mt-2 text-sm text-muted">No previews yet.</p>}
          <ul className="mt-2 text-sm">
            {topStyles.map((row) => (
              <li key={row.styleId} className="flex justify-between border-b border-line py-1">
                <span>{row.styleId}</span>
                <span>{row._count.styleId}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="card p-4">
          <h2 className="font-serif text-2xl">Popular colours</h2>
          {shadeCounts.size === 0 && <p className="mt-2 text-sm text-muted">No colour taps yet.</p>}
          <ul className="mt-2 text-sm">
            {[...shadeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([shade, count]) => (
              <li key={shade} className="flex justify-between border-b border-line py-1"><span>{shade}</span><span>{count}</span></li>
            ))}
          </ul>
        </article>
      </div>
      <p className="mt-4 text-sm">Credits left: <strong>{tenant.creditBalance}</strong>. Plan {tenant.plan} · {tenant.status}. Daily cap {tenant.dailyCap}.</p>
    </main>
  );
}
