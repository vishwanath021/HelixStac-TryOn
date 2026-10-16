/** A landmark is 0–1 across the camera frame. object-cover crops that frame to the element. */
export function coverPoint(
  nx: number,
  ny: number,
  video: { videoWidth: number; videoHeight: number; clientWidth: number; clientHeight: number },
  canvasWidth: number,
  canvasHeight: number,
) {
  const frameW = video.videoWidth || canvasWidth || 1;
  const frameH = video.videoHeight || canvasHeight || 1;
  const boxW = video.clientWidth || canvasWidth || 1;
  const boxH = video.clientHeight || canvasHeight || 1;
  const scale = Math.max(boxW / frameW, boxH / frameH);
  const drawnW = frameW * scale;
  const drawnH = frameH * scale;
  const cropX = (drawnW - boxW) / 2;
  const cropY = (drawnH - boxH) / 2;
  return {
    x: (nx * drawnW - cropX) * (canvasWidth / boxW),
    y: (ny * drawnH - cropY) * (canvasHeight / boxH),
  };
}

/** Below 3 GB the face model is more likely to stall the camera than help a choice. */
export function liveMakeupAllowed(deviceMemoryGb?: number) {
  if (typeof deviceMemoryGb === "number" && deviceMemoryGb > 0 && deviceMemoryGb < 3) return false;
  return true;
}
