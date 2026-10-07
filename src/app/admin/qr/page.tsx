import Link from "next/link";
import { SalonModeCard } from "@/components/admin/SalonModeCard";
import { planById } from "@/data/plans";
import { appBaseUrl } from "@/lib/env";
import { signSalonToken } from "@/lib/preview-access";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function QrAdminPage() {
  const { tenant, membership } = await pageTenant();
  const plan = planById(tenant.plan);
  const base = appBaseUrl();
  const pageUrl = `${base}/s/${tenant.slug}`;
  const salonUrl = tenant.salonNonce ? `${pageUrl}?salon=${signSalonToken(tenant.id, tenant.salonNonce)}` : "";
  const snippet = `<script src="${base}/embed.js" data-salon="${tenant.slug}" data-lang="${tenant.defaultLang}" defer></script>`;
  return (
    <main>
      <h1 className="font-serif text-4xl">QR and embed</h1>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <article className="card p-4">
          <h2 className="font-serif text-2xl">Standee</h2>
          <img className="mt-3 w-48" src={`/api/v1/qr?slug=${tenant.slug}&format=png`} alt="" />
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn" href={`/api/v1/qr?slug=${tenant.slug}&format=png`}>PNG</a>
            <a className="btn secondary" href={`/api/v1/qr?slug=${tenant.slug}&format=svg`}>SVG</a>
            <Link className="btn secondary" href={`/s/${tenant.slug}/qr`}>Printable page</Link>
          </div>
          <p className="mt-3 break-all text-xs text-muted">{pageUrl}</p>
        </article>
        <article className="card p-4">
          <h2 className="font-serif text-2xl">Website embed</h2>
          {plan.embed ? (
            <>
              <p className="mt-2 text-sm">Paste this on the salon website. It adds a button and an iframe. The iframe posts <code>tryon:booked</code> to the parent window. No photo is included.</p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-[#12312e] p-3 text-xs text-[#f4fbf9]">{snippet}</pre>
              <p className="mt-3 text-sm">Or iframe <code>{base}/embed/{tenant.slug}</code> with <code>allow=&quot;camera&quot;</code>.</p>
            </>
          ) : (
            <p className="mt-2 text-sm">The embed widget is on Pro and Chain. Starter uses the hosted page and QR.</p>
          )}
        </article>
        <SalonModeCard initialUrl={salonUrl} canRotate={membership.role === "OWNER"} />
      </div>
    </main>
  );
}
