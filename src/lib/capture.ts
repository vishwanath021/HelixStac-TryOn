export type CameraFacing = "user" | "environment";

/**
 * The on-screen video is CSS-mirrored for a front camera.
 * The stored JPEG is flipped again so the file matches the mirrored preview.
 * An upload is never flipped here.
 */
export function captureShouldMirror(facing: CameraFacing) {
  return facing === "user";
}

/**
 * Source rectangle for the portrait 3:4 frame. The preview uses object-cover,
 * so a landscape camera sensor is cropped to the portrait the user sees.
 */
export function visiblePortraitCrop(srcW: number, srcH: number) {
  const frame = 3 / 4;
  const width = Math.max(1, srcW);
  const height = Math.max(1, srcH);
  if (width / height > frame) {
    const sw = height * frame;
    return { sx: (width - sw) / 2, sy: 0, sw, sh: height };
  }
  const sh = width / frame;
  return { sx: 0, sy: (height - sh) / 2, sw: width, sh };
}

/** Stored originals. The compare slider uses this file, not a preview copy. */
export const ORIGINAL_JPEG_QUALITY = 0.92;

/**
 * Ask for 1080p and let a sharper webcam keep its own size.
 * `ideal` is a preference, so a 720p camera still opens.
 */
export function cameraVideoConstraints(facing: CameraFacing): MediaTrackConstraints {
  return {
    facingMode: facing === "user" ? "user" : { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
}

/** Pixel size of a capture. The crop is not scaled down. */
export function capturePixelSize(srcW: number, srcH: number) {
  const crop = visiblePortraitCrop(srcW, srcH);
  return {
    width: Math.max(2, Math.round(crop.sw)),
    height: Math.max(2, Math.round(crop.sh)),
  };
}

/** After the browser grants a stream, ask for the sensor's largest frame. */
export async function raiseToNativeResolution(track: MediaStreamTrack) {
  const caps = typeof track.getCapabilities === "function" ? track.getCapabilities() : undefined;
  const width = caps?.width?.max;
  const height = caps?.height?.max;
  if (!width || !height || (width < 1920 && height < 1080)) return;
  try {
    await track.applyConstraints({
      width: { ideal: width },
      height: { ideal: height },
    });
  } catch {
    // The ideal 1920×1080 request already ran inside getUserMedia.
  }
}

export async function portraitJpeg(video: HTMLVideoElement, facing: CameraFacing) {
  const srcW = video.videoWidth || 720;
  const srcH = video.videoHeight || 960;
  const crop = visiblePortraitCrop(srcW, srcH);
  const { width, height } = capturePixelSize(srcW, srcH);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (captureShouldMirror(facing)) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", ORIGINAL_JPEG_QUALITY));
}

const UPLOAD_BYTES = 1_700_000;

/**
 * The request body stays under the API limit. The blob returned for the
 * before image is the caller's original and is never replaced here.
 */
export async function blobForUpload(blob: Blob): Promise<Blob> {
  if (blob.size <= UPLOAD_BYTES) return blob;
  const bitmap = await createImageBitmap(blob);
  let edge = 1600;
  let quality = 0.86;
  let out: Blob | null = null;
  try {
    while (edge >= 640) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(2, Math.round(bitmap.width * scale));
      canvas.height = Math.max(2, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (out && out.size <= UPLOAD_BYTES) return out;
      edge = Math.round(edge * 0.75);
      quality = 0.8;
    }
  } finally {
    bitmap.close();
  }
  return out ?? blob;
}
