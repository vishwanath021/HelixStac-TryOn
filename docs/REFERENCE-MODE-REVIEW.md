# Reference-mode review

Date: 4 Oct 2026. Baseline before this work: `8a3a244` (`docs: record which image-edit parameters the hair path never sends`) on `cursor/feat-initial-build-5096`. The shareable diff against that commit is `docs/reference-mode.diff`.

`HAIR-TRYON-ARCHITECTURE-AUDIT.md` describes the code at that baseline. It is historical. This file describes the code after the reference-mode change. In particular, the audit's notes that a paid edit is attempted twice, and that a billed validation failure drops out of the spend cap, are no longer true.

This repository does not reproduce Jawed Habib's or tjhbagalur.com's private hairstyle backend. That model's identity is unknown. The public page was not copied.

## What this change is

Guest production is unchanged in shape: sanitize the selfie, place a heuristic hair mask, send one OpenAI image edit (or Gemini with no mask), then the existing face registration and composite. Guests still use the Test / Medium / High prices already on `/super/ai`. Those tier prices were not edited.

A separate super-admin path now sends a full-frame edit: the sanitized selfie first, the selected catalogue reference second, and a prompt that names those roles. It does not send a mask, does not paste the original face back, and does not call Gemini or a mock if OpenAI fails.

This follow-up did not place a new paid call. The owner's first paid benchmark is recorded below. Offline tests still do not establish likeness or haircut match.

## Exact request

`POST https://api.openai.com/v1/images/edits`

| Field | Benchmark default | Where it is set |
|---|---|---|
| model | `gpt-image-1.5` | `BENCHMARK_MODEL`. Unknown ids are refused. Nothing is substituted. |
| quality | `medium` | `BENCHMARK_QUALITY`. Must be `low`, `medium`, or `high`. |
| n | `1` | Fixed. |
| input_fidelity | `high` | Sent only when the capability table lists it for that exact model id. |
| output_format | `png` | Lossless inspection file. |
| size | `1024x1024`, `1536x1024`, or `1024x1536` | Chosen from the selfie aspect. Ratio above 1.15 is landscape. Ratio below 1/1.15 is portrait. Otherwise square. `BENCHMARK_INPUT_SIZE=1024` is off by default and forces a 1024 edge (square, or `1024x1536` for a tall photo). |
| image[0] | `selfie.png` | Sanitized selfie, uniform-scaled into the chosen size. Bars use the border mean. No stretch. |
| image[1] | `style-reference.jpg` | A texture sibling `{id}-curly.jpg`, `{id}-wavy.jpg`, or `{id}-straight.jpg` when that file exists and the super-admin asked for it. Otherwise `public/styles/{id}@2x.jpg`, else `{id}-large.jpg`, else `{id}.jpg`. |
| mask | omitted | The prompt has no mask sentence on this path. |
| seed, strength, guidance, guidance_scale | omitted | `FORBIDDEN_EDIT_FIELDS`. |

Authorization for an OpenAI comparison is the dedicated OpenAI key on `/super/ai`, then the older single slot when that slot is an OpenAI key, then `OPENAI_API_KEY`. A Gemini key is not used for an OpenAI model. A fal comparison uses the fal key and refuses before any call when that key is missing or comparisons are off. The key is not written to the repo, logs, or this review. A missing OpenAI key returns `NO_OPENAI_KEY` and makes no call.

If the API rejects `gpt-image-1.5` or `input_fidelity`, the run returns that error (`UNKNOWN_MODEL` or `BENCHMARK`, HTTP 422) and stops. There is no second model.

One `fetch`, `AbortSignal.timeout(55_000)`, no OpenAI SDK. `@google/genai` 1.21.0 retries chunked file uploads only (`MAX_RETRY_COUNT = 3` inside `uploadBlob`). `generateContent` is a single request. The hair pipeline's `MAX_PROVIDER_ATTEMPTS` is 1. HTTP 429 and 5xx are recorded as an unknown bill and are not sent again, including where the image guide suggests retrying rate limits. A timeout, a dropped connection, a rejected output, and a lost client connection follow the same rule.

`quoteBenchmark` refuses the run before any HTTP call when the model is unknown, when that model cannot take `input_fidelity=high`, when the price cell is missing, or when the buffered full estimate (output tokens plus image-input and text-input allowances) exceeds `BENCHMARK_RUN_CAP_INR` (default 30). The global `AI_SPEND_CAP_INR` still applies inside `beginPaidCall`.

## Documentation checked

Fetched 4 Oct 2026:

- Model page: https://developers.openai.com/api/docs/models/gpt-image-1.5
- Image guide: https://developers.openai.com/api/docs/guides/image-generation

The model page lists snapshots `gpt-image-1.5` and `gpt-image-1.5-2025-12-16`, image input and output, and this per-image output table:

| Quality | 1024×1024 | 1024×1536 | 1536×1024 |
|---|---|---|---|
| Low | $0.009 | $0.013 | $0.013 |
| Medium | $0.034 | $0.05 | $0.05 |
| High | $0.133 | $0.20 | $0.20 |

Token rates on that page: text input $5 / 1M, text output $10 / 1M, image input $8 / 1M, image output $32 / 1M. The page does not mention `input_fidelity`.

