# MediaPipe assets

These files are redistributed so the colour try-on does not call a third-party CDN at runtime.

| File | Source | Licence |
|---|---|---|
| `wasm/*` | npm package `@mediapipe/tasks-vision@0.10.21` | Apache License 2.0. Copyright Google LLC. |
| `hair_segmenter.tflite` | `https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite` | MediaPipe model, Apache License 2.0, as stated on the Google AI Edge image segmenter model card for the hair segmentation model (categories: 0 background, 1 hair). |

The Apache 2.0 text is at https://www.apache.org/licenses/LICENSE-2.0

Do not replace these files with a hotlink to jsDelivr or `storage.googleapis.com` in the browser. The page loads `/mediapipe/wasm` and `/mediapipe/hair_segmenter.tflite` from this app.
