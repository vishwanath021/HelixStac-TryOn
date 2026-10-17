/** Midpoint of the 47–94s generations we have seen. The bar is time-based, and it stops at 92% until the photo arrives. */
export const GENERATION_EXPECTED_MS = 70_000;

export function generationStages(tool: string) {
  if (tool === "bridal-own") {
    return ["Reading your photo", "Placing your items", "Applying the makeup", "Finishing the portrait"];
  }
  const read = tool === "mehendi" || tool === "nails" ? "Reading your hand" : "Reading your face shape";
  const apply =
    tool === "mehendi"
      ? "Applying mehendi"
      : tool === "colour"
        ? "Colouring your hair"
        : tool === "brows"
          ? "Shaping your brows"
          : tool === "nails"
            ? "Painting your nails"
            : tool === "beard"
              ? "Shaping your beard"
              : tool === "style"
                ? "Cutting the style"
                : "Applying the look";
  return [read, "Matching your skin tone", apply, "Adding final details"];
}

export function generationFrame(tool: string, elapsedMs: number, expectedMs = GENERATION_EXPECTED_MS) {
  const stages = generationStages(tool);
  const elapsed = Math.max(0, elapsedMs);
  const span = Math.max(1, expectedMs);
  const pct = Math.min(92, Math.round((elapsed / span) * 100));
  const index = Math.min(stages.length - 1, Math.floor((elapsed / span) * stages.length));
  return { pct, label: stages[index] ?? stages[0] };
}