The image guide says output format defaults to png and also accepts jpeg and webp. Recommended sizes include `1024x1024`, `1536x1024`, and `1024x1536`. Quality values include `low`, `medium`, and `high`. The same guide's legacy table matches the model page for GPT Image 1.5, GPT Image 1, GPT Image 1 Mini, and GPT Image 2. It says to still add text and image input tokens on top of that legacy output price.

On fidelity, the guide says: “The `input_fidelity` parameter controls how strongly a model preserves details from input images during edits and reference-image workflows. For `gpt-image-2`, omit this parameter; the API doesn’t allow changing it because the model processes every image input at high fidelity automatically.”

`gpt-image-1.5` is treated as a model prior to `gpt-image-2`, so the benchmark sends `input_fidelity=high`. The first paid run accepted that parameter. A later rejection still fails the run. `gpt-image-1-mini` and `gpt-image-2` have `inputFidelity: null` in `src/lib/ai/edit-request.ts` and the parameter is not posted. Capability checks use the exact model id. A substring of the id is not enough.

The Images API reference page timed out on fetch. Parameter names used here (`model`, `prompt`, `image[]`, `mask`, `quality`, `size`, `output_format`, `n`, `input_fidelity`) are the ones in the image guide's edit examples and the existing production client.

## First paid run

The owner ran one real benchmark. This agent did not repeat it.

- Model `gpt-image-1.5`, quality `medium`, `input_fidelity=high` (accepted), size `1536x1024`, selfie plus the pixie reference.
- Latency 21.2 s.
- Usage: input 11,180 tokens (10,885 image + 295 text), output 1,899 tokens. The guide's medium-landscape cell is 1,568 image-output tokens. Charging the reported 1,899 output tokens at $32 / 1M, the 10,885 image-input tokens at $8 / 1M, and the 295 text tokens at $5 / 1M comes to $0.149.
- At FX 96 that is ₹14.30 with no buffer, and about ₹15.50 with the 1.08 testing buffer. The old quote of ₹5.20 was the output list price only ($0.05) and left out the image-input tokens (about $0.087).
- The haircut, face, and background were judged good. The white crew-neck tee became a shallow V or scoop. That is a clothing failure, not a hair failure.

The quote now prices output tokens at the image-output rate ($32 / 1M), image-input tokens at $8 / 1M, and a 400-token text allowance at $5 / 1M. Image-input tokens scale from 10,885 per (1536×1024 + 512×512) pixels, times 1.15. Output tokens scale from the guide table by 1899/1568. The page says “estimate, actual from provider usage.” After a run, `BenchmarkRun` stores the provider usage, latency, and the computed actual USD and INR separately from the estimate.

## Cost

These are published rates plus that calibration, not invoices. `bufferedInr` is USD × `FX_INR_PER_USD` (default 96) × 1.08, rounded up to ₹0.1. `npm run benchmark:quote` printed, with no network call:

| Selfie | Size sent | Estimate USD | Buffered estimate | Breakdown | Run cap |
|---|---|---|---|---|---|
| 1024×1024 | 1024×1024 | $0.114 | ₹11.9 | output $0.041 + image input $0.072 (8,942 tok) + text $0.002 | ₹30 |
| 1280×720 | 1536×1024 | $0.163 | ₹16.9 | output $0.061 + image input $0.100 (12,518 tok) + text $0.002 | ₹30 |
| 720×1280 | 1024×1536 | $0.164 | ₹17.0 | output $0.061 + image input $0.100 (12,518 tok) + text $0.002 | ₹30 |

The ₹30 cap is checked against this full estimate. High quality at 1536×1024 is above the cap and is refused before the call. `BENCHMARK_INPUT_SIZE=1024` is unset by default. It sends a 1024-edge selfie (square, or 1024×1536 when the photo is tall) and leaves the reference at 512. A wide photo then has side bars and a smaller subject, in exchange for fewer image-input tokens. Compare one tight run with one full run before relying on it.

The ledger stores `costSource=usage` from `costUsdFromUsage` when the response includes token counts, at FX with no 1.08 buffer. Image-edit output tokens are priced at the image-output rate ($32 / 1M for `gpt-image-1.5`). The cap itself still reserves the buffered estimate.

The benchmark tier is visible on `/super/ai` next to the cost ledger. It is not a guest tier. Guest Test stays `gpt-image-1-mini` low at about ₹0.60. Turning this mode on for guests would replace that with roughly ₹12–₹17 per image at medium quality. It is not enabled for guests.

## Spend and duplicate requests

Provider spend and salon credits are separate.

- `AiCall` statuses `CHARGED`, `BILLED_FAILED`, and `UNCERTAIN` count toward `AI_SPEND_CAP_INR`, using the reserved `estimatePaise`.
- A validator rejection after a billed call (`BILLED_FAILED`) stays in the cap. Salon credits for that preview are refunded.
- `REFUNDED` is a known unbilled outcome. It leaves the cap. A customer credit refund does not clear a billed or uncertain provider row.
- Timeout, abort, network failure, HTTP 429, and HTTP 5xx become `UNCERTAIN` and stay in the cap at the reserved estimate. The job is not regenerated.
- HTTP 4xx other than an unknown-model body becomes `REFUNDED` (unbilled).
- `beginPaidCall` holds an in-process queue and then a Prisma transaction that sums the cap rows before inserting the reservation. Two overlapping ₹0.80 reservations against a ₹1 cap: one proceeds, one is refused. The queue does not cross processes. Two instances share the reservation only when they share `DATABASE_URL`. This deployment is one SQLite file, which serializes writers of that file. A second process with a different database file would not see these rows.

