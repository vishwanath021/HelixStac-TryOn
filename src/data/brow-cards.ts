/** Close-up card photos at /brows/cards/<id>.webp.
 *  `npm run brows:cards` fills this list. An id missing here keeps the line diagram.
 */
export const BROW_CARD_PHOTO_IDS: readonly string[] = [];

export function browCardPhoto(id: string) {
  if (!BROW_CARD_PHOTO_IDS.includes(id)) return null;
  return `/brows/cards/${id}.webp`;
}
