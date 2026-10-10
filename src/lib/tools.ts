import { numberEnv } from "@/lib/env";

export const TOOL_IDS = ["hairstyle", "colour", "brows", "nails", "beard"] as const;
export type ToolId = (typeof TOOL_IDS)[number];

const ALIASES: Record<string, ToolId> = {
  hairstyle: "hairstyle",
  style: "hairstyle",
  hair: "hairstyle",
  colour: "colour",
  color: "colour",
  brows: "brows",
  brow: "brows",
  eyebrow: "brows",
  eyebrows: "brows",
  nails: "nails",
  nail: "nails",
  beard: "beard",
};

/** Guest and owner tools. Unset or blank means hairstyle only. `all` turns every tool on. */
export function enabledTools(raw: string | undefined = process.env.ENABLED_TOOLS): Set<ToolId> {
  const text = (raw ?? "hairstyle").trim().toLowerCase();
  if (!text || text === "hairstyle" || text === "style") return new Set(["hairstyle"]);
  if (text === "all" || text === "*") return new Set(TOOL_IDS);
  const set = new Set<ToolId>();
  for (const part of text.split(/[,+\s]+/)) {
    const id = ALIASES[part];
    if (id) set.add(id);
  }
  if (set.size === 0) set.add("hairstyle");
  return set;
}

export function toolEnabled(id: ToolId, raw?: string) {
  return enabledTools(raw).has(id);
}

export function maskToolFlags<T extends {
  toolStyle: boolean;
  toolColour: boolean;
  toolBrows: boolean;
  toolBeard: boolean;
  toolNails: boolean;
}>(flags: T, raw?: string): T {
  return {
    ...flags,
    toolStyle: flags.toolStyle && toolEnabled("hairstyle", raw),
    toolColour: flags.toolColour && toolEnabled("colour", raw),
    toolBrows: flags.toolBrows && toolEnabled("brows", raw),
    toolBeard: flags.toolBeard && toolEnabled("beard", raw),
    toolNails: flags.toolNails && toolEnabled("nails", raw),
  };
}

const COLOUR_NOTE = " Live colour is still free.";

/** Limit copy. The live-colour sentence stays only while that tool is enabled. */
export function guestLimitMessage(kind: "rate" | "daily" | "member" | "anon" | "credits", raw?: string) {
  const colour = toolEnabled("colour", raw);
  if (kind === "rate") {
    const base = "Too many previews from this connection.";
    return colour ? `${base}${COLOUR_NOTE}` : base;
  }
  if (kind === "daily") {
    const base = "This salon has reached today's preview limit.";
    return colour ? `${base}${COLOUR_NOTE}` : base;
  }
  if (kind === "member") {
    return colour
      ? "You've used today's previews on this account. Live colour is still free. Come back tomorrow, or ask the salon to try it with you."
      : "You've used today's previews on this account. Come back tomorrow, or ask the salon to try it with you.";
  }
  if (kind === "anon") {
    const base = "That's today's previews used up. Log in for a higher limit, or visit the salon.";
    return colour ? `${base}${COLOUR_NOTE}` : base;
  }
  return colour
    ? "This salon has used its preview credits. Live colour is still free. Message them on WhatsApp to book."
    : "This salon has used its preview credits. Message them on WhatsApp to book.";
}

/** Per-connection preview caps. Staff sessions use a separate, higher set so a demo is not stopped by guest traffic. */
export function previewRateLimits(staff: boolean) {
  if (staff) {
    return {
      hour: numberEnv("GENERATE_STAFF_PER_IP_HOUR", 240),
      day: numberEnv("GENERATE_STAFF_PER_IP_DAY", 1000),
      minute: numberEnv("GENERATE_STAFF_PER_MINUTE", 120),
    };
  }
  return {
    hour: numberEnv("GENERATE_PER_IP_HOUR", 6),
    day: numberEnv("GENERATE_PER_IP_DAY", 20),
    minute: numberEnv("GENERATE_PER_TENANT_MINUTE", 30),
  };
}
