import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-sm leading-7">
      <p className="text-muted"><Link href="/">Lookuvi</Link></p>
      <h1 className="mt-3 page-title">Terms</h1>
      <p className="mt-4">These terms are a template for a salon subscription to Lookuvi. They are not a substitute for a contract reviewed for your entity.</p>
      <h2 className="mt-6 font-serif text-2xl">The service</h2>
      <p>We host a branded try-on page, QR, and (on eligible plans) an embed. Live colour is included. AI previews spend credits. When credits run out, colour keeps working and new previews stop with a plain message.</p>
      <h2 className="mt-6 font-serif text-2xl">Previews</h2>
      <p>Previews are a guide for a conversation with a stylist. We do not claim that a preview matches a future haircut, measures a face, or is appropriate for every hair type. The salon confirms the service and the price.</p>
      <h2 className="mt-6 font-serif text-2xl">Plans and GST</h2>
      <p>Prices in the product are INR, exclusive of GST. Invoices add 18% GST. Annual billing is ten times the monthly price. Credit packs add credits to the balance. A failed preview returns the credit.</p>
      <h2 className="mt-6 font-serif text-2xl">Acceptable use</h2>
      <p>Do not upload a photo of someone who has not agreed, do not use the tool on a minor without a parent present, and do not attempt to store or resell guest photos. We may suspend a salon that misuses the tool.</p>
      <h2 className="mt-6 font-serif text-2xl">Privacy roles</h2>
      <p>The salon is the data fiduciary. We process try-on traffic as described in the privacy notice. A data processing addendum should be signed before a paying salon goes live.</p>
    </main>
  );
}
