import { LeadStatus } from "@/components/admin/LeadStatus";
import { formatIst, humanLookName, humanShade } from "@/lib/display";
import { formatEventDate, sortLeads } from "@/lib/leads";
import { prisma } from "@/lib/prisma";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { tenant } = await pageTenant();
  // Unordered take drops a new bridal trial once the salon has a long list of older looks.
  const [dated, recent] = await Promise.all([
    prisma.lead.findMany({
      where: { tenantId: tenant.id, type: "BRIDAL", eventDate: { not: "" } },
      orderBy: { eventDate: "asc" },
      take: 40,
    }),
    prisma.lead.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);
  const seen = new Set<string>();
  const leads = sortLeads([...dated, ...recent].filter((lead) => {
    if (seen.has(lead.id)) return false;
    seen.add(lead.id);
    return true;
  }));
  return (
    <main>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Leads</h1>
        {/* File download, not a client navigation. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="btn" href="/api/v1/admin/leads/export">Download CSV</a>
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
                <td className="py-2">{formatIst(lead.createdAt)}</td>
                <td>
                  {lead.type === "BRIDAL" ? <span className="mr-2 rounded-full bg-[#F3E6D8] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">Bridal</span> : null}
                  {humanLookName(lead.lookName)}{lead.shadeName ? ` · ${humanShade(lead.shadeName)}` : ""}
                  {lead.type === "BRIDAL" && lead.eventDate ? <span className="mt-1 block text-xs text-muted">{lead.eventName} · {formatEventDate(lead.eventDate)}</span> : null}
                </td>
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
