# Feature parity against the reference inventory

The inventory describes a single-salon site. HelixStac TryOn is a white-label product for many salons. Nothing here copies that site's code, images, prompts, or name. "Shipped" means an original version of the behaviour, not a clone of the option list.

## Shipped (P0 and P1 from the product brief)

| Inventory item | Status |
|---|---|
| Live colour, 16 named shades, on-device, no login, not counted as a preview | Shipped. The colour grid is a chip on the same page. |
| Style gallery, shutter, before/after, book, download, try another | Shipped. Women, men, and kids. The full portrait grid is visible before a photo. Demo mode shows the guest photo with a style-preview card. |
| Eyebrow mapping on the same capture → pick → ~10s → before/after path | Shipped. Seven photo cards, no gender toggle. The reference names eight; this set is not that list. |
| Nail try-on, about 10 designs, hand photo, then before/after | Shipped. Ten photo cards. The frame asks for a hand photo and refuses a face. |
| Beard try-on, about 10 styles, men | Shipped. Ten photo cards, no gender toggle. The reference has no AI beard preview. This one is ours. |
| Kids styles | Shipped on the Style → Kids tab. |
| Face-shape ideas, hair-colour ideas, short quiz | Shipped at `/s/{slug}/guide`. Rule-based, labelled as guidance, deep-links a preselected style or shade. No credit until the guest runs a preview. No photo is analysed. |
| Try-on with no login | Shipped. |
| Anonymous daily cap, higher cap when logged in, salon-mode signed link | Shipped. Defaults are 8 and 30. Salon mode is unlimited. The reference's exact numbers were not public. The public QR does not include the salon token. |
| Booking without login (WhatsApp) | Shipped when "require login to book" is off. That is the default. |
| Booking with phone OTP when the salon turns the toggle on | Shipped. 4–6 digit code, mock sender by default, MSG91 and Twilio stubs that refuse to pretend they sent a message. |
| Hub: profile (name, date of birth 13+, Women / Men / Kids 10 and under, hair length for women), Home, Try-On, Bookings, family profiles, delete my data | Shipped at `/s/{slug}/me`. Data is scoped to the salon. |
| Salon bookings inbox, confirm or decline, WhatsApp deep link | Shipped at `/admin/bookings`. A request, not a slot calendar. |
| en / hi / kn strings for the new screens | Shipped. Other locales fall back to English. |
| DPDP consent for the photo step, and a consent row when a code is sent | Shipped. Photos stay out of the database. |

## Not shipped, on purpose

| Inventory item | Why it is absent |
|---|---|
| Wallet, loyalty points, referrals, membership cards, creator circle | P2. The profile screen says they are not in this version. |
| Vision face analyser, colour-from-photo, skin consult, inspiration matcher | The guide is questions and rules. It does not claim to read a face. |
| Style Studio after the first visit, multi-photo history | Not built. |
| 8-step flagship quiz with price, duration, and a named stylist | The short quiz recommends catalogue styles only. |
| Bridal planner, package builder, hair-health score, fun share cards | Out of this round. |
| SEO articles, area pages, blog | Out of this round. |
| Reference concierge that books inside chat | This app has a menu concierge. Booking is WhatsApp or the hub request. |
| Staff tier separate from salon-mode | Salon-mode is the in-chair unlimited link. Staff Auth.js does not raise the guest cap. |
| Exact reference brow and nail names, thumbnails, and prompts | Original names, drawings, and prompts. |

## Caps, said as config

| Who | AI previews per salon per day | Colour |
|---|---|---|
| Anonymous | `anonDailyCap` (seed 8). 0 blocks previews. | Free, on device |
| Logged-in guest | `memberDailyCap` (seed 30) | Free |
| `?salon=` token from admin | Unlimited until the owner rotates the link | Free |
