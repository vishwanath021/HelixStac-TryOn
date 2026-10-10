import { numberEnv } from "@/lib/env";
import { rateLimit } from "@/lib/ratelimit";

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

/** Guest and owner tools. Unset or blank means every tool. `hairstyle` hides the rest. */
export function enabledTools(raw: string | undefined = process.env.ENABLED_TOOLS): Set<ToolId> {
  const text = (raw ?? "").trim().toLowerCase();
  if (!text || text === "all" || text === "*") return new Set(TOOL_IDS);
  if (text === "hairstyle" || text === "style") return new Set(["hairstyle"]);
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

export type PreviewTool = "style" | "brows" | "beard" | "nails";

export function previewToolLabel(tool: PreviewTool) {
  if (tool === "brows") return "brow";
  if (tool === "nails") return "nail";
  if (tool === "beard") return "beard";
  return "hairstyle";
}

/** The connection limit names the tool that was actually generated. Colour is not a generate. */
export function previewRateMessage(tool: PreviewTool) {
  return `Too many ${previewToolLabel(tool)} previews from this connection.`;
}

/**
 * Count one generate for this tool. Selection, a rejected photo, and a replay do not call this.
 * Guest and staff buckets are separate, and each tool has its own hour, day, and minute bucket.
 */
export function consumePreviewRate(input: { tool: PreviewTool; staff: boolean; bucket: string; tenantId: string; now?: number }) {
  const limits = previewRateLimits(input.staff);
  const hour = rateLimit(`gen:${input.tool}:h:${input.bucket}`, limits.hour, 60 * 60 * 1000, input.now);
  if (!hour.ok) return { ok: false as const, message: previewRateMessage(input.tool) };
  const day = rateLimit(`gen:${input.tool}:d:${input.bucket}`, limits.day, 24 * 60 * 60 * 1000, input.now);
  if (!day.ok) return { ok: false as const, message: previewRateMessage(input.tool) };
  const minuteKey = input.staff ? `gen:${input.tool}:m:${input.bucket}` : `gen:${input.tool}:m:${input.tenantId}`;
  const minute = rateLimit(minuteKey, limits.minute, 60 * 1000, input.now);
  if (!minute.ok) return { ok: false as const, message: previewRateMessage(input.tool) };
  return { ok: true as const };
}

/** Salon-wide limit copy. The live-colour sentence stays only while that tool is enabled. */
export function guestLimitMessage(kind: "rate" | "daily" | "member" | "anon" | "credits", raw?: string) {
  const colour = toolEnabled("colour", raw);
  if (kind === "rate") return "Too many previews from this connection.";
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