Guest request dedupe is `GenerationJob`, unique on `(tenantId, requestId)`. The fingerprint is SHA-256 of the sanitized photo bytes plus mode, tool, style id, and shade id.

- Same id and same fingerprint while `PENDING` and younger than 90 seconds: HTTP 409, no new provider call.
- Same id and a different fingerprint: HTTP 409 conflict.
- `READY` with the file still on disk: the stored JPEG is returned and no provider call is made.
- `PENDING` at or past 90 seconds: the row becomes `UNCERTAIN`, any linked call is released as `UNCERTAIN`, HTTP 504, and the provider is not called again.
- A finished failure is replayed with its original outcome (placement 422, credits 402, suspended 403, uncertain 504, otherwise 502).
- Photos live under `var/generation-jobs` (gitignored) and expire after `GENERATION_JOB_TTL_HOURS` (default 24).

The try-on button disables while a preview is in flight, and a ref ignores a second click before React re-renders. `finally` clears the busy flag. Each click sends a new `crypto.randomUUID()`. The same click's id is deduped. A later click is a new job and can spend again. That is the remaining double-charge window if the first response was lost and the guest taps the style again.

Mock, no-key, and spend-cap images are `TryOn` status `DEMO`. Salon credits are refunded. The daily success cap counts `SUCCEEDED` only. Provider failures are HTTP 502 or 504 with no image. They are not reported as a successful hairstyle.

## Reference images and prompt

All 59 files in `public/styles/*.jpg` were measured at 512×512. No `{id}@2x.jpg` or `{id}-large.jpg` exists, so the benchmark sends the 512×512 JPEG unchanged. It is not upscaled and not cropped again in code. The files are synthetic portraits of non-real people generated for this catalogue, so there is no customer-photo permission issue. They are square and, on the files opened below, include the whole head. A larger approved file would be preferred automatically if one is added beside the 512 JPEG.

`lengthCategory` is stored on every style and added to the reference prompt:

- short: “If the person in Image 1 currently has longer hair, this is a long-to-short change: remove the extra hair and plausibly reconstruct exposed neck, ears, and background.”
- long: “If the person in Image 1 currently has shorter hair, this is a short-to-long change: extend the hair without enlarging the head or changing the framing.”
- medium: covers both directions without those two phrases.

Classic men's cuts no longer fall through to long. `side-part`, `slick-back`, `old-money`, `comb-over`, and `scissor-cut` are medium. `pompadour`, `quiff`, `ivy-league`, and `short-back-sides` are short. `bro-flow` is medium. `hime-cut` is long. `modern-mullet` stays long. Production mask extents still use the old hair-extent helper, not this field.

The reference prompt is the requested paragraph plus `style.prompt`, the length sentence, and a colour sentence only when a colour name is passed. It contains no mask wording. `buildStylePrompt` (guest production) still tells the model about the mask.

A missing style or a missing file returns an error and does not fall back to a text-only edit. Text-only remains the guest production prompt, which runs only on the guest route.

### Reference needs regeneration

Opened and judged from the portrait, not from the filename alone:

- `kids-pixie` — reads as a young boy with a short textured cut, not a pixie.
- `high-fade` — short textured top, high skin fade, light stubble. Easy to confuse with the other short fades.
- `low-fade` — short textured top, lower fade, light stubble. Similar silhouette to `high-fade`.
- `caesar` — short forward fringe and light stubble, close to the same short men's crop.

Also opened: `pixie` reads as a textured pixie; `long-layers` shows length past the shoulders with the head inside the frame; `kids-bowl` reads as a bowl cut. `buzz-cut` was described on inspection as a short crew with stubble rather than an even clipper buzz, so treat `buzz-cut` as weak too.

Stubble is visible on the men's short portraits that were opened (`buzz-cut`, `crew-cut`, `french-crop`, `mid-fade`, `taper-fade`, `burst-fade`, `drop-fade`, plus the four named above). Stubble can transfer if the model copies the reference person. The prompt forbids transferring the reference face, and that has not been checked on a real output.

The other catalogue files were measured for size only. They were not each opened.

## Debug stages

Written under `var/benchmarks/{id}` when a super-admin run starts. Gitignored. Served only by `requireSuper` from `/api/v1/super/ai/benchmark/{id}/file`, with the stage name restricted to the list below. The review page `/super/ai/benchmark/{id}` is `pageSuper` and is titled “Unvalidated model output”.

| File | What it is |
|---|---|
| `original-input.jpg` | Upload bytes. |
| `sanitized-input.jpg` | After `sanitizeSelfie`. |
| `provider-input.png` | Exact PNG appended as the first image. |
| `provider-reference.jpg` | Exact reference appended as the second image. |
| `provider-response.png` | Base64 payload decoded, before any crop. This is the raw provider body. |
| `restored-output.png` | Crop of that body with the recorded transform. This is not the raw provider output. |
| `transform.json` | Source size, target size, content window, offset, uniform scale. |
| `validation.json` | `label: unvalidated model output`, `compositeApplied: false`, `maskSent: false`, `faceBlobUsedAsGate: false`, `accepted: false`. |

