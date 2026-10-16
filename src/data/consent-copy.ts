export const CONSENT_VERSION = "2026-10-15";

/** The one line on the camera sheet. Details opens the privacy page. */
export const CONSENT_SHEET = "Your photo is used only to create your look and is deleted after.";

/** Plain-language notice. The hash is stored with the consent log. */
export const CONSENT_TEXT = [
  CONSENT_SHEET,
  "The salon is the data fiduciary for this preview. Lookuvi is the processor.",
  "Lookuvi uses a face photo only to show a hair, brow, beard, nail, or colour preview.",
  "Live colour runs on the device and is not uploaded.",
  "A style preview is sent to the salon's configured AI processor.",
  "Lookuvi keeps the generated preview for up to 24 hours so a repeated tap is not sent again, then deletes it.",
  "The preview is not a public gallery and is not used to train a model by Lookuvi.",
  "Consent records, usage events without photos, and booking leads are stored until you withdraw or the salon deletes them.",
  "You can ask for access, correction, or erasure, and you can withdraw consent. Withdrawal stops new previews and deletes leads linked to this browser session.",
  "A grievance contact is on the privacy page.",
  "You confirm you are 18 or older, or a parent or guardian is present. Children's styles require a parent or guardian.",
  "Previews are a guide. They are not a measurement and not a promise of the finished cut.",
].join(" ");
