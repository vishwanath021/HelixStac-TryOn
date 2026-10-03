import Link from "next/link";
import { PLANS, CREDIT_PACKS } from "@/data/plans";
import { formatInr } from "@/lib/json";
import { annualExGst, withGst } from "@/lib/pricing";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-serif text-2xl">
          <img src="/brand/mark.svg" alt="" className="h-9 w-9" />
          HelixStac TryOn
        </Link>
        <nav className="flex gap-4 text-sm">
          <a href="#pricing">Pricing</a>
          <Link href="/s/demo-salon">Demo salon</Link>
          <Link href="/login">Salon login</Link>
        </nav>
      </header>
      <section className="mt-14 grid gap-8 md:grid-cols-[1.3fr_.7fr] md:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">White-label for Indian salons</p>
          <h1 className="mt-3 max-w-xl font-serif text-5xl leading-[1.05]">A try-on page with your name on it. Not another booking suite.</h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-muted">
            Guests recolour their hair on their own phone, preview a cut, and book that look on your WhatsApp.
            Live colour is free. AI previews are metered, and the photo is not stored.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn" href="/s/demo-salon">Open the Bengaluru demo</Link>
            <Link className="btn secondary" href="/login">Set up a salon</Link>
          </div>
        </div>
        <aside className="card p-5 text-sm leading-6">
          <p className="font-serif text-2xl">What the guest does</p>
          <ol className="mt-3 list-decimal space-y-2 pl-4">
            <li>Agrees to a short notice. No photo is kept.</li>
            <li>Uses the camera or a selfie. Colour stays on the phone.</li>
            <li>Picks a cut. The preview takes about 10 seconds and is a guide.</li>
            <li>Sends the look, colour, and suggested services to your WhatsApp.</li>
          </ol>
        </aside>
      </section>
      <section id="pricing" className="mt-16">
        <h2 className="font-serif text-4xl">Pricing, ex-GST</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">Invoices add 18% GST. Annual billing is 10 months, so two months are free. HD previews use 2 credits. Live colour does not.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {Object.values(PLANS).map((plan) => {
            const monthly = withGst(plan.monthlyExGst);
            return (
              <article key={plan.id} className="card p-5">
                <h3 className="font-serif text-2xl">{plan.name}</h3>
                <p className="mt-2 font-serif text-4xl">{formatInr(plan.monthlyExGst)}<span className="text-base text-muted">/mo</span></p>
                <p className="text-xs text-muted">{formatInr(monthly.totalInr)} incl. GST · annual {formatInr(annualExGst(plan.monthlyExGst))}</p>
                <ul className="mt-4 space-y-1 text-sm">
                  <li>{plan.credits} AI previews / month</li>
                  <li>Setup {formatInr(plan.setupExGst)}</li>
                  <li>{plan.styleLimit ? `${plan.styleLimit} styles` : "Full catalogue"}</li>
                  <li>{plan.embed ? "Embed widget" : "Hosted page and QR"}</li>
                  <li>{plan.customDomain ? "Custom domain" : "Path and subdomain"}</li>
                  <li>{plan.leadExport ? "Lead export" : "Leads on screen"}</li>
                  <li>{plan.removeBranding ? "Powered-by can be removed" : "Powered by HelixStac"}</li>
                  <li>{plan.outlets} outlet{plan.outlets > 1 ? "s" : ""}</li>
                </ul>
              </article>
            );
          })}
        </div>
        <p className="mt-4 text-sm text-muted">
          Credit packs, ex-GST: {CREDIT_PACKS.map((pack) => `${pack.credits} for ${formatInr(pack.priceExGst)}`).join(" · ")}. 14-day trial.
        </p>
      </section>
      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {[
          ["Your brand", "Logo, colours, languages, services, and WhatsApp. The guest never has to learn our name."],
          ["On-device colour", "MediaPipe hair segmentation runs in the browser. Sixteen shades, an intensity slider, no upload."],
          ["A lead, not a gallery", "Book this look opens WhatsApp with the cut, colour, and mapped services. You get the lead."],
        ].map(([title, body]) => (
          <article key={title} className="card p-5">
            <h3 className="font-serif text-2xl">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
          </article>
        ))}
      </section>
      <footer className="mt-16 flex flex-wrap gap-4 border-t border-line py-6 text-sm text-muted">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <span>Previews are a guide. They are not a measurement of face shape and not a promise of the cut.</span>
      </footer>
    </main>
  );
}