`restoreFrame` is a crop of the recorded content window. It is not `restoreSquareContent`. The production `DEBUG_SAVE_RAW` file is still the square-restored JPEG before the face composite, and the README says so.

Rows older than `BENCHMARK_RETENTION_HOURS` (default 72) are deleted, directory included, on the next benchmark POST. The purge removes 20 rows per request. Logs do not include API keys or photo bytes. The JSON response is an id and a message, not the image.

The skin-colour blob remains the guest placement gate. It is not used to accept a benchmark. The benchmark does not run landmark detection. Alignment on the guest path is still not a haircut score, and a failed generated head is not repaired by pasting the original face over it. A new segmentation or compositing stack waits on this raw benchmark.

## Tests run

No OpenAI or Gemini request was made.

`npx tsc --noEmit` — exit 0, run again as part of `npm run build`.

`npx vitest run tests/unit/reference-mode.test.ts tests/unit/tiers.test.ts tests/unit/masks.test.ts tests/unit/product.test.ts tests/unit/credits.test.ts` — 5 files, 67 tests passed. This run includes the salon reference switch: guests do not see it, an unrequested try-on stays on the production path, and an authorized reference edit sends the selfie before the style image with no mask.

`npm run benchmark:quote` — the three rows in the cost table. “No provider call was made.”

`npm run scan:secrets` — no committed API-key patterns.

`npx next lint` — no ESLint warnings or errors.

`npm run build` (`prisma generate` and `next build`) — exit 0. Next.js 15.5.27 compiled, typecheck passed inside the build, and the routes `/super/ai`, `/super/ai/benchmark/[id]`, `/api/v1/super/ai/benchmark`, and `/api/v1/super/ai/benchmark/[id]/file` are in the route table.

What the unit tests cover:

- `gpt-image-1.5`, quality medium, `n=1`, `input_fidelity=high`, png, landscape size, selfie before reference, no seed/strength/guidance, no mask wording, and the production prompt still mentions a mask.
- `gpt-image-2` with fidelity high is refused. An unknown model id is refused. No model is swapped.
- The selected `pixie` JPEG loads. An unknown style does not fall back to text.
- A short style's prompt includes long-to-short. A long style's prompt includes short-to-long. A medium style includes neither phrase.
- `side-part` is medium, `short-back-sides` is short, `bro-flow` is medium, `hime-cut` and `long-layers` are long.
- A 400×200 image fitted into 1536×1024 keeps aspect about 2. The restored crop matches the content window. The scale is uniform.
- `captureShouldMirror("user")` is true and `"environment"` is false.
- A billed rejection and an uncertain release both stay inside a ₹1 cap and block the next ₹0.60 reservation. A `REFUNDED` release does not.
- Two concurrent ₹0.80 reservations against ₹1: one ok, one refused.
- The same request id does not start a second job. A different photo on that id conflicts.
- `runLockedEdit` with a throwing provider calls it once and returns `uncertain` for `UncertainBillingError`.
- `salonOutcome` maps no-key and spend-cap to `DEMO` with a credit refund, and a real edit to `SUCCEEDED` with a commit.
- The saved `tests/fixtures/replay/long-layers-raw.jpg` is still rejected by the production face guard (`calls === 1`).

`npm run test` is the broader suite. Playwright e2e was not re-run.

The clothing check compares the neckline band of the restored frame with the sanitized selfie after `registerProviderFrame`. A large change is `clothing_changed` in `validation.json` and on the run row. `accepted` stays false. Synthetic tests cover an unchanged shirt, a hair-only change above the band, and a recolored neckline.

Browser check against the production build on `127.0.0.1:3000`, with no provider call: an anonymous `GET /super/ai` returned 307, and an anonymous benchmark quote returned 403 `FORBIDDEN`. Signed in as the super-admin, the Reference benchmark section showed the style list, a disabled **Run benchmark** button, and after a synthetic 720×1280 JPEG the quote `gpt-image-1.5, quality medium, size 1024x1536, input_fidelity high, output png, n=1`, about ₹5.20. That ₹5.20 figure is the old output-only quote, from before this follow-up. The confirmation checkbox enabled the button. The button was not clicked. `/super/ai/benchmark/does-not-exist` rendered the not-found page. Guest style-button disabling was not exercised in the browser; the lock and `disabled={busy}` are in `TryOnApp`.

## Implemented, and still visually unverified

Implemented and checked offline: the request builder, reference lookup, prompt roles, length sentences, spend statuses, dedupe, single attempt, demo accounting, super-admin quote and confirm UI, private stage files, and the production face-guard still rejecting the saved bad frame.

The first paid pixie run showed a usable haircut with the face and background kept, and it also changed a crew neck into a shallow V. The prompt now tells the model to keep neckline, collar, sleeves, garment colour, and straps, including the exact crew neckline of a t-shirt. That sentence has not been tried on a second paid image. The six-row sheet `docs/benchmark-score-sheet.csv` is still empty.

## Salon try-on switch

The separate `/super/ai` form is still there. A signed-in super-admin can also run the same edit from `/s/demo-salon` on the hairstyle tab.

