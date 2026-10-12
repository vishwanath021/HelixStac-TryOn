/** Close-up card photos at /brows/cards/<id>.webp.
 *  `npm run brows:cards` fills this list. An id missing here keeps the line diagram.
 */
export const BROW_CARD_PHOTO_IDS: readonly string[] = [
  "soft-arch",
  "high-arch",
  "straight-brow",
  "rounded",
  "s-shape",
  "feathered",
  "bold-natural",
  "angled",
  "flat-thick",
  "natural-groomed",
  "thin-defined",
  "tapered",
  "cleanup",
];

/** Card-photo notes only. Guest generation uses the catalogue prompt.
 *  Each line exaggerates the feature that should still read at thumbnail size.
 */
export const BROW_CARD_CUES: Record<string, string> = {
  "soft-arch": "A clearly low gentle arch: the peak rises only a little, just past the iris, and the tail drifts softly down. Medium thickness. No sharp corner and no high peak.",
  "high-arch": "A dramatically high peak above the outer iris, much taller than a soft arch, then a steep tail dropping away. The height must be obvious in a small crop.",
  "straight-brow": "A completely flat brow with no rise at all. The top edge is level and the short tail stays level with the head.",
  rounded: "A smooth rounded dome with no corner and no point. The tip is round, like a shallow upside-down U.",
  "s-shape": "An obvious S: the inner head dips down, the middle lifts, and the tail flicks upward. Medium thickness, not a thin pencil line. Not a high arch, and the tail does not end in a downward point.",
  feathered: "Separate visible hair strokes brushed through the brow, not a solid pencil line. The tail fades into individual hairs.",
  "bold-natural": "A visibly full dense brow with only a modest low arch. The tail stays wide. It should look much thicker than a soft arch.",
  angled: "Two straight edges meeting in a hard sharp corner above the outer iris, then a straight tail dropping away from that corner. The corner is sharp, not a curve.",
  "flat-thick": "A heavy flat bar with no arch at all, much thicker than the other brows, ending in a squared tail at the same height as the inner head.",
  "natural-groomed": "A short tidy brow that stops at the outer corner of the eye. Only a slight rise. No long tail past the eye.",
  "thin-defined": "A very thin precise high peak and a long fine tail that descends past the outer eye. One peak, then a downward point. Not an S, and the tail does not flick up.",
  tapered: "Clearly full at the inner head and steadily narrowing to a sharp point at the tail. The change from thick to thin is the feature.",
  cleanup: "A natural medium brow with a freshly tidied outline. Remove only stray hairs. Do not invent a new arch, peak, or tail.",
};

export function browCardPhoto(id: string) {
  if (!BROW_CARD_PHOTO_IDS.includes(id)) return null;
  return `/brows/cards/${id}.webp`;
}
