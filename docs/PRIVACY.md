# Privacy

This is a product note for builders and a starting point for salon owners. It is not legal advice. Have a lawyer read the consent copy and the data-processing terms before a paying salon goes live.

## Roles

The salon decides why a guest's data is processed. In DPDP terms that is the data fiduciary. HelixStac runs the software and is the processor. Say that in the salon contract.

## What happens to a photo

| Path | Leaves the phone? | Stored? |
|---|---|---|
| Live colour | No. MediaPipe runs in the browser on files we host. | No |
| Style preview | Yes. JPEG bytes go to the app server, then to the configured image provider. | No. Memory only. Response is `Cache-Control: no-store`. |
| Eyebrow mapping | Same path as a style preview. The server sends a brow-only prompt. | No. The try-on row stores the shape id, not the photo. |
| Beard and nail previews | Same path. Prompts edit facial hair or visible nails only. | No pixels stored. |
| Sample portrait | The illustration in `/samples` is not a guest. | It is a static file, not a photo of a person. |

The generate route checks magic bytes, rejects files over 2 MB, and re-encodes with `sharp`, which drops EXIF. Logs go through `redact()` so photo fields and long strings are not printed. Analytics events reject keys that look like images.

There is no photo bucket and no photo column. A deletion request cannot return a file that was never kept. It can delete leads tied to the browser session.

## What is stored

- Consent log: tenant, session id, purpose, text version, sha256 of the notice, language, accepted or not, age-line yes/no, time, a short hash of the user-agent.
- Try-on row: style id, shade id, quality, provider name, status, latency, assumed cost. No pixels.
- Usage events: names like `colour_selected` and `generate_succeeded`, plus small JSON props.
- Lead: optional name and phone, look name, shade name, suggested services, language, source. Created when the guest taps Book.
- Data request: withdraw, delete, or access, with a contact string and a status.

## Consent

The notice is version `2026-10-03` in `src/data/consent.ts`. The guest must tick the age line. Kids' styles say a parent or guardian should be present. Declining consent leaves the menu readable and blocks camera, upload, and preview.

Withdrawal is on `/privacy`. If the browser still has the session id, leads for that session are removed and the request is marked done. Other requests stay open for the salon to handle. The in-product target is 30 days.

## AI provider

Default is the mock renderer. It does not call a network.

If you set `AI_PROVIDER=gemini`, use a **paid** key. Google's pricing page states that paid-tier content is not used to improve Google's products, and free-tier content is. Do not point production at the free tier.

The concierge is rules over the salon's menu unless `CONCIERGE_LLM=gemini`. It does not receive the photo.

## Guests under 18

The age checkbox is an attestation, not an identity check. Kids' catalogue entries are for a child with a parent there. Do not add a face-age estimator and then claim it is accurate.

## Cookies

Auth.js uses an httpOnly session cookie for salon staff. Try-on guests get a random id in `sessionStorage` and do not need an account. The booking hub sets a separate httpOnly `helix_guest` cookie after a phone code. It stores name, date of birth, audience, hair length, family labels, and booking requests for that salon only. Photos are still not stored. **Delete my data** removes that guest row and writes a completed data request. OTP sends are logged as consent with the last four digits of the number, not the code and not a photo. The dev mock may show the code on screen when `NODE_ENV` is not production.