The switch is rendered only when `showReferenceToggle` is true, which is only a super-admin session. Guests do not get the control. `TRYON_REFERENCE_MODE` is unset by default. Setting it to `on` does not show the switch and does not change a generate that does not ask for reference mode. On a private machine it can authorize an explicit `referenceMode=yes` request that has no super-admin session. Leave it unset anywhere a guest can reach the server.

With the switch off, the style button uses the production path: heuristic mask, production tier, and the face composite. With the switch on, choosing a style loads a quote and does not call the provider. The paid click is **Try this hairstyle**, after the estimate is visible and the confirmation box is ticked. That request is hairstyles only. Beard, nails, and brows ignore the flag.

A local browser check, with no provider call: an anonymous `/s/demo-salon` page did not contain the switch. Signed in as the super-admin, the switch was visible. A synthetic 480×640 JPEG, privacy ticked, switch on, and Pixie selected quoted `gpt-image-1.5`, quality medium, size `1024x1536`, about ₹17.00 ($0.164). **Try this hairstyle** stayed disabled until the confirmation box was ticked, then became enabled, and was not clicked. `/super/ai` still showed Reference benchmark. An anonymous quote request returned 403.

The generate route then uses the same reference edit as the benchmark: `gpt-image-1.5`, quality medium, `input_fidelity=high`, png, selfie then the style reference, no mask, no face paste, one call. It still claims the request id, reserves through `beginPaidCall` (the ₹500 ledger cap), and refuses when the ₹30 run cap is below the full estimate. A timeout stays an unknown bill and is not sent again. Salon preview credits are not consumed, and the try-on row is `UNVALIDATED`, so it does not count as a successful guest preview. Stages are written under `var/benchmarks` with the same 72-hour retention and **Delete now**. The raw provider image is shown beside the original with the label Experimental, unvalidated. `accepted` stays false. Actual cost, usage, and latency are included in the JSON only when the caller is a super-admin.

## Hair-only composite

A second checkbox, **Hair-only composite**, appears only while Reference mode is on. It is off by default. Guests never see it. The benchmark form on `/super/ai` does not use it.

The paid request is unchanged: one reference edit, the same quote, confirmation, request-id dedup, ₹500 ledger and ₹30 run cap. `hairComposite=yes` is ignored unless reference mode is already active. The fingerprint mode is `reference-hair`, or `reference-hair-curly` / `reference-hair-wavy` / `reference-hair-straight` when Hair texture is set, so it does not replay a different texture. The vision models and Python mediapipe are checked before `beginPaidCall`. A missing file returns 400 and does not call the provider.

After the provider PNG returns, the letterbox is cropped with the recorded frame transform, then a landmark similarity maps that frame onto the sanitized selfie. Hair comes from MediaPipe's hair segmenter on both images. Clothes and accessories come from the selfie multiclass model (categories 4 and 5). The protected zone is built from Face Landmarker points: eyes, brows, nose, mouth, the beard and moustache, ears only where the old hair does not cover them, and face-oval skin that is not already hair. The skin-colour blob is not a hair mask.

The matte is the segmenter mask eroded by 2 pixels, then a radius-2 guided filter on the aligned luminance. Pale spill that is lighter than the hair and closer to the wall is dropped, including inside that core, so the model's background is not pulled into the hair. Feather is 3 pixels and only where the eroded core covers old hair. It does not paint generated pixels onto wall that the old hair did not cover. Where old hair is removed, the fill is the nearest original wall pixel a few pixels outside the hair, keeping the brighter half of that ring so a dark unmasked fringe does not turn the fill gray. The generated background is mixed in only when it is not paler than that wall and is within 30 per-channel counts. A 2-pixel dark fringe just outside the old hair mask is replaced with that same wall tone. `backgroundEdgeDelta` measures the band outside a known hair mask. The unit fixture keeps that mean under `HALO_MAX_DELTA` (14) while a naive copy of the white model background does not. `unchangedWallDelta` on the replays was 2.4 for the real face and 0.3 for the synthetic pixie.

`validation.json` keeps `accepted: false`. `compositeApplied` is true only when the composite file was written. `provider-response.png` remains the raw provider body. `hair-composite.png` is a different file and the file route labels it `hair-only-composite`. A failed composite stores `compositeError` and does not retry the paid call.

The first face check compared scale-free brow, nose and ear-width ratios, plus SSIM on protected skin that neither hair mask claims. That check is no longer what sets the warning. See "Raw result and model comparison" below. The old Messy Texture replay was flagged by SSIM 0.77 and a nose ratio delta of 0.072. The synthetic pixie raw was not (SSIM 0.83). Those numbers stay in the report for review. `DRIFT_LIMITS` is no longer the accept/reject rule, and this path does not reject.

Offline replay, no provider call:

```bash
npm run replay:composite -- --original sanitized-input.jpg --raw provider-response.png --out /tmp/replay-pixie --label synthetic-pixie
```

The synthetic contact sheet is original, raw, mask overlay, composite. The beard, black t-shirt and wall in the real-face replay stayed with the selfie. The raw Messy Texture frame is still flagged (SSIM 0.773, nose ratio delta 0.072). Its composite is not (SSIM 1.0). The synthetic pixie raw is not flagged (SSIM 0.832). Its composite is not flagged (SSIM 1.0). Changed pixels are about 8% on the real face after the tighter matte. The wall beside the new hair moved by 2.4 counts per channel on that replay and 0.3 on the synthetic one.

