import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { brandStyle } from "@/lib/contrast";
import { appBaseUrl } from "@/lib/env";
import { loadTenantBySlug } from "@/lib/salon";

export const dynamic = "force-dynamic";

export default async function QrStandee({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await loadTenantBySlug(slug);
  if (!tenant) notFound();
  const target = `${appBaseUrl()}/s/${tenant.slug}?src=qr`;
  return (
    <main className="mx-auto max-w-md px-4 py-8 print:max-w-none" style={brandStyle(tenant.primaryColor, tenant.accentColor) as CSSProperties}>
      <article className="card p-8 text-center print:border-0 print:shadow-none">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Try a look</p>
        <h1 className="mt-2 font-serif text-4xl">{tenant.name}</h1>
        <p className="mt-2 text-sm text-muted">Scan to see a haircut and colour on your phone. The preview is a guide.</p>
        <img className="mx-auto mt-6 w-56" src={`/api/v1/qr?slug=${tenant.slug}&format=png`} alt={`QR code for ${tenant.name}`} />
        <p className="mt-4 text-xs break-all">{target}</p>
        <p className="mt-6 text-sm">{tenant.address}</p>
      </article>
      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        <a className="btn" href={`/api/v1/qr?slug=${tenant.slug}&format=png`}>Download PNG</a>
        <a className="btn secondary" href={`/api/v1/qr?slug=${tenant.slug}&format=svg`}>Download SVG</a>
        <PrintButton label="Print standee" />
        <Link className="btn ghost" href={`/s/${tenant.slug}`}>Back to try-on</Link>
      </div>
    </main>
  );
}
