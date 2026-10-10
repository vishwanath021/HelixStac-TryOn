# Lookuvi QA plan

Scope is the guest try-on, salon owner and staff tools, and the platform admin. Paid provider calls stay off. Playwright blanks `OPENAI_API_KEY`, `FAL_KEY`, `GEMINI_API_KEY`, `REPLICATE_API_TOKEN`, and `OPENROUTER_API_KEY`. Guest hairstyles fall through to the mock when no key is stored.

## Surfaces

| Surface | Entry | What it covers |
| --- | --- | --- |
| Guest try-on | `/` redirects to `/s/demo-salon`, also `/embed/[slug]` | Header, Book Now, WhatsApp, tool pill, camera, upload, consent, style/colour/brows/nails/beard, result slider, save, try another |
| Guest account | `/s/[slug]/me`, OTP, bookings | Phone code, profile, booking request, delete |
| QR and guide | `/s/[slug]/qr`, `/admin/qr`, `/s/[slug]/guide` | Salon link and QR |
| Leads | guest concierge, `/admin/leads` | Lead capture and export |
| Owner | `/login`, `/admin`, settings, styles, services, bookings, billing, AI | Catalogue, caps, logo, plan, credits |
| Staff | same `/admin` with the staff user | Catalogue and leads. Brand, billing, and AI stay with the owner |
| Super admin | `/super`, `/super/ai` | Salons, hairstyle engine, image costs, benchmarks |
| Privacy | `/privacy`, `/terms`, consent, data requests | Photo use, retention, delete |
| Health | `GET /api/health` | Database reachability |

Demo owner: `owner@demo.helixstac.app` / `DemoSalon#2026`. Staff: `staff@demo.helixstac.app` / `DemoStaff#2026`. Super: `super@helixstac.app` / `SuperAdmin#2026`.

## Cases

### Guest layout and brand

- Phone widths 320, 360, 390, and 430: Style, Colour, Brows, Nails, and Beard stay on one row inside one slim pill. The pill may scroll, with faded edges.
- Tablet 768 and 1024, and desktop 1280: the same pill is one row and the segments share the width.
- Header shows the salon name and the salon logo. The demo salon uses the Lookuvi mark. A salon that uploads a logo keeps that logo.
- Book Now and WhatsApp stay on screen. Demo mode shows the short Demo label. The page title is “See your next look.”
- Rotate a phone viewport. The pill stays one row and the page does not grow a horizontal scrollbar on the device profiles in `responsive.spec.ts`.

### Camera and photos

- Take selfie opens the camera. Take photo stores a still. Retake drops that still, restarts the stream, and the next still is a new frame.
- Try another, after a result, also reopens the camera for a new frame.
- File inputs are cleared after a pick so choosing the same file fires change again.
- Denied or missing camera permission shows the error and an upload fallback. The style list stays usable.
- Large, HEIC, and low-resolution files go through the browser decoder, then `POST /api/v1/tryon/prepare-photo` when the browser cannot decode them.
- No face, two faces, and a face used on the nails tool: the nails path rejects a face still. The mock path does not call a provider.
- Double-click Try this look does not start a second paid call. In mock mode it does not create two successes for one click.
- Back from the camera returns to Take selfie. Refresh mid-camera drops the stream. The back button in the browser leaves the guest page without a stuck preview.

### Results, consent, and caps

- Consent is required before a preview. Details opens `/privacy`.
- The before/after control is one frame with a draggable divider.
- Save downloads a JPEG. The response does not name the model or a price.
- Anonymous daily cap explains the limit. Salon mode lifts it.
- Spend cap, provider timeout, and provider error stay on the mock or the existing unit coverage. No live key is used in this pass.
- Slow network: the styling state shows until the mock returns.

### Accounts and roles

- Owner login lands on `/admin`. Sign out returns to the guest salon.
- Staff can open `/admin` and cannot save settings. `PUT /api/v1/admin/settings` is 403 for staff.
- Staff and a signed-out visitor who open `/super` land on `/login`.
- Salon rename from owner settings and from the super salon list shows on the guest header and the QR page.
- Logout during a flow does not leave an admin page open.

### Billing, AI selector, suggestions

- Billing page lists the plan and credits. Mock checkout does not call Razorpay.
- Super AI page can select fal FLUX.3 or OpenAI sunburst as the salon default. Guest pages do not show provider names or rupee estimates.
- Hair suggestions stay off unless the owner turns them on. This pass does not click Get AI suggestions.
- Colour, brows, nails, and beard stay on the masked path.

### Internationalisation

- Copy for the guest tools exists in English, Hindi, Kannada, Tamil, Telugu, and Marathi. The default guest page is English. Switching language is covered where the language control is on the page.

### Deploy

- `npm run build` then `npm start` answers `/api/health`.
- The Docker image starts with Postgres and `/api/health` reports `db: true`.
- Production boot refuses a missing `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, or `APP_BASE_URL`.
- `ALLOW_DEV_MAGIC_LINK=true` and `ALLOW_DEV_OTP=true` refuse to boot in production. The magic-link and OTP routes do not return a dev URL or code when `NODE_ENV` is production.
- Logs redact photo, image, and secret fields.

## Physical device only

- iOS Safari permission sheet, the second shutter after Retake, and HEIC from the camera roll.
- Android Chrome permission denial and the capture file input.
- Safe area, the home indicator, and rotation on a real phone.
- A real fal or OpenAI hairstyle. This plan does not spend.
