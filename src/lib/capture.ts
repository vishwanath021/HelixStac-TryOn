export type CameraFacing = "user" | "environment";

/**
 * The on-screen video is CSS-mirrored for a front camera.
 * The stored JPEG is flipped again so the file matches the mirrored preview.
 * An upload is never flipped here.
 */
export function captureShouldMirror(facing: CameraFacing) {
  return facing === "user";
}
