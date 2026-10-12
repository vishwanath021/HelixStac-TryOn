# Vision models for the hair-only composite

These files are the official MediaPipe task assets used by the super-admin hair-only composite. They are not fetched at request time.

| File | Source URL | What it is |
|---|---|---|
| `hair_segmenter.tflite` | `https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite` | Image segmenter, 512 input, float32. Categories: 0 background, 1 hair. |
| `selfie_multiclass_256x256.tflite` | `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite` | Image segmenter, 256 input, float32. Categories: 0 background, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others. |
| `face_landmarker.task` | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` | Face landmarker, 478 landmarks. |

Fetched 4 Oct 2026 from the URLs listed on the Google AI Edge guides (image segmenter and face landmarker; those pages show a last update of 2026-10-01).

Licence notes, stated only for what was actually checked:

- The npm package `@mediapipe/tasks-vision@0.10.21` declares Apache License 2.0.
- The MediaPipe project licence is Apache License 2.0: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE
- `public/mediapipe/NOTICE.md` already records that the hair segmenter model card is Apache License 2.0.
- The three binaries were searched for an embedded "Apache" string (ASCII and UTF-16) and none was found. No separate licence file is packed inside them.

The Apache 2.0 text is at https://www.apache.org/licenses/LICENSE-2.0

The hair-only composite refuses to run when any of these files is missing. It does not fall back to a skin-colour blob.
