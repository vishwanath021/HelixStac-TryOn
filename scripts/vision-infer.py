#!/usr/bin/env python3
"""Hair mask, multiclass selfie mask, and face landmarks. No network.

Exit 2: a model file is missing.
Exit 3: detection is unreliable (no face, or the hair mask is empty or huge).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def fail(code: int, message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--models", required=True)
    parser.add_argument("--hair", required=True)
    parser.add_argument("--classes", required=True)
    parser.add_argument("--landmarks", required=True)
    args = parser.parse_args()

    models = Path(args.models)
    hair_model = models / "hair_segmenter.tflite"
    multi_model = models / "selfie_multiclass_256x256.tflite"
    face_model = models / "face_landmarker.task"
    for path in (hair_model, multi_model, face_model):
        if not path.is_file() or path.stat().st_size < 1000:
            fail(2, f"The vision model is missing or unusable: {path.name}. Hair-only composite did not run.")

    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    image = mp.Image.create_from_file(args.image)
    hair_segmenter = vision.ImageSegmenter.create_from_options(
        vision.ImageSegmenterOptions(
            base_options=python.BaseOptions(model_asset_path=str(hair_model)),
            output_category_mask=True,
        )
    )
    hair_result = hair_segmenter.segment(image)
    hair_segmenter.close()
    if hair_result.category_mask is None:
        fail(3, "The hair segmenter returned no mask. Hair-only composite did not run.")
    categories = hair_result.category_mask.numpy_view()
    hair = (categories == 1).astype(np.uint8) * 255
    fraction = float((hair > 0).mean())
    if fraction < 0.005 or fraction > 0.70:
        fail(3, f"The hair mask is unreliable (coverage {fraction:.3f}). Hair-only composite did not run.")

    multi = vision.ImageSegmenter.create_from_options(
        vision.ImageSegmenterOptions(
            base_options=python.BaseOptions(model_asset_path=str(multi_model)),
            output_category_mask=True,
        )
    )
    multi_result = multi.segment(image)
    multi.close()
    if multi_result.category_mask is None:
        fail(3, "The selfie segmenter returned no mask. Hair-only composite did not run.")
    classes = multi_result.category_mask.numpy_view()
    if classes.ndim == 3:
        classes = classes[:, :, 0]

    landmarker = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=str(face_model)),
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
    )
    faces = landmarker.detect(image)
    landmarker.close()
    if not faces.face_landmarks:
        fail(3, "No face landmarks. Hair-only composite did not run.")
    points = faces.face_landmarks[0]
    if len(points) < 478:
        fail(3, "Face landmarks were incomplete. Hair-only composite did not run.")

    Image.fromarray(hair, mode="L").save(args.hair)
    Image.fromarray(classes.astype(np.uint8), mode="L").save(args.classes)
    payload = {
        "width": image.width,
        "height": image.height,
        "hairFraction": fraction,
        "points": [[float(point.x * image.width), float(point.y * image.height)] for point in points[:478]],
    }
    Path(args.landmarks).write_text(json.dumps(payload), encoding="utf-8")


if __name__ == "__main__":
    main()
