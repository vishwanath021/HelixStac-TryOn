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

| | Lite | Starter | Pro |
|---|---|---|---|
| Monthly ex-GST | ₹2,999 | ₹5,999 | ₹10,999 |
| Annual (2 months free) | ₹29,990 | ₹59,990 | ₹1,09,990 |
| Setup | ₹0 | ₹0 | ₹0 |
| AI previews | 300 | 900 | 1,800 |
| Live colour | Unlimited | Unlimited | Unlimited |
| Embed, custom domain, lead CSV | No | Yes | Yes |
| Remove mark, extra outlets | No | No | Yes, 3 outlets |

GST on the invoice is 18%. **[Sourced: standard SaaS GST treatment; confirm with your CA]**

Credit packs, ex-GST: 100 for ₹799, 500 for ₹3,499, 2,000 for ₹11,999. HD preview = 2 credits. Trial is 14 days.

Why not ₹199: AI cost eats it. Why not much more: a whole salon suite is already sold near ₹999.

## Unit economics

**[Assumption]** unless noted. FX ₹96/USD (RBI reference near ₹95.99 on 1 Oct 2026). Standard preview ≈ $0.0336 → about ₹3.5 after an 8% retry allowance. HD ≈ $0.067 → about ₹7. List prices from Google's Gemini pricing page, 3 Oct 2026. The formula in code (`assumedInr`) rounds the HD figure to ₹6.9; the operating assumption used on the super-admin page is ₹7.

Utilisation assumption: 50% / 60% / 70% of included tries on Lite / Starter / Pro, at about ₹3.5 each. Infra ₹40 / ₹50 / ₹100. Payment fee 3.4% of the ex-GST price (Razorpay domestic plus a subscriptions loading — verify at signup).

| | Lite | Starter | Pro |
|---|---|---|---|
| Revenue | ₹2,999 | ₹5,999 | ₹10,999 |
| AI COGS at those utilisation rates | ₹525 | ₹1,890 | ₹4,410 |
| Fees + infra | ~₹142 | ~₹254 | ~₹474 |
| Gross profit | ~₹2,332 (78%) | ~₹3,855 (64%) | ~₹6,115 (56%) |

Blended, if the mix is 60/35/5: about ₹4,449 ARPA. Recalculate the blended gross profit before you use it in a forecast.

A Pro salon that spends all 1,800 tries as HD is 900 previews at about ₹7, near ₹6,300 of AI cost against ₹10,999 ex-GST. HD still costs 2 tries. Daily caps and packs stay in place.

Break-even on fixed cost, using Lite gross profit and ignoring CAC: about 7 salons at ₹15k fixed, 13 at ₹30k, 26 at ₹60k. `breakEvenAccounts(30000, 2332)` is 13.

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
