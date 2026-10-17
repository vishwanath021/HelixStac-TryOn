import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { guestTicket, guestVisit, joinQueue, publicBoard, startEntry, callNext, finishEntry, deskSnapshot, saveQueueSettings } from "@/lib/queue/service";
import { resetRateLimits } from "@/lib/ratelimit";

const send = vi.fn(async () => ({ ok: true as const, provider: "log" }));

const SALONS = [
  { slug: "launch-parlour", name: "Meera Beauty Parlour", kind: "parlour" },
  { slug: "launch-family-a", name: "Rao Family Salon", kind: "family" },
  { slug: "launch-family-b", name: "North Star Family Salon", kind: "family" },
] as const;

async function resetSalons() {
  resetRateLimits();
  send.mockClear();
  const tenants = await prisma.tenant.findMany({ where: { slug: { startsWith: "launch-" } }, select: { id: true } });
  const ids = tenants.map((row) => row.id);
  if (!ids.length) return;
  await prisma.queueEntry.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.queueState.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.service.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
}

async function salon(slug: string, name: string) {
  const tenant = await prisma.tenant.create({
    data: { slug, name, productQueue: true, productTryOn: true, whatsapp: "919800011122" },
  });
  const service = await prisma.service.create({
    data: { tenantId: tenant.id, key: "cut", name: "Haircut", priceInr: 400, durationMin: 20 },
  });
  await prisma.queueState.create({
    data: { tenantId: tenant.id, isOpen: true, units: 1, avgMinutes: 20, alertLeadMin: 5, mode: "LIVE", unitLabel: "chair" },
  });
  return { tenant, service };
}

describe("Sunday queue across three salons", () => {
  afterEach(async () => {
    await resetSalons();
  });

  it("keeps tokens, tickets, and alerts inside each salon, including two joins at once", async () => {
    const created = [];
    for (const item of SALONS) created.push({ ...item, ...(await salon(item.slug, item.name)) });

    let phoneN = 0;
    const phone = () => `98${String(phoneN++).padStart(8, "0")}`;
    const tickets: { slug: string; token: number; ref: string; name: string; phone: string }[] = [];
    for (const row of created) {
      const pairPhones = [phone(), phone()];
      const pair = await Promise.all([
        joinQueue({ slug: row.slug, name: "Aarav", phone: pairPhones[0], consent: true, ip: `${row.slug}-a`, serviceId: row.service.id, send }),
        joinQueue({ slug: row.slug, name: "Diya", phone: pairPhones[1], consent: true, ip: `${row.slug}-b`, serviceId: row.service.id, send }),
      ]);
      expect(new Set(pair.map((ticket) => ticket.token)).size).toBe(2);
      expect(pair.map((ticket) => ticket.token).sort()).toEqual([1, 2]);
      for (const ticket of pair) tickets.push({ slug: row.slug, token: ticket.token, ref: ticket.ref, name: ticket.name, phone: ticket.name === "Aarav" ? pairPhones[0] : pairPhones[1] });

      const names = ["Kabir", "Meera", "Anaya", "Vivaan", "Sara", "Ishaan", "Myra"];
      for (let index = 0; index < names.length; index += 1) {
        const mobile = phone();
        const ticket = await joinQueue({
          slug: row.slug,
          name: names[index],
          phone: mobile,
          consent: true,
          ip: `${row.slug}-${index}`,
          serviceId: row.service.id,
          send,
        });
        expect(ticket.token).toBe(index + 3);
        tickets.push({ slug: row.slug, token: ticket.token, ref: ticket.ref, name: names[index], phone: mobile });
      }
    }

    expect(tickets).toHaveLength(27);
    for (const row of created) {
      const mine = tickets.filter((ticket) => ticket.slug === row.slug).map((ticket) => ticket.token).sort((a, b) => a - b);
      expect(mine).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const board = await publicBoard(row.slug);
      expect(board.name).toBe(row.name);
      expect(board.ahead).toBe(9);
    }

    const first = tickets.find((ticket) => ticket.slug === "launch-parlour" && ticket.token === 1);
    expect(first).toBeTruthy();
    await expect(guestTicket("launch-family-a", first!.ref)).rejects.toMatchObject({ status: 404 });

    const cancelled = tickets.find((ticket) => ticket.slug === "launch-family-a" && ticket.token === 9);
    const closed = await guestVisit({ slug: "launch-family-a", ref: cancelled!.ref, action: "cancel", ip: "cancel" });
    expect(closed.status).toBe("CANCELLED");
    const rejoined = await joinQueue({
      slug: "launch-family-a",
      name: "Myra",
      phone: cancelled!.phone,
      consent: true,
      ip: "rejoin",
      serviceId: created[1].service.id,
      send,
    });
    expect(rejoined.token).toBe(10);
    expect(rejoined.ref).not.toBe(cancelled!.ref);

    const familyB = created[2];
    const desk = await deskSnapshot(familyB.tenant.id);
    expect(desk.waiting).toHaveLength(9);
    expect(desk.waiting.every((card) => card.name !== "Aarav" || desk.salon === familyB.name)).toBe(true);
    const called = await callNext(familyB.tenant.id, send);
    const seat = called.serving.find((item) => item.entry);
    expect(seat?.entry?.status).toBe("CALLED");
    const started = await startEntry(familyB.tenant.id, seat!.entry!.id);
    expect(started.serving.find((item) => item.entry)?.entry?.status).toBe("IN_SERVICE");
    const missed = started.waiting[0];
    await finishEntry(familyB.tenant.id, missed.id, "NO_SHOW", send);
    await finishEntry(familyB.tenant.id, seat!.entry!.id, "DONE", send);
    for (let step = 0; step < 40; step += 1) {
      const now = await deskSnapshot(familyB.tenant.id);
      const seat = now.serving.find((item) => item.entry)?.entry;
      if (seat?.status === "CALLED") {
        await startEntry(familyB.tenant.id, seat.id);
        continue;
      }
      if (seat) {
        await finishEntry(familyB.tenant.id, seat.id, "DONE", send);
        continue;
      }
      if (now.waiting.length === 0) break;
      await callNext(familyB.tenant.id, send);
    }
    const empty = await deskSnapshot(familyB.tenant.id);
    expect(empty.waiting).toHaveLength(0);
    expect(empty.serving.every((item) => !item.entry)).toBe(true);

    const almost = send.mock.calls.filter((call) => call[0].kind === "almost");
    expect(almost.length).toBeGreaterThan(0);
    expect(almost.every((call) => typeof call[0].to === "string" && call[0].to.startsWith("91"))).toBe(true);

    await saveQueueSettings(created[0].tenant.id, { units: 2, avgMinutes: 20, alertLeadMin: 5, mode: "LIVE", unitLabel: "station" });
    const parlour = await publicBoard("launch-parlour");
    expect(parlour.waitMin).toBeLessThan(20 * 9);
  });
});
