# Business plan

White-label hair try-on for small Indian salons. Figures are INR, exclusive of GST, unless noted. **[Sourced]** has a public reference. **[Assumption]** needs a pilot.

## Thesis

Salons do not buy "AI". They buy a shorter colour consultation and a WhatsApp booking. Live colour is free and runs on the guest's phone. AI cut previews and eyebrow previews spend the same credits, because an unlimited plan can lose money.

This is a small SaaS. A good year is tens of lakhs of ARR, not a venture outcome, unless a chain or a salon-software vendor bundles it. **[Assumption]**

## Who buys

Beachhead: unisex salons in tier-1 and tier-2 cities, 3–10 chairs, already doing colour or keratin, willing to pay about ₹800–2,000 a month. **[Assumption]**

Barbers fit Starter only. Bridal studios can pay more and there are fewer of them. Chains are a later sale. Neighbourhood parlours with no digital habit are a poor fit.

## Market

India has on the order of 6 million salons, mostly unorganised, in a market reported at ₹1.36 lakh crore for 2025. **[Sourced: The India Watch, Apr 2026]** Ken Research uses a different boundary (organised outlets in the low tens of thousands). Treat the counts as order-of-magnitude. We need on the order of 100–300 paying salons, not a percent of the country.

## Competitors

EaseMySalon and Glowbook sell full salon suites around ₹199–999 a month and already speak WhatsApp and QR. They do not sell a try-on. They are the price anchor and a possible channel. Zenoti, Fresha, and Booksy are heavier or global. Perfect Corp and similar AR vendors are enterprise and not packaged for a ₹1,000 salon. Consumer try-on apps are free and generic; our edge is the salon's own menu, languages, and booking.

## Pricing

| | Starter | Pro | Chain / white-label |
|---|---|---|---|
| Monthly ex-GST | ₹799 | ₹1,999 | ₹4,999 for 3 outlets |
| Annual (2 months free) | ₹7,990 | ₹19,990 | ₹49,990 |
| Setup | ₹0 | ₹2,999 | ₹9,999 |
| AI previews | 100 | 300 | 600 pooled |
| Live colour | Unlimited | Unlimited | Unlimited |
| Embed, custom domain, lead CSV, remove mark | No | Yes | Yes, plus outlets |

GST on the invoice is 18%. **[Sourced: standard SaaS GST treatment; confirm with your CA]**

Credit packs, ex-GST: 100 for ₹799, 500 for ₹3,499, 2,000 for ₹11,999. HD preview = 2 credits. Trial is 14 days.

Why not ₹199: AI cost eats it. Why not much more: a whole salon suite is already sold near ₹999.

## Unit economics

**[Assumption]** unless noted. FX ₹96/USD (RBI reference near ₹95.99 on 1 Oct 2026). Standard preview ≈ $0.0336 → about ₹3.5 after an 8% retry allowance. HD ≈ $0.067 → about ₹7. List prices from Google's Gemini pricing page, 3 Oct 2026. The formula in code (`assumedInr`) rounds the HD figure to ₹6.9; the operating assumption used on the super-admin page is ₹7.

Utilisation assumption: 50% / 60% / 70% of included credits on Starter / Pro / Chain. Infra ₹40 / ₹50 / ₹100. Payment fee 3.4% (Razorpay domestic plus a subscriptions loading — verify at signup).

| | Starter | Pro | Chain |
|---|---|---|---|
| Revenue | ₹799 | ₹1,999 | ₹4,999 |
| AI COGS at those utilisation rates | ₹175 | ₹630 | ₹1,470 |
| Fees + infra | ~₹67 | ~₹118 | ~₹270 |
| Gross profit | ~₹557 (70%) | ~₹1,251 (63%) | ~₹3,259 (65%) |

Blended, if the mix is 60/35/5: about ₹1,430 ARPA and about ₹935 gross profit (65%).

A Pro salon that spends every credit on HD (300 previews × 2 credits, costed near ₹7) can wipe the margin. Mitigation: HD costs 2 credits, hard daily caps, and packs instead of unlimited AI.

Break-even on fixed cost, ignoring CAC: about 16 salons at ₹15k fixed, 32 at ₹30k, 64 at ₹60k. `breakEvenAccounts(30000, 935)` is 33 because of rounding up.

CAC assumption ₹4,000 and 4% monthly churn → payback near 4 months and LTV/CAC above 5. At 8% churn and ₹6,000 CAC the model is barely alive. Churn is the number to watch.

## Go to market

1. Ten salons you can visit in Bengaluru. Fourteen days free. Collect before/after only with consent. Do not imply a relationship with any franchise that built its own try-on.
2. WhatsApp the prospect a demo link with their name and a short screen recording.
3. Leave a QR standee for a day in one neighbourhood, then a tier-2 city.
4. Ask colour distributors for introductions. A referral fee of a few hundred rupees is an assumption.
5. Starter pages keep a "Powered by" link. Annual prepay is the churn defence.
6. Later: an OEM conversation with salon-software vendors.

## 12-month sketch, all assumptions

Base case: about 71 paying salons, about ₹1.0 lakh MRR, peak cash near ₹2.9 lakh, roughly break-even around month 13 if fixed cost stays near ₹30k and churn stays near 4%. Conservative (28 salons) is hobby income. Optimistic (160) needs a salesperson. Reaching 70 salons founder-only means a few hundred trials.

## Risks

- **DPDP.** Face photos are personal data. The 2025 Rules were notified in November 2025; many obligations apply from 13 May 2027. Penalties cited publicly are large. Build consent, no photo storage, withdrawal, and a parent present for kids' styles now. Get a lawyer to review the notice. Do not market the product as "biometric-free": a style preview does send a face to a processor.
- **Quality.** Identity drift and plastic hair will cause churn. Run a bake-off before spending on ads: on the order of 40 selfies × 10 styles × 3 models. Keep the disclaimer.
- **Model shutdowns and FX.** `gemini-2.5-flash-image` was shut on 2 Oct 2026. The provider interface and the env model ids exist so the next shutdown is a config change.
- **Copying.** Suites can add a tab. Distribution, languages, and the salon's own menu are the defence.
- **Misuse.** Rate limits, an age line, and no photo retention. Still not a guarantee against a guest uploading someone else's photo.
