# Reference-mode review

Date: 4 Oct 2026. Baseline before this work: `8a3a244` (`docs: record which image-edit parameters the hair path never sends`) on `cursor/feat-initial-build-5096`. The shareable diff against that commit is `docs/reference-mode.diff`.

`HAIR-TRYON-ARCHITECTURE-AUDIT.md` describes the code at that baseline. It is historical. This file describes the code after the reference-mode change. In particular, the audit's notes that a paid edit is attempted twice, and that a billed validation failure drops out of the spend cap, are no longer true.

This repository does not reproduce Jawed Habib's or tjhbagalur.com's private hairstyle backend. That model's identity is unknown. The public page was not copied.

## What this change is

Guest production is unchanged in shape: sanitize the selfie, place a heuristic hair mask, send one OpenAI image edit (or Gemini with no mask), then the existing face registration and composite. Guests still use the Test / Medium / High prices already on `/super/ai`. Those tier prices were not edited.

A separate super-admin path now sends a full-frame edit: the sanitized selfie first, the selected catalogue reference second, and a prompt that names those roles. It does not send a mask, does not paste the original face back, and does not call Gemini or a mock if OpenAI fails.

No paid generation was run for this change. Offline tests do not establish likeness, haircut match, or reconstruction quality.

## Exact request

`POST https://api.openai.com/v1/images/edits`

| Field | Benchmark default | Where it is set |
|---|---|---|
| model | `gpt-image-1.5` | `BENCHMARK_MODEL`. Unknown ids are refused. Nothing is substituted. |
| quality | `medium` | `BENCHMARK_QUALITY`. Must be `low`, `medium`, or `high`. |
| n | `1` | Fixed. |
| input_fidelity | `high` | Sent only when the capability table lists it for that exact model id. |
| output_format | `png` | Lossless inspection file. |
| size | `1024x1024`, `1536x1024`, or `1024x1536` | Chosen from the selfie aspect. Ratio above 1.15 is landscape. Ratio below 1/1.15 is portrait. Otherwise square. |
| image[0] | `selfie.png` | Sanitized selfie, uniform-scaled into the chosen size. Bars use the border mean. No stretch. |
| image[1] | `style-reference.jpg` | `public/styles/{id}@2x.jpg`, else `{id}-large.jpg`, else `{id}.jpg`. |
| mask | omitted | The prompt has no mask sentence on this path. |
| seed, strength, guidance, guidance_scale | omitted | `FORBIDDEN_EDIT_FIELDS`. |

Authorization is the platform OpenAI key from `/super/ai` when `platform_ai_provider` is `openai`, otherwise `OPENAI_API_KEY`. The key is not written to the repo, logs, or this review. A missing key returns `NO_OPENAI_KEY` and makes no call.

If the API rejects `gpt-image-1.5` or `input_fidelity`, the run returns that error (`UNKNOWN_MODEL` or `BENCHMARK`, HTTP 422) and stops. There is no second model.

One `fetch`, `AbortSignal.timeout(55_000)`, no OpenAI SDK. `@google/genai` 1.21.0 retries chunked file uploads only (`MAX_RETRY_COUNT = 3` inside `uploadBlob`). `generateContent` is a single request. The hair pipeline's `MAX_PROVIDER_ATTEMPTS` is 1. HTTP 429 and 5xx are recorded as an unknown bill and are not sent again, including where the image guide suggests retrying rate limits. A timeout, a dropped connection, a rejected output, and a lost client connection follow the same rule.

`quoteBenchmark` refuses the run before any HTTP call when the model is unknown, when that model cannot take `input_fidelity=high`, when the price cell is missing, or when the buffered output estimate exceeds `BENCHMARK_RUN_CAP_INR` (default 30). The global `AI_SPEND_CAP_INR` still applies inside `beginPaidCall`.

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

`gpt-image-1.5` is treated as a model prior to `gpt-image-2`, so the benchmark sends `input_fidelity=high`. That support was not confirmed with a live call. A rejection fails the run. `gpt-image-1-mini` and `gpt-image-2` have `inputFidelity: null` in `src/lib/ai/edit-request.ts` and the parameter is not posted. Capability checks use the exact model id. A substring of the id is not enough.

The Images API reference page timed out on fetch. Parameter names used here (`model`, `prompt`, `image[]`, `mask`, `quality`, `size`, `output_format`, `n`, `input_fidelity`) are the ones in the image guide's edit examples and the existing production client.

## Cost

These are published list prices, not invoices. `bufferedInr` is USD × `FX_INR_PER_USD` (default 96) × 1.08, rounded up to ₹0.1. `npm run benchmark:quote` printed, with no network call:

| Selfie | Size sent | Output list price | Buffered estimate | Run cap |
|---|---|---|---|---|
| 1024×1024 | 1024×1024 | $0.034 | ₹3.6 | ₹30 |
| 1280×720 | 1536×1024 | $0.05 | ₹5.2 | ₹30 |
| 720×1280 | 1024×1536 | $0.05 | ₹5.2 | ₹30 |

