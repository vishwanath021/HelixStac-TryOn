import Link from "next/link";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { pageTenant } from "@/lib/session";

const LINKS = [
  ["/admin", "Overview"],
  ["/admin/onboarding", "Onboarding"],
  ["/admin/styles", "Styles"],
  ["/admin/services", "Services"],
  ["/admin/leads", "Leads"],
  ["/admin/bookings", "Bookings"],
  ["/admin/qr", "QR and embed"],
  ["/admin/billing", "Billing"],
  ["/admin/settings", "Settings"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { tenant, membership } = await pageTenant();
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[220px_1fr]">
      <aside className="card h-fit p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-muted">{membership.role}</p>
        <p className="font-serif text-2xl leading-tight">{tenant.name}</p>
        <p className="text-xs text-muted">{tenant.creditBalance} credits</p>
        <nav className="mt-4 grid gap-1 text-sm">
          {LINKS.map(([href, label]) => (
            <Link key={href} className="rounded-xl px-2 py-1 hover:bg-sand" href={href}>{label}</Link>
          ))}
          <Link className="rounded-xl px-2 py-1 hover:bg-sand" href={`/s/${tenant.slug}`}>View try-on</Link>
        </nav>
        <SignOutButton />
      </aside>
      <div>{children}</div>
    </div>
  );
}
