import { existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

export class VisionAssetError extends Error {
  readonly code = "VISION_ASSET";
}

export const VISION_ASSET_NAMES = {
  hair: "hair_segmenter.tflite",
  multiclass: "selfie_multiclass_256x256.tflite",
  face: "face_landmarker.task",
} as const;

export function visionAssetDir() {
  return process.env.VISION_ASSET_DIR || path.join(process.cwd(), "assets", "vision");
}

export function assertVisionFiles(dir = visionAssetDir()) {
  for (const name of Object.values(VISION_ASSET_NAMES)) {
    const file = path.join(dir, name);
    if (!existsSync(file) || statSync(file).size < 1000) {
      throw new VisionAssetError(`The vision model is missing or unusable: ${name}. Hair-only composite did not run.`);
    }
  }
  return dir;
}

export function visionPython() {
  return process.env.VISION_PYTHON || "python3";
}

let pythonReady: Promise<void> | null = null;

export function assertPythonMediapipe() {
  if (!pythonReady) {
    pythonReady = new Promise((resolve, reject) => {
      const child = spawn(visionPython(), ["-c", "from mediapipe.tasks.python.vision import FaceLandmarker, ImageSegmenter"], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", () => {
        pythonReady = null;
        reject(new VisionAssetError("Python is not available. Hair-only composite did not run."));
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else {
          pythonReady = null;
          reject(new VisionAssetError("Python mediapipe is not installed. Hair-only composite did not run."));
        }
      });
      void stderr;
    });
  }
  return pythonReady;
}

export async function assertVisionReady() {
  assertVisionFiles();
  await assertPythonMediapipe();
}
