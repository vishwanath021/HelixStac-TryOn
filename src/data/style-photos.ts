/** These files are flat icons, not guest photos. The style tab must not show them. */
export const ICON_ONLY_STYLES = new Set([
  "bridal-bun",
  "braided-updo",
  "side-swept-curls",
  "half-up-flowers",
  "jasmine-bridal-braid",
]);

export function styleHasPhoto(id: string) {
  return !ICON_ONLY_STYLES.has(id);
}
