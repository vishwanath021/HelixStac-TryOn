import { LeadStatus } from "@/components/admin/LeadStatus";
import { planById } from "@/data/plans";
import { prisma } from "@/lib/prisma";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { tenant } = await pageTenant();
  const leads = await prisma.lead.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const canExport = planById(tenant.plan).leadExport || tenant.status === "TRIAL";
  return (
    <main>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-serif text-4xl">Leads</h1>
        {canExport ? (
          // File download, not a client navigation.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a className="btn" href="/api/v1/admin/leads/export">Download CSV</a>
        ) : <p className="text-sm text-muted">CSV export is on Pro and Chain.</p>}
      </div>
      {leads.length === 0 && <p className="card p-4 text-sm">No booking taps yet. A lead is created when a guest taps Book this look.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <th className="py-2">When</th>
              <th>Look</th>
              <th>Guest</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-line">
                <td className="py-2">{lead.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td>{lead.lookName}{lead.shadeName ? ` · ${lead.shadeName}` : ""}</td>
                <td>{lead.name || "—"} {lead.phone || ""}</td>
                <td><LeadStatus id={lead.id} status={lead.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
