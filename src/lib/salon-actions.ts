export type SalonAction = "book" | "queue" | "chat";

/** Bridal hides Join queue. Book and WhatsApp stay when the salon has a number. */
export function salonActionItems(args: { phone: boolean; showQueue: boolean; bridalOn: boolean }): SalonAction[] {
  const items: SalonAction[] = [];
  if (args.phone) items.push("book");
  if (args.showQueue && !args.bridalOn) items.push("queue");
  if (args.phone) items.push("chat");
  return items;
}