Input tokens are extra. Two images plus the prompt will add image-input and text-input charges that this estimate does not include. The ledger stores `costSource=usage` from `costUsdFromUsage` when the response includes token counts, at FX with no 1.08 buffer. Image-edit output tokens are priced at the image-output rate ($32 / 1M for `gpt-image-1.5`). The Images response does not split text output from image output, so that usage figure can sit above the legacy per-image table. The cap itself still reserves the buffered output estimate.

The benchmark tier is visible on `/super/ai` next to the cost ledger. It is not a guest tier. Guest Test stays `gpt-image-1-mini` low at about ₹0.60. Turning this mode on for guests would replace that with roughly ₹3.60–₹5.20 of output price per image before input tokens, plus the fidelity and reference-image input. It is not enabled for guests.

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

`npx vitest run tests/unit/reference-mode.test.ts tests/unit/tiers.test.ts tests/unit/masks.test.ts tests/unit/product.test.ts tests/unit/credits.test.ts` — 5 files, 63 tests passed. This run includes the length-category assertions and the dedupe status map.

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

Browser check against the production build on `127.0.0.1:3000`, with no provider call: an anonymous `GET /super/ai` returned 307, and an anonymous benchmark quote returned 403 `FORBIDDEN`. Signed in as the super-admin, the Reference benchmark section showed the style list, a disabled **Run benchmark** button, and after a synthetic 720×1280 JPEG the quote `gpt-image-1.5, quality medium, size 1024x1536, input_fidelity high, output png, n=1`, about ₹5.20. The confirmation checkbox enabled the button. The button was not clicked. `/super/ai/benchmark/does-not-exist` rendered the not-found page. Guest style-button disabling was not exercised in the browser; the lock and `disabled={busy}` are in `TryOnApp`.

## Implemented, and still visually unverified

Implemented and checked offline: the request builder, reference lookup, prompt roles, length sentences, spend statuses, dedupe, single attempt, demo accounting, super-admin quote and confirm UI, private stage files, and the production face-guard still rejecting the saved bad frame.

Not established: that `gpt-image-1.5` accepts `input_fidelity=high` on this key; that the output preserves identity, pose, framing, clothing, and lighting; that a long-to-short cut reconstructs neck, ears, or background; that the reference cut is actually transferred; that edges look natural; latency; token usage; or the rupee cost of an accepted result. The six-row sheet `docs/benchmark-score-sheet.csv` is empty on purpose.

## How to run one controlled paid test

1. Leave the key out of git. Sign in as the super-admin and set the platform provider to OpenAI on `/super/ai`, or export `OPENAI_API_KEY` only in the process environment.
2. `npm run benchmark:quote` prints the estimate and does not call the API.
3. On `/super/ai`, under Reference benchmark, choose one style and one local selfie. The page quotes model, quality, size, fidelity, png, and the rupee estimate. Tick “I understand this makes one paid OpenAI call and does not retry.” Press **Run benchmark**. The button stays disabled until a file, a quote, and the tick are present. The server also requires `confirm=yes`, the ₹30 run cap, and the global spend cap. It makes one call.
4. Open the link to `/super/ai/benchmark/{id}`. Read `provider-response.png` as the decoded provider body. Read `restored-output.png` only as the crop. `validation.json` stays `accepted: false`.
5. Score that single run in the CSV. Do not treat it as the six-run matrix. The matrix is three selfies you keep off git, two styles each, including at least one long-to-short (`pixie` or another short id) and one short-to-long (`long-layers`). Commands and the column list are in the README section “Reference benchmark”.

Suggested first pair, one call only: a portrait selfie and `pixie` (short, long-to-short sentence). Expect about ₹5.2 of output list price for a portrait, plus input tokens, under the ₹30 cap.

## Remaining limitations

- Visual quality is unverified. Mocks and unit tests do not measure a haircut.
- `input_fidelity=high` on `gpt-image-1.5` is inferred from the guide's `gpt-image-2` exception. A live rejection is fatal and has not been observed.
- Input-token cost is unknown until a usage payload exists. The confirmation number is the output estimate only.
- References are 512×512. Several men's cuts look alike, and several show stubble. Listed above as needing regeneration.
- A new guest click uses a new request id and can bill again after a lost response.
- Spend reservations and dedupe share state only through the database. The in-process queue is single-process.
- Guest production still uses the square pad, the heuristic mask, and the face composite. This benchmark does not replace that path.
- The camera path mirrors a `user` facing track in the shutter. Whether the browser buffer is already mirrored was not re-checked in a browser for this change.
- Benchmark retention deletes 20 expired rows per POST. A large backlog needs more than one request to clear.
- `HAIR-TRYON-ARCHITECTURE-AUDIT.md` was left as the record of the previous code.
