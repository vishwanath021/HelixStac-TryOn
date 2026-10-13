import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as cronQueue } from "@/app/api/cron/queue/route";
import { POST as joinRoute } from "@/app/api/v1/queue/route";
import { QueueJoinForm } from "@/components/guest/QueueJoinForm";
import { notifyGuest, sendWhatsApp, type NotifyMessage } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { kolkataDayKey } from "@/lib/queue/day";
import { peopleAhead, waitMinutes } from "@/lib/queue/estimate";
import { displayedWait } from "@/lib/queue/wait-display";
import { indianMobile } from "@/lib/queue/phone";
import { QueueError, addWalkIn, callNext, confirmRequest, finishEntry, joinQueue, purgeOldQueueEntries, saveQueueSettings, setQueueOpen, sweepAlerts } from "@/lib/queue/service";
import { resetRateLimits } from "@/lib/ratelimit";
import { loadSalons } from "@/lib/super/directory";

const send = vi.fn(async () => ({ ok: true as const, provider: "log" }));

async function salon(productQueue = true) {
  const slug = `queue-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tenant = await prisma.tenant.create({ data: { slug, name: "Queue salon", productQueue } });
  const service = await prisma.service.create({
    data: { tenantId: tenant.id, key: "cut", name: "Cut", priceInr: 400, durationMin: 15 },
  });
  await prisma.queueState.create({
    data: { tenantId: tenant.id, isOpen: true, units: 1, avgMinutes: 20, alertLeadMin: -1, mode: "LIVE", unitLabel: "chair" },
  });
  return { tenant, service, slug };
}

describe("queue maths and phone", () => {
  it("splits the minutes of people ahead across the open places", () => {
    expect(waitMinutes([15, 15, 15], 1)).toBe(45);
    expect(waitMinutes([15, 15, 15], 3)).toBe(15);
    expect(waitMinutes([20], 2)).toBe(10);
    const rows = [
      { id: "a", status: "IN_SERVICE", joinedAt: new Date(1), token: 1 },
      { id: "b", status: "WAITING", joinedAt: new Date(2), token: 2 },
      { id: "c", status: "WAITING", joinedAt: new Date(3), token: 3 },
    ];
    expect(peopleAhead(rows, "c").map((row) => row.id)).toEqual(["a", "b"]);
    expect(peopleAhead(rows, null)).toHaveLength(3);
  });

  it("counts the shown wait down once a minute and never below the server sample", () => {
    expect(displayedWait(16, 1_000, 1_000)).toBe(16);
    expect(displayedWait(16, 1_000, 1_000 + 59_999)).toBe(16);
    expect(displayedWait(16, 1_000, 1_000 + 60_000)).toBe(15);
    expect(displayedWait(16, 1_000, 1_000 + 16 * 60_000)).toBe(0);
    expect(displayedWait(16, 1_000, 1_000 + 40 * 60_000)).toBe(0);
    expect(displayedWait(0, 1_000, 1_000 + 60_000)).toBe(0);
  });

  it("accepts Indian mobiles and rejects everything else", () => {
    expect(indianMobile("9876543210")).toBe("919876543210");
    expect(indianMobile("+91 98765 43210")).toBe("919876543210");
    expect(indianMobile("09876543210")).toBe("919876543210");
    expect(indianMobile("1234567890")).toBe("");
    expect(indianMobile("5876543210")).toBe("");
    expect(indianMobile("98765")).toBe("");
  });
});

describe("queue joins", () => {
  afterEach(async () => {
    resetRateLimits();
    send.mockClear();
    await prisma.queueEntry.deleteMany({ where: { tenant: { slug: { startsWith: "queue-" } } } });
    await prisma.queueState.deleteMany({ where: { tenant: { slug: { startsWith: "queue-" } } } });
    await prisma.service.deleteMany({ where: { tenant: { slug: { startsWith: "queue-" } } } });
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: "queue-" } } });
  });

  it("gives daily tokens and a wait, and stays quiet until the wait is within the lead time", async () => {
    const { slug, service, tenant } = await salon();
    const first = await joinQueue({ slug, name: "Asha", phone: "9876500101", consent: true, ip: "join-a", serviceId: service.id, send });
    const second = await joinQueue({ slug, name: "Bea", phone: "9876500102", consent: true, ip: "join-b", send });
    expect(first.token).toBe(1);
    expect(first.ahead).toBe(0);
    expect(first.waitMin).toBe(0);
    expect(second.token).toBe(2);
    expect(second.ahead).toBe(1);
    expect(second.waitMin).toBe(15);
    expect(send.mock.calls.filter((call) => call[0].kind === "joined")).toHaveLength(0);
    expect(send.mock.calls.filter((call) => call[0].kind === "almost")).toHaveLength(0);
    const again = await joinQueue({ slug, name: "Asha", phone: "9876500101", consent: true, ip: "join-c", send });
    expect(again.ref).toBe(first.ref);
    const before = send.mock.calls.length;
    await sweepAlerts(tenant.id, send);
    expect(send.mock.calls.length).toBe(before);
    await callNext(tenant.id, send);
    expect(send.mock.calls.filter((call) => call[0].kind === "almost")).toHaveLength(0);
    const row = await prisma.queueEntry.findFirstOrThrow({ where: { cancelToken: first.ref } });
    expect(row.status).toBe("CALLED");
    expect(row.alertSentAt).toBeNull();
    await finishEntry(tenant.id, row.id, "DONE", send);
    await callNext(tenant.id, send);
    expect(send.mock.calls.filter((call) => call[0].kind === "almost")).toHaveLength(0);
  });

  it("sends an online guest one near-turn alert and does not send it again when they are called", async () => {
    const { slug, tenant } = await salon();
    await saveQueueSettings(tenant.id, { units: 1, avgMinutes: 20, alertLeadMin: 5, mode: "LIVE", unitLabel: "chair" });
    const ticket = await joinQueue({ slug, name: "Asha", phone: "9876500111", consent: true, ip: "near", send });
    expect(ticket.waitMin).toBe(0);
    expect(send.mock.calls.filter((call) => call[0].kind === "joined")).toHaveLength(0);
    expect(send.mock.calls.filter((call) => call[0].kind === "almost")).toHaveLength(1);
    await callNext(tenant.id, send);
    expect(send.mock.calls).toHaveLength(1);
    expect(send.mock.calls[0][0].kind).toBe("almost");
  });

  it("sends a walk-in with a phone only the join message", async () => {
    const { slug, tenant } = await salon();
    await saveQueueSettings(tenant.id, { units: 1, avgMinutes: 20, alertLeadMin: 5, mode: "LIVE", unitLabel: "chair" });
    send.mockClear();
    await addWalkIn(tenant.id, { name: "Phone", phone: "9876500112" }, send);
    expect(send.mock.calls).toHaveLength(1);
    expect(send.mock.calls[0][0].kind).toBe("joined");
    expect(send.mock.calls[0][0].to).toBe("919876500112");
    expect(send.mock.calls[0][0].parameters[0]).toBe("1");
    expect(send.mock.calls[0][0].parameters[1]).toContain(`/s/${slug}/q/`);
    await addWalkIn(tenant.id, { name: "Desk" }, send);
    expect(send.mock.calls).toHaveLength(1);
    await expect(addWalkIn(tenant.id, { name: "Bad", phone: "12345" }, send)).rejects.toMatchObject({ code: "PHONE" });
  });

  it("refuses a closed queue, a missing consent tick, a bad phone, and a salon without the product", async () => {
    const { slug, tenant } = await salon();
    await setQueueOpen(tenant.id, false);
    await expect(joinQueue({ slug, name: "Asha", phone: "9876500103", consent: true, ip: "closed", send })).rejects.toMatchObject({ code: "CLOSED" });
    await setQueueOpen(tenant.id, true);
    await expect(joinQueue({ slug, name: "Asha", phone: "9876500103", consent: false, ip: "consent", send })).rejects.toMatchObject({ code: "CONSENT" });
    await expect(joinQueue({ slug, name: "Asha", phone: "12345", consent: true, ip: "phone", send })).rejects.toMatchObject({ code: "PHONE" });
    const off = await salon(false);
    await expect(joinQueue({ slug: off.slug, name: "Asha", phone: "9876500104", consent: true, ip: "off", send })).rejects.toBeInstanceOf(QueueError);
    await expect(joinQueue({ slug: off.slug, name: "Asha", phone: "9876500104", consent: true, ip: "off", send })).rejects.toMatchObject({ status: 404 });
  });

  it("limits how often one network can join", async () => {
    const { slug } = await salon();
    for (let index = 0; index < 8; index += 1) {
      await joinQueue({ slug, name: `Guest ${index}`, phone: `98765002${String(index).padStart(2, "0")}`, consent: true, ip: "shared-net", send });
    }
    await expect(joinQueue({ slug, name: "Late", phone: "9876500299", consent: true, ip: "shared-net", send })).rejects.toMatchObject({ code: "RATE" });
  });

  it("confirms a requested visit and deletes old rows", async () => {
    const { slug, tenant } = await salon();
    await saveQueueSettings(tenant.id, { units: 2, avgMinutes: 45, alertLeadMin: 5, mode: "REQUEST", unitLabel: "room" });
    const ticket = await joinQueue({
      slug,
      name: "Meera",
      phone: "9876500301",
      consent: true,
      requestedDate: "2099-06-01",
      requestedSlot: "11:30",
      ip: "request",
      send,
    });
    expect(ticket.status).toBe("REQUESTED");
    const row = await prisma.queueEntry.findFirstOrThrow({ where: { cancelToken: ticket.ref } });
    await confirmRequest(tenant.id, row.id, { slot: "12:00" }, send);
    const saved = await prisma.queueEntry.findUniqueOrThrow({ where: { id: row.id } });
    expect(saved.status).toBe("CONFIRMED");
    expect(saved.requestedSlot).toBe("12:00");
    expect(send.mock.calls.filter((call) => call[0].kind === "joined")).toHaveLength(0);
    expect(send.mock.calls.filter((call) => call[0].kind === "confirmed")).toHaveLength(1);
    expect(send.mock.calls.some((call) => call[0].kind === "almost")).toBe(false);
    await prisma.queueEntry.create({
      data: {
        tenantId: tenant.id,
        dayKey: "2000-01-01",
        token: 9,
        status: "DONE",
        source: "WALKIN",
        cancelToken: `old-${tenant.id}`,
        joinedAt: new Date("2000-01-01T00:00:00.000Z"),
      },
    });
    await purgeOldQueueEntries();
    expect(await prisma.queueEntry.findFirst({ where: { cancelToken: `old-${tenant.id}` } })).toBeNull();
    expect(await prisma.queueEntry.findUnique({ where: { id: row.id } })).toBeTruthy();
  });

  it("counts today's queue on the super-admin salon list", async () => {
    const { tenant } = await salon();
    await prisma.queueEntry.create({
      data: {
        tenantId: tenant.id,
        dayKey: kolkataDayKey(),
        token: 1,
        name: "Today",
        phone: "919876500401",
        status: "WAITING",
        source: "WALKIN",
        cancelToken: `today-${tenant.id}`,
      },
    });
    const rows = await loadSalons();
    expect(rows.find((row) => row.id === tenant.id)?.queueToday).toBe(1);
  });

  it("shows the consent line on the join form and rejects a join without it", async () => {
    const html = renderToStaticMarkup(createElement(QueueJoinForm, {
      initial: {
        name: "Queue salon",
        slug: "queue-render",
        open: true,
        mode: "LIVE",
        waitMin: 15,
        ahead: 3,
        tryOn: true,
        lang: "en",
        services: [],
      },
    }));
    expect(html).toContain("I agree to receive queue updates on this phone.");
    expect(html).toContain("15 min");
    expect(html).toContain("EST WAIT");
    expect(html).toContain("3 ahead");
    expect(html).toContain("Join the queue");
    expect(html).toContain("Try a look while you wait");
    const { slug } = await salon();
    const res = await joinRoute(new Request("http://localhost/api/v1/queue", {
      method: "POST",
      body: JSON.stringify({ slug, name: "Asha", phone: "9876500501", consent: false }),
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("CONSENT");
  });
});

describe("queue notify", () => {
  it("sends a WhatsApp template, and logs when WhatsApp is missing or the send fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const message: NotifyMessage = { to: "919876543210", kind: "almost", body: "come in", parameters: ["Salon", "4", "0", "https://example.test/s/a/q/ref"] };
    const sent = await sendWhatsApp(message, {
      WHATSAPP_TOKEN: "wa-token",
      WHATSAPP_PHONE_ID: "phone-1",
      WHATSAPP_TEMPLATE_ALERT: "queue_alert",
    }, fetchImpl as unknown as typeof fetch);
    expect(sent).toEqual({ ok: true, provider: "whatsapp" });
    const payload = JSON.parse(String((fetchImpl.mock.calls[0] as unknown[])[1] && (fetchImpl.mock.calls[0][1] as { body: string }).body));
    expect(payload.template.name).toBe("queue_alert");
    expect(payload.to).toBe("919876543210");
    expect(payload.messaging_product).toBe("whatsapp");
    const missing = await sendWhatsApp(message, { WHATSAPP_TOKEN: "wa-token", WHATSAPP_PHONE_ID: "phone-1" }, fetchImpl as unknown as typeof fetch);
    expect(missing.error).toBe("TEMPLATE");

    const failedFetch = vi.fn(async () => new Response("no", { status: 500 }));
    const failed = await notifyGuest(
      { ...message, kind: "joined", parameters: ["4", "https://example.test/s/a/q/ref"] },
      { WHATSAPP_TOKEN: "wa-token", WHATSAPP_PHONE_ID: "phone-1", WHATSAPP_TEMPLATE_JOIN: "queue_join" },
      failedFetch as unknown as typeof fetch,
    );
    expect(failed).toEqual({ ok: false, provider: "log", error: "HTTP_500" });
    expect(failedFetch).toHaveBeenCalledTimes(1);
    expect(String(failedFetch.mock.calls[0][0])).toContain("graph.facebook.com");

    const logged = await notifyGuest(message, {});
    expect(logged.provider).toBe("log");
  });

  it("protects the queue cron the same way as retention", async () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "cron-secret-16chars";
    try {
      const denied = await cronQueue(new Request("http://localhost/api/cron/queue", { method: "POST" }));
      expect(denied.status).toBe(403);
      const allowed = await cronQueue(new Request("http://localhost/api/cron/queue", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret-16chars" },
      }));
      expect(allowed.status).toBe(200);
      const body = await allowed.json();
      expect(body.ok).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  });
});
