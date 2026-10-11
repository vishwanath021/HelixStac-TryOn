/** Illustrated brow diagrams. One path is the viewer's right brow; the card mirrors it. */

export type BrowShape = {
  id: string;
  /** Right-brow geometry. Higher on the card is a smaller y. */
  d: string;
  stroke: number;
  fill: boolean;
  join?: "round" | "miter";
};

export const BROW_SHAPES: BrowShape[] = [
  { id: "soft-arch", d: "M 134 124 Q 172 100 208 126", stroke: 10, fill: false },
  { id: "high-arch", d: "M 136 138 Q 162 62 214 134", stroke: 8, fill: false },
  { id: "straight-brow", d: "M 128 116 L 214 118", stroke: 11, fill: false },
  { id: "rounded", d: "M 136 140 Q 174 78 208 140", stroke: 13, fill: false },
  { id: "feathered", d: "M 136 116 Q 174 94 210 118 M 142 128 Q 176 108 204 128 M 146 106 Q 172 82 202 106 M 152 138 Q 178 120 198 136", stroke: 4, fill: false },
  { id: "bold-natural", d: "M 126 128 Q 172 108 210 130", stroke: 18, fill: false },
  { id: "flat-thick", d: "M 122 118 L 218 118", stroke: 26, fill: false },
  { id: "natural-groomed", d: "M 144 124 Q 168 108 192 122", stroke: 12, fill: false },
  { id: "thin-defined", d: "M 138 132 Q 166 66 216 128", stroke: 3, fill: false },
  { id: "tapered", d: "M 126 102 L 168 114 L 216 122 L 168 134 L 126 130 Z", stroke: 0, fill: true },
  { id: "cleanup", d: "M 150 114 Q 174 102 196 114", stroke: 7, fill: false },
];

export function browShapeById(id: string) {
  return BROW_SHAPES.find((shape) => shape.id === id) ?? null;
}

export function browDiagramSvg(id: string) {
  const shape = browShapeById(id);
  if (!shape) return null;
  const paint = shape.fill
    ? `fill="#2C1810" stroke="none"`
    : `fill="none" stroke="#2C1810" stroke-width="${shape.stroke}" stroke-linecap="round" stroke-linejoin="${shape.join ?? "round"}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 240 240"><rect width="240" height="240" fill="#E6C3A4"/><path d="${shape.d}" ${paint}/><path d="${shape.d}" transform="translate(240 0) scale(-1 1)" ${paint}/></svg>`;
}
