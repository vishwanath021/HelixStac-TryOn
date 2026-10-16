import { createHash } from "node:crypto";
import { CONSENT_SHEET, CONSENT_TEXT, CONSENT_VERSION } from "@/data/consent-copy";

export { CONSENT_SHEET, CONSENT_TEXT, CONSENT_VERSION };

export const CONSENT_HASH = createHash("sha256").update(`${CONSENT_VERSION}\n${CONSENT_TEXT}`).digest("hex");
