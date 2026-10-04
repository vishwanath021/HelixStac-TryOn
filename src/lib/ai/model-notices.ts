/**
 * Shutdown dates from https://developers.openai.com/api/docs/deprecations fetched 4 Oct 2026.
 * These notices do not change the request or the price.
 */
export function productionModelNotice(model: string) {
  if (model === "gpt-image-1-mini") {
    return "Shuts down 1 Dec 2026. This tier still sends gpt-image-1-mini. The price and the request are unchanged.";
  }
  if (model === "gpt-image-1") {
    return "Shuts down 23 Oct 2026. This tier still sends gpt-image-1. The price and the request are unchanged.";
  }
  if (model === "gpt-image-1.5") {
    return "Shuts down 1 Dec 2026. The deprecations page names gpt-image-2.5-sunburst or gpt-image-2.5-flare as the replacement. Selecting this still sends gpt-image-1.5.";
  }
  return "";
}
