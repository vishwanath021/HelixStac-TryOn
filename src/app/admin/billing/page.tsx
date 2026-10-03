import { BillingPanel } from "@/components/admin/BillingPanel";
import { billingProviderName } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const { tenant, membership } = await pageTenant();
  const invoices = await prisma.invoice.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 12 });
  if (membership.role !== "OWNER") {
    return <main><h1 className="font-serif text-4xl">Billing</h1><p className="mt-2 text-sm">Only the owner can change the plan.</p></main>;
  }
  return (
    <main>
      <h1 className="mb-4 font-serif text-4xl">Billing</h1>
      <BillingPanel plan={tenant.plan} status={tenant.status} credits={tenant.creditBalance} provider={billingProviderName()} />
      <h2 className="mb-2 mt-6 font-serif text-2xl">Invoices</h2>
      {invoices.length === 0 && <p className="text-sm text-muted">No invoices yet. A mock payment writes one immediately.</p>}
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
