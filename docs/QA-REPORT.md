# Lookuvi QA report

Date: 2026-10-10. No paid provider call. Playwright blanks provider keys. Guest previews in this run are the mock.

## Result

| Check | Result |
| --- | --- |
| Unit tests | 15 files, 119 tests passed |
| Playwright | 49 passed, 1 failed, 7 skipped in the full run. The failure was an `EIO` while closing a screenshot file on the iPhone project. The same retake test passed on desktop in that run, and passed again on the iPhone project when re-run (1 passed). Responsive layouts passed on iPhone 13, iPhone 15, Pixel 7, iPad Mini, iPad Pro, Galaxy Tab S4, landscape tablets, and 1280/1440/1920. |
| `npm run build` then `npm start` | Build exit 0. `GET /api/health` returned `ok: true`, `db: true`, `ai: mock`, `billing: mock`. |
| Docker and Postgres | Image `lookuvi:local` built. Postgres 16 and the app container ran. Seed completed. `GET /api/health` was ok and `/s/demo-salon` returned 200. A container with no `AUTH_SECRET` exited 1. |
| Production env | `next start` exits 1 in under a second when `AUTH_SECRET`, `AUTH_TRUST_HOST`, or `APP_BASE_URL` is missing, and when `ALLOW_DEV_MAGIC_LINK` or `ALLOW_DEV_OTP` is `true`. |

## Bugs

| Sev | Bug | Status |
| --- | --- | --- |
| High | On a phone the tool control wrapped Style, Colour, Brows, Nails, and Beard into a tall rounded blob. | Fixed. Under 768px the pill is one row, scrolls sideways, snaps, and fades at the edges. Checked at 320, 360, 390, 430, 768, 1024, and 1280. Every segment stays on one line. |
| High | After a selfie, Retake and Try another did not open a fresh capture. The camera video was hidden, so a later `play()` kept the old frame, and the file input kept its value. | Fixed. Retake and Try another show the camera before `getUserMedia`, call `getUserMedia` in the click turn, stop the previous tracks, call `video.load()`, and clear both file inputs. An end-to-end test takes a selfie, retakes, and gets a different colour. Try another does the same. |
| Medium | The demo salon header and favicon still used the old orange mark and a teal icon. | Fixed. The mark, wordmark lockup, dark lockup, and app icon are SVG. Favicon, apple icon, and 192/512 icons are rasterized from the app icon. The demo seed uses `/brand/lookuvi-mark.svg` and does not replace a logo a salon already uploaded. |
| Medium | Staff could `PUT /api/v1/admin/settings` even though the settings page says brand stays with the owner. | Fixed. Settings read and write require the owner. A staff session gets 403 and is sent to login from `/super`. |
| Medium | Owners had no control for the logo the API already stored. | Fixed. Settings accepts a logo file, stores a small JPEG, and can clear it so the guest header falls back to the Lookuvi mark. |
| Low | A bad production env logged the refusal and left the process running. | Fixed. Startup calls `process.exit(1)`. |
| High | The Docker image reached Postgres, then the seed crashed: `tsx` could not resolve `@/data/hair-texture` because `tsconfig.json` was not in the image. | Fixed. The runner image copies `tsconfig.json`. |

No product bug from this pass is still open.

## Cases executed

- Guest header, Book Now, WhatsApp, Demo label, and “See your next look.” on phone and desktop.
- Tool pill height and single row at 320, 360, 390, 430, 768, 1024, and 1280.
- Camera, shutter, retake, try another, upload instead, back, and denied camera.
- Consent, style, brows, beard, and nails previews on the mock. Result slider and JPEG save.
- Anonymous cap and salon mode. Booking phone-code gate. Salon rename from the owner and from super admin.
- Owner, staff, and super login. Staff blocked from settings writes and from `/super`.
- Owner logo upload and restore of the Lookuvi mark.
- Super admin hairstyle engine switch with no provider call. Image costs table.
- Device fit, 44px targets, and 16px inputs on the responsive projects, including rotation.
- HEIC and spend-cap behaviour in unit tests (`images-heic`, spend reservation, provider timeout recorded as uncertain, no retry).
- Production build, health, missing secrets, and dev flags.

## Physical device only

These were not run on a handset:

- The iOS Safari permission sheet and a second shutter after Retake. The automated camera is Chromium, including the iPhone 13 viewport. WebKit here has no camera.
- A real HEIC from the iPhone camera roll. Sharp on this machine cannot decode HEVC. The browser tries `createImageBitmap` first, then `POST /api/v1/tryon/prepare-photo`.
- Android Chrome’s permission denial sheet and the `capture` file input.
- The home indicator and Safari’s collapsing toolbar.
- A real fal or OpenAI hairstyle. This pass did not spend.
