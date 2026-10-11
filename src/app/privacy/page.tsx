import Link from "next/link";
import { PrivacyRequest } from "@/components/PrivacyRequest";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="text-sm text-muted"><Link href="/">Lookuvi</Link></p>
      <h1 className="mt-3 page-title">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Template for the platform and for each salon. Have a lawyer review it before you rely on it. Version 2026-10-11.</p>
      <div className="mt-6 space-y-4 text-sm leading-7">
        <p>The salon is the data fiduciary for its guests. Lookuvi is the processor for the try-on software. Face photos are personal data.</p>
        <p>Live hair colour runs in the browser with a self-hosted MediaPipe model. That photo is not uploaded.</p>
        <p>A style preview sends the selfie and a style id to our server. The server calls the configured image provider and returns the image. The response is <span className="font-medium">Cache-Control: no-store</span>. The generated preview is stored in private object storage for up to 24 hours so the same tap is not billed twice, then a retention job deletes it. Logs do not contain the photo or provider keys.</p>
        <p>We do store a consent log (session id, purpose, text version, language, time, a short hash of the browser string), usage events without photos, and booking leads if the guest taps Book. Under the Digital Personal Data Protection Act, 2023, the salon is the data fiduciary and Lookuvi is the processor. You can ask for access, correction, erasure, and nomination through the form below.</p>
        <p>You can withdraw consent or ask for access or deletion on this page. Withdrawal deletes leads tied to the browser session. Stored previews expire on the retention schedule. Open requests are tracked with a 30-day handling target. Grievance contact: {process.env.SUPPORT_EMAIL || "privacy@helixstac.example"}.</p>
        <p>Children&apos;s styles require a parent or guardian to be present. The age confirmation is part of the consent log.</p>
        <p>If a paid Gemini key is configured, use Google&apos;s paid tier. Google states that paid-tier content is not used to improve its products. Do not run production traffic on the free tier.</p>
        <p>Platform contact: {process.env.SUPPORT_EMAIL || "privacy@helixstac.example"}</p>
        <PrivacyRequest />
      </div>
    </main>
  );
}
