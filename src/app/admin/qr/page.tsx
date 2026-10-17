import Link from "next/link";
import { planById } from "@/data/plans";
import { appBaseUrl } from "@/lib/env";
import { ownerFeatures } from "@/lib/features";
import { salonWelcomeTarget } from "@/lib/public-url";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function QrAdminPage() {
  const { tenant } = await pageTenant();
  if (!tenant.productTryOn) {
    return (
      <main>
        <h1 className="page-title">QR</h1>
        <p className="mt-3 text-sm">Try-on is turned off for this salon.</p>
      </main>
    );
  }
  const embedOn = ownerFeatures().embed;
  const plan = planById(tenant.plan);
  const base = appBaseUrl();
  const welcome = await salonWelcomeTarget(tenant.id, tenant.slug);
  const pageUrl = welcome.url;
  const snippet = `<script src="${base}/embed.js" data-salon="${tenant.slug}" data-lang="${tenant.defaultLang}" defer></script>`;
  return (
    <main>
      <h1 className="page-title">{embedOn ? "QR and embed" : "QR"}</h1>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <article className="card p-4">
          <h2 className="font-serif text-2xl">Standee</h2>
          {welcome.local ? (
            <p className="mt-3 text-sm" role="alert" data-qr-warning="yes">This QR is not ready to print. The salon address is on this computer, not a real domain. Set the public domain, or verify the salon’s own domain, then print again.</p>
          ) : (
            <>
              <img className="mt-3 w-48" src={`/api/v1/qr?slug=${tenant.slug}&format=png`} alt="" />
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="btn" href={`/api/v1/qr?slug=${tenant.slug}&format=png`}>PNG</a>
                <a className="btn secondary" href={`/api/v1/qr?slug=${tenant.slug}&format=svg`}>SVG</a>
                <Link className="btn secondary" href={`/s/${tenant.slug}/qr`}>Printable page</Link>
              </div>
              <p className="mt-3 break-all text-xs text-muted" data-qr-url={pageUrl}>{pageUrl}</p>
            </>
          )}
        </article>
        {embedOn ? <article className="card p-4">
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
        </article> : null}
      </div>
      <p className="mt-4 text-sm"><a href={`/s/${tenant.slug}`}>View try-on</a></p>
    </main>
  );
}
