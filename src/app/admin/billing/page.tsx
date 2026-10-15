import { BillingPanel } from "@/components/admin/BillingPanel";
import { ownerSelfServeBlocked } from "@/lib/billing/access";
import { billingProviderName, legalName } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const { tenant, membership } = await pageTenant();
  const invoices = await prisma.invoice.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 12 });
  if (membership.role !== "OWNER") {
    return <main><h1 className="page-title">Billing</h1><p className="mt-2 text-sm">Only the owner can change the plan.</p></main>;
  }
  return (
    <main>
      <h1 className="mb-4 page-title">Billing</h1>
      <BillingPanel plan={tenant.plan} status={tenant.status} credits={tenant.creditBalance} provider={billingProviderName()} locked={ownerSelfServeBlocked()} />
      <h2 className="mb-2 mt-6 font-serif text-2xl">Invoices</h2>
      <p className="mb-2 text-sm text-muted">Issued by {legalName()}.</p>
      {invoices.length === 0 && <p className="text-sm text-muted">{ownerSelfServeBlocked() ? "Invoices appear after Lookuvi activates the plan." : "No invoices yet."}</p>}
      <ul className="text-sm">
        {invoices.map((invoice) => (
          <li key={invoice.id} className="flex justify-between border-b border-line py-2">
            <span>{invoice.number} · {invoice.description}</span>
            <span>₹{invoice.totalInr.toLocaleString("en-IN")} incl. GST</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
