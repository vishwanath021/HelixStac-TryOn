/** Sunburst at quality medium is about 18 seconds. The bar is time-based, and it stops at 92% until the photo arrives. */
export const GENERATION_EXPECTED_MS = 18_000;

export function generationStages(tool: string) {
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
