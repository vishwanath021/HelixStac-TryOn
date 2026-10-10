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
