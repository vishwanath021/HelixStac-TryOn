import { createHash } from "node:crypto";

export const CONSENT_VERSION = "2026-10-03";

/** Plain-language notice. Hash is stored with the consent log. The photo is not. */
export const CONSENT_TEXT = [
  "Lookuvi processes a face photo only to show a hair colour or hairstyle preview.",
  "Live colour runs on the device and is not uploaded.",
  "A style preview is sent to the configured AI processor, handled in memory, and is not written to disk, database, or logs.",
  "There is no photo to delete. Booking leads can be deleted on request.",
  "Consent can be withdrawn. Withdrawal stops new previews and deletes leads linked to the browser session.",
  "You confirm you are 18 or older, or a parent or guardian is present. Children's styles require a parent or guardian.",
  "Previews are a guide. They are not a measurement and not a promise of the finished cut.",
].join(" ");

export const CONSENT_HASH = createHash("sha256").update(`${CONSENT_VERSION}\n${CONSENT_TEXT}`).digest("hex");