Hair texture is still a separate limit. The saved Messy Texture raw drew straight, spiky hair over curly hair. The composite can only place the hair the model actually drew. It does not invent the original curl.

## Hair texture

Reference mode always tells the model to keep the texture in Image 1 (curly, wavy, straight, or coily) and to take only silhouette, length, layering, fringe and parting from Image 2. A super-admin **Hair texture** select on the salon page defaults to **Keep natural**. Straight, Wavy, or Curly is posted only when it is changed, and the prompt then adds one sentence that a texture change was requested and that Image 2 does not supply it. The production `buildStylePrompt` is unchanged. Guests do not see the select. The `/super/ai` benchmark form does not have it; that path still gets the keep-texture sentence because it uses `buildReferencePrompt`.

Each style has `referenceTexture` in `src/data/styles.ts`. It describes the shipped JPEG, not what a client can wear. `beach-waves` and `soft-waves` are `wavy`. The other 57 styles are `straight`. None of the current files are curly. Names such as `soft-curls`, `curly-top-fade`, and `kids-curly-crop` are straight in the file.

`selectReferenceVariant` keeps Image 2 as the selected cut. If `public/styles/{id}-{asked}.jpg` exists it is sent instead of the straight JPEG. If it does not, and the shipped texture differs, the UI shows: the reference is that other texture, no variant is in the catalogue, and the prompt still keeps texture from Image 1. Keep natural does not warn.

Every current style lacks a curly reference. Proposed files, not generated:

- `public/styles/messy-texture-curly.jpg`
- `public/styles/curly-top-fade-curly.jpg`
- `public/styles/soft-curls-curly.jpg`
- `public/styles/kids-curly-crop-curly.jpg`
- `public/styles/pixie-curly.jpg`
- `public/styles/mid-fade-curly.jpg`
- `public/styles/textured-crop-curly.jpg`

The same `{id}-curly.jpg` name works for the other straight and wavy styles when a curly reference is added later.

## Raw result and model comparison

A super-admin test of Butterfly Layers on a real portrait (his wife) is the reason for this pass. The raw `gpt-image-1.5` frame looked like a photograph of her: the face stayed, the hairline was natural, the hair was layered waves, and the shirt stayed. The hair-only composite looked worse: jagged edges, white patches at the shoulders and neck, and a parting that sat on the head like a sticker. The face check labelled that raw frame as changed too much. That was a false positive. On his own earlier Messy Texture selfie the raw frame did redraw the face, so the check still has to be able to warn.

The public try-on at tjhbagalur.com was the visual reference for "a regenerated whole photo with an accurate face and a natural hairline", not a paste. This repository does not copy that site and does not claim its model.

The raw provider image is now the result and the download. It stays labelled experimental and unvalidated. `accepted` stays false because the frame has not been reviewed, not because of the face check. Hair-only composite is an optional fallback, off by default, shown smaller beside the raw image. Turning it on does not make a second provider call. A failed composite keeps the raw image.

The face check is a warning. The sentence is "Face may differ from your photo." The numeric score is included only when the viewer is a super-admin. The score is the mean distance of the eyes, brows, nose, and mouth after a similarity transform fitted to the eye centres, nose tip, and mouth centre, divided by the eye distance. It warns only when that residual is above `FACE_LANDMARK_LIMIT` (0.08). SSIM, ear-to-ear width, and the old brow and nose ratios are still stored. They do not set the warning. Hair, sofa, shirt, and a scale shift that the similarity explains were the likely cause of the false positive: ear landmarks move when hair covers them, and SSIM on the skin zone moves when the hair or the background moves. A synthetic same-face case with new hair pixels and moved ears is not warned. A synthetic case that moves the brows is warned. `face-check.png` draws the selfie landmarks in green and the aligned generated landmarks in red so the check can be reviewed by eye. Nothing in that check rejects the HTTP response.

Comparison is explicit and never automatic. On the salon page, a super-admin in reference mode picks one model, reads that model's estimate, confirms, and runs one call. Another model is another estimate and another confirmation. There is no retry and no silent substitution. The request fingerprint includes the model id, so a `gpt-image-1.5` result is not replayed as `gpt-image-2`.

The catalogue is an exact-id table in `src/lib/ai/compare-models.ts`. A prefix such as `gpt-image` or `gemini`, and a different id such as `gpt-image-2.5` or `gemini-3.1-flash-lite-image`, is refused before any call.

| Model | What is sent | Portrait medium estimate |
|---|---|---|
| `gpt-image-1.5` | OpenAI edits, `input_fidelity=high`, selfie then the style reference, no mask | about ₹17.00 ($0.164), size `1024x1536` |
| `gpt-image-2` | Same edit, `input_fidelity` omitted. The prompting guide says image inputs are always high fidelity. If the key rejects the id, the run returns `UNKNOWN_MODEL` and does not call another model. | about ₹16.60 ($0.160), size `1024x1536` |
| `gemini-3.1-flash-image` | One `generateContent` with the sanitized selfie, then the style reference, then the same reference prompt. No mask, no square pad, no OpenAI fallback. Refused before the call when no Gemini key is configured. | about ₹7.20 ($0.069), size `1K` |

