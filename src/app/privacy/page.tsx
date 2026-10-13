// Counsel still needs to review this page before it is treated as legal advice.
import Link from "next/link";
import { PrivacyRequest } from "@/components/PrivacyRequest";
import { legalName } from "@/lib/env";

export default function PrivacyPage() {
  const contact = process.env.SUPPORT_EMAIL || "privacy@agenticbuildworks.com";
  const company = legalName();
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="text-sm text-muted"><Link href="/">Lookuvi</Link></p>
      <h1 className="mt-3 page-title">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Version 2026-10-12. How Lookuvi and each salon handle personal data for the try-on.</p>
      <div className="mt-6 space-y-4 text-sm leading-7">
        <p>The salon is the data fiduciary for its guests under the Digital Personal Data Protection Act, 2023. {company} operates Lookuvi and is the processor that runs the try-on software. A face or hand photo used for a preview is personal data.</p>
        <p>Live hair colour runs in the browser with a self-hosted MediaPipe model. That photo is not uploaded.</p>
        <p>A style, brow, beard, or nail preview sends the photo and the chosen style to our server. The server sends that photo to the processor that produces the preview: fal (Black Forest Labs FLUX) or OpenAI. The response is <span className="font-medium">Cache-Control: no-store</span>. The generated preview is stored in private object storage for up to 24 hours so the same tap is not billed twice, then a retention job deletes it. Logs do not contain the photo or provider keys. Lookuvi does not use guest photos to train models.</p>
        <p>The application is hosted on Hostinger in India. When the site is served through Cloudflare, Cloudflare processes the connection for DNS and TLS.</p>
        <p>We store a consent log (session id, purpose, text version, language, time, a short hash of the browser string), usage events without photos, and booking leads if the guest taps Book. You can ask for access, correction, erasure, and nomination through the form below.</p>
        <p>You can withdraw consent or ask for access or deletion on this page. Withdrawal deletes leads tied to the browser session. Stored previews expire on the retention schedule. Open requests are tracked with a 30-day handling target. Grievance contact: {contact}.</p>
        <p>Children&apos;s styles require a parent or guardian to be present. The age confirmation is part of the consent log.</p>
        <p>Platform contact: {contact}</p>
        <PrivacyRequest />
      </div>
      <p className="mt-8 text-xs text-muted">Lookuvi is a product of {company}.</p>
    </main>
  );
}
