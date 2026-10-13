import { appBaseUrl } from "@/lib/env";
import type { NotifyMessage } from "@/lib/notify";

export function statusPath(slug: string, ref: string) {
  return `/s/${slug}/q/${ref}`;
}

export function statusUrl(slug: string, ref: string) {
  return `${appBaseUrl()}${statusPath(slug, ref)}`;
}

export function joinedMessage(input: { salon: string; token: number; link: string }): NotifyMessage {
  return {
    to: "",
    kind: "joined",
    body: `${input.salon}: token ${input.token}. ${input.link}`,
    parameters: [String(input.token), input.link],
  };
}

export function almostMessage(input: { salon: string; token: number; waitMin: number; link: string }): NotifyMessage {
  const body = input.waitMin <= 0
    ? `${input.salon}: token ${input.token}, please come in now. ${input.link}`
    : `${input.salon}: token ${input.token}, about ${input.waitMin} min left. ${input.link}`;
  return {
    to: "",
    kind: "almost",
    body,
    parameters: [input.salon, String(input.token), String(input.waitMin), input.link],
  };
}

export function confirmedMessage(input: { salon: string; date: string; slot: string; link: string }): NotifyMessage {
  return {
    to: "",
    kind: "confirmed",
    body: `${input.salon}: your visit is confirmed for ${input.date} at ${input.slot}. ${input.link}`,
    parameters: [input.salon, input.date, input.slot, input.link],
  };
}

export function deskWhatsAppText(salon: string, token: number, name: string) {
  const who = name.trim() || "there";
  return `Hi ${who}, this is ${salon}. Your token is ${token}.`;
}