A wide selfie uses `1536x1024` instead: about ₹16.90 for `gpt-image-1.5` and ₹16.50 for `gpt-image-2`. A square selfie uses `1024x1024`: about ₹11.90 and ₹11.70. Gemini stays on the 1K token allowance either way. These are buffered estimates at FX 96 with the 8% margin, not invoices. OpenAI image-input tokens are scaled from the first 1536×1024 run with a 15% margin. `gpt-image-2` output tokens use the pre-2 guide table as an allowance, priced at $30 per million image-output tokens, $8 per million image-input tokens, and $5 per million text-input tokens. The published per-image output price for medium portrait is $0.041 for `gpt-image-2` and $0.05 for `gpt-image-1.5`, before input tokens. The quote is the higher token allowance so a run over the ₹30 cap is refused before the call. Quality stays medium. High quality on a portrait `gpt-image-2` canvas can exceed that cap and is refused without a call. Gemini uses 1,120 tokens per input image and 1,120 tokens for a 1K output at the `gemini-3.1-flash-image` rates ($0.50 per million input, $60 per million image output).

Each result stays on the page. A second model appears beside the first with that model's usage, latency, and actual cost. The actual cost is shown only to the super-admin.

## Shutdown dates and fal comparison

Fetched 4 Oct 2026 from the live pages. Anything not on those pages is marked unverified.

Official deprecations, https://developers.openai.com/api/docs/deprecations :

| Model | Shutdown | Replacement named on that page |
|---|---|---|
| `gpt-image-1.5` | 1 Dec 2026 | `gpt-image-2.5-sunburst` or `gpt-image-2.5-flare` |
| `gpt-image-1-mini` | 1 Dec 2026 | `gpt-image-2.5-sunburst` or `gpt-image-2.5-flare` |
| `chatgpt-image-latest` | 1 Dec 2026 | `gpt-image-2.5-sunburst` or `gpt-image-2.5-flare` |
| `gpt-image-1` | 23 Oct 2026 | `gpt-image-2.5-sunburst` or `gpt-image-2.5-flare` |

This app does not send `chatgpt-image-latest`. Guest Test and Medium still send `gpt-image-1-mini`. Guest High still sends `gpt-image-1`. `/super/ai` shows those shutdown dates next to the tiers. The tier request, quality, size, and rupee estimate were not changed.

`gpt-image-2` is still a documented edit model (`v1/images/edits`). The prompting guide says to omit `input_fidelity` for it. Third-party posts that name only `gpt-image-2` are older than the deprecations page, which names the 2.5 models as the replacement.

Both 2.5 model pages list Image edit and the same token rates as GPT Image 2 (text input $5/1M, image input $8/1M, image output $30/1M). Snapshots: `gpt-image-2.5-sunburst-2026-09-08` and `gpt-image-2.5-flare-2026-09-08`. Neither id is on the shutdown table. The image generation guide says to select `gpt-image-2.5-sunburst` for precise editing, so that id is the comparison default. `gpt-image-2.5-flare` is also in the dropdown. Quality on those pages includes `xhigh` and `max`. This comparison keeps `medium` so the ₹30 cap still applies. The 2.5 pages do not publish a per-image output dollar cell. The quote uses the token rates and the existing output-token allowance. That allowance is not a published 2.5 token count.

`input_fidelity`: the GPT Image 2 parameter table says omit it. The GPT Image 2.5 parameter table lists `model`, `quality`, `size`, and `background`. It does not list `input_fidelity`, so this comparison omits the field. The guide does not contain a separate sentence that says the 2.5 API rejects the field. That rejection was not tested, because no paid call was made.

### Production migration plan

Do not switch a guest tier in this change.

1. Leave Test and Medium on `gpt-image-1-mini` and High on `gpt-image-1` until one reviewed change updates the model id and the list price together.
2. High shuts down first, on 23 Oct 2026. Mini shuts down on 1 Dec 2026.
3. Use the comparison dropdown to look at `gpt-image-2.5-sunburst` (precise editing) and `gpt-image-2.5-flare` (faster) at quality medium before any guest tier moves.
4. A later change can point `OPENAI_IMAGE_MODEL_HIGH` and `OPENAI_IMAGE_MODEL_TEST` / `OPENAI_IMAGE_MODEL_MEDIUM` at a 2.5 id only after the ₹ estimate for that tier is recalculated. Pointing High at sunburst while the estimate still uses the `gpt-image-1` high cell would understate the bill.

### fal queue

Every fal comparison is `POST https://queue.fal.run/<endpoint-id>` with `Authorization: Key …` and `X-Fal-No-Retry: 1`. fal otherwise retries a failed queue request up to 10 times. The client submits once, polls `…/requests/{id}/status`, then `GET …/requests/{id}`. Output is `images[].url`. A timeout after submit is an unknown bill and is not sent again. `image_urls` is the selfie, then the hairstyle reference. The same reference prompt is used. No mask. Images are uploaded with `POST https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3`, then `PUT` to the returned `upload_url`. The initiate request sets `expiration_duration_seconds` to 3600. The payloads delete API does not delete input CDN files, so there is no delete call. A dedicated input-file delete endpoint was not verified.

`enable_safety_checker` is sent `true` where the schema has that field. nano-banana has `safety_tolerance` instead, so the field is omitted and the default stands. A black frame, or `has_nsfw_concepts` true, is an error: the safety checker blocked the image. That completed call counts as billed. It is not shown as a haircut and it is not retried.

