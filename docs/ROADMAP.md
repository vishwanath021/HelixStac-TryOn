# Roadmap

## MVP (this repository)

- Multi-tenant page, brand colours, languages, services, WhatsApp.
- On-device colour with a self-hosted MediaPipe hair model.
- Style preview through `ImageStyleProvider`, mock by default, Gemini when keyed.
- Consent log, no photo storage, lead on Book, QR PNG/SVG and a printable standee.
- Admin: onboarding, catalogue, services, leads, CSV on Pro/trial, billing mock, embed snippet.
- Super-admin: tenants, credits, enable/disable, assumed COGS.
- Demo salon so `npm run db:push && npm run seed && npm run dev` works.

Exit to aim for, not claimed as done: 10 pilot salons, 40 try-ons each in 14 days, 15% of sessions reaching WhatsApp, and a majority of guests saying the preview looks like them.

## v1

- Razorpay live (the adapter is in the repo; plans and webhook secret are not).
- Custom-domain DNS check is implemented; production TLS still depends on the host (Caddy or Vercel).
- Monthly WhatsApp usage note to the owner.
- Prompt bake-off: about 40 selfies × 10 styles × 3 models, scored blind on identity, realism, and Indian hair texture. Swap `GEMINI_MODEL_STANDARD` only after that.
- Lawyer review of the consent text before the May 2027 DPDP dates matter in practice.

Exit: 25 paying salons, pilot-to-paid near 25%, second-month retention near 90%, COGS per standard preview at or under ₹4.

## v2

- Per-outlet catalogues, not just per-outlet WhatsApp.
- API for salon-software vendors.
- Colour passes that suggest highlights or balayage, still labelled as a tint.
- Sponsored shade sets, only with a visible label.
- Referral fees for distributors.

Exit: 80 paying salons, a few chain or OEM deals, gross margin at or above 60%, MRR at or above ₹1 lakh.