`fal-ai/qwen-image-edit-plus` was verified ($0.03 per megapixel, `image_urls` required) and is not in the dropdown. The add list did not include it.

The flux-2-pro page did not state a maximum of 9 references. That maximum is unverified. Two images are sent.

Price range for a `1024x1536` output, FX 96, before the 8% buffer. The cap uses the higher end after the buffer. Input readings follow each page: flux-2 and klein 9b resize inputs to 1MP (low end treats the inputs as 1MP together, high end as 1MP each). Pro rounds each input up. Qwen 2511 and klein 4b do not say whether inputs are billed, so the high end is the larger of actual pixels or 1MP per input.

### Keys on /super/ai

OpenAI, Gemini, and fal each have their own encrypted slot. The guest provider dropdown chooses which of the OpenAI or Gemini keys guests use. Changing that dropdown does not erase the other key. A saved OpenAI key stays available for OpenAI comparisons. Enable high quality only unlocks the High tier. A greyed High row is that tier, not the key.

The fal box is separate. Save fal key stores it. Enable fal comparisons must be on or the comparison refuses before `beginPaidCall` and does not call OpenAI or Gemini. Remove fal key clears that slot. `FAL_KEY` in the environment is only a fallback when no fal key is saved. A saved key that is turned off does not use the environment value.

## How to run a controlled paid test locally

```bash
git pull
npm install
npm run db:push
npm run seed
npm run dev
```

1. Open http://localhost:3000/login and sign in as `super@helixstac.app` / `SuperAdmin#2026`.
2. Open http://localhost:3000/super/ai. The page lists which provider keys are saved. Paste an OpenAI key in **Provider key** with the provider set to OpenAI, then Save. Paste a fal key in the **fal key** box, tick **Enable fal comparisons**, then **Save fal key**. Do not put either key in git. A greyed High tier means high quality is off. It does not turn a saved OpenAI key off.
3. Optional, no charge: `npm run benchmark:quote`.
4. Open http://localhost:3000/s/demo-salon. On Hairstyle, turn on **Reference mode (test)**. Leave **Hair-only composite** off unless you want the smaller fallback. Set **Hair texture** to **Curly** when the selfie is curly and the catalogue JPEG is straight. **Comparison model** opens on `gpt-image-2.5-sunburst (recommended)`. `gpt-image-1.5` stays in the list and is labelled as shutting down on 1 Dec 2026. fal models are further down the same list. Those controls are absent until Reference mode is on, and they are absent for a guest. Upload or take a selfie, pick a style, read the texture warning if Image 2 does not match, read that model's estimate (fal shows a range; the rupee figure is the higher end plus the 8% buffer), tick **I understand this makes one paid call for this model and does not retry**, and press **Try this hairstyle**. To compare a second model, change **Comparison model**, read the new estimate, tick the box again, and press **Try this hairstyle** once more. That is a separate call.
5. The large image is the raw provider output. The download is that raw image. A hair-only composite, when the fallback was on, is the smaller image and is not the download. The raw image stays labelled unvalidated. A neckline shift shows a clothing warning. A face warning says the face may differ and, for the super-admin, shows the landmark score. Open **saved stages** and look at `face-check.png` (green selfie landmarks, red aligned generated landmarks). **Delete now** removes that run, or leave the files for 72 hours. Do not commit the photos. The face check and the optional composite need `pip install -r scripts/requirements-vision.txt`. A missing vision install still returns the raw image after a paid call when the composite box is off. With the composite box on, a missing install is refused before the paid call.
6. The benchmark form still works: on `/super/ai`, pick a hairstyle, choose a selfie, tick the confirmation, and press **Run benchmark**. Open the result link. The right image is `provider-response.png`, labelled UNVALIDATED. `validation.json` stays `accepted: false`.

`BENCHMARK_INPUT_SIZE=1024` in `.env`, then restart `npm run dev`, if you want a second run on a smaller canvas to compare cost. Leave it unset for the same 1536-class request as the first pixie run.

## Remaining limitations

- One paid pixie frame looked right in the hair and wrong in the neckline. The stronger clothing sentence and the `clothing_changed` warning are not yet confirmed on a second paid image.
- `input_fidelity=high` was accepted on that first call. A future key that rejects it still fails the run with no fallback.
- The quote is an estimate with a 15% image-token margin. The stored actual cost is the provider usage. They will differ.
- References are 512×512. Several men's cuts look alike, and several show stubble. Listed above as needing regeneration.
- No catalogue JPEG is curly. A curly selfie with **Keep natural** or **Curly** still receives a straight Image 2 unless `{id}-curly.jpg` is added. The prompt can ask for the selfie texture. It cannot force the model to ignore a straight reference, and the composite cannot curl hair the model drew straight.
- A new guest click uses a new request id and can bill again after a lost response.
- Spend reservations and dedupe share state only through the database. The in-process queue is single-process.
- Guest production still uses the square pad, the heuristic mask, and the face composite. This benchmark does not replace that path.
- The camera path mirrors a `user` facing track in the shutter. Whether the browser buffer is already mirrored was not re-checked in a browser for this change.
- Benchmark retention deletes 20 expired rows per POST. A large backlog needs more than one request to clear.
- `HAIR-TRYON-ARCHITECTURE-AUDIT.md` was left as the record of the previous code.
