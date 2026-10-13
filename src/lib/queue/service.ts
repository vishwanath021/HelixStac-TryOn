import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sharedRateLimit } from "@/lib/ratelimit";
import { notifyGuest, type NotifyMessage, type NotifyResult } from "@/lib/notify";
import { kolkataDayKey } from "@/lib/queue/day";
import { peopleAhead, serviceMinutes, waitMinutes, type WaitRow } from "@/lib/queue/estimate";
import { almostMessage, confirmedMessage, deskWhatsAppText, joinedMessage, statusPath, statusUrl } from "@/lib/queue/messages";
import { indianMobile } from "@/lib/queue/phone";

export class QueueError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

type Sender = (message: NotifyMessage) => Promise<NotifyResult>;

const LIVE_ACTIVE = ["WAITING", "CALLED", "IN_SERVICE"];
const REQUEST_ACTIVE = ["REQUESTED", "CONFIRMED"];

type EntryRow = {
  id: string;
  tenantId: string;
  dayKey: string;
  token: number;
  name: string;
  phone: string;
  serviceId: string | null;
  status: string;
  source: string;
  unitSlot: number | null;
  joinedAt: Date;
  calledAt: Date | null;
  startedAt: Date | null;
  requestedDate: string;
  requestedSlot: string;
  alertSentAt: Date | null;
  cancelToken: string;
  onTheWay: boolean;
  service: { name: string; durationMin: number | null } | null;
};

function asWait(row: EntryRow): WaitRow {
  return { id: row.id, status: row.status, joinedAt: row.joinedAt, token: row.token };
}

export async function ensureQueueState(tenantId: string) {
  return prisma.queueState.upsert({
    where: { tenantId },
    create: { tenantId },
    update: {},
  });
}

async function loadDay(tenantId: string, dayKey: string) {
  const [state, entries] = await Promise.all([
    ensureQueueState(tenantId),
    prisma.queueEntry.findMany({
      where: { tenantId, dayKey },
      include: { service: { select: { name: true, durationMin: true } } },
      orderBy: { token: "asc" },
    }),
  ]);
  return { state, entries: entries as EntryRow[], dayKey };
}

function minutesOf(row: EntryRow, avgMinutes: number) {
  return serviceMinutes(row.service?.durationMin, avgMinutes);
}

function timing(entries: EntryRow[], selfId: string | null, avgMinutes: number, units: number) {
  const self = selfId ? entries.find((row) => row.id === selfId) : null;
  if (self && self.status !== "WAITING") return { ahead: 0, waitMin: 0 };
  const ahead = peopleAhead(entries.map(asWait), selfId);
  const byId = new Map(entries.map((row) => [row.id, row]));
  const minutes = ahead.map((row) => minutesOf(byId.get(row.id) || entries[0], avgMinutes));
  return { ahead: ahead.length, waitMin: waitMinutes(minutes, units) };
}

function ticket(slug: string, row: EntryRow, mode: string, waitMin: number, ahead: number) {
  return {
    ref: row.cancelToken,
    token: row.token,
    status: row.status,
    waitMin,
    ahead,
    name: row.name,
    onTheWay: row.onTheWay,
    mode,
    requestedDate: row.requestedDate,
    requestedSlot: row.requestedSlot,
    statusPath: statusPath(slug, row.cancelToken),
  };
}

async function safeSend(send: Sender, message: NotifyMessage) {
  try {
    return await send(message);
  } catch {
    return { ok: false, provider: "none", error: "NETWORK" };
  }
}

async function claimAndSend(row: EntryRow, message: NotifyMessage, send: Sender) {
  if (!row.phone) return false;
  const claimed = await prisma.queueEntry.updateMany({
    where: { id: row.id, alertSentAt: null },
    data: { alertSentAt: new Date() },
  });
  if (claimed.count !== 1) return false;
  const result = await safeSend(send, { ...message, to: row.phone });
  if (!result.ok) {
    await prisma.queueEntry.update({ where: { id: row.id }, data: { alertSentAt: null } });
    return false;
  }
  return true;
}

export async function sweepAlerts(tenantId: string, send: Sender = notifyGuest) {
  const dayKey = kolkataDayKey();
  const { state, entries } = await loadDay(tenantId, dayKey);
  if (!state.isOpen || state.mode !== "LIVE") return { sent: 0 };
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true, productQueue: true } });
  if (!tenant?.productQueue) return { sent: 0 };
  let sent = 0;
  for (const entry of entries) {
    if (entry.source !== "ONLINE" || entry.status !== "WAITING" || entry.alertSentAt || !entry.phone) continue;
    const wait = timing(entries, entry.id, state.avgMinutes, state.units);
    if (wait.waitMin > state.alertLeadMin) continue;
    const ok = await claimAndSend(entry, almostMessage({
      salon: tenant.name,
      token: entry.token,
      waitMin: wait.waitMin,
      link: statusUrl(tenant.slug, entry.cancelToken),
    }), send);
    if (ok) sent += 1;
  }
  return { sent };
}

export async function sweepAllQueues(send: Sender = notifyGuest) {
  const states = await prisma.queueState.findMany({ where: { isOpen: true, mode: "LIVE" }, select: { tenantId: true } });
  let sent = 0;
  for (const state of states) sent += (await sweepAlerts(state.tenantId, send)).sent;
  return { sent, salons: states.length };
}

async function requireQueueTenant(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant || !tenant.productQueue) throw new QueueError("PRODUCT", "The queue is not available for this salon.", 404);
  if (tenant.status === "SUSPENDED") throw new QueueError("SUSPENDED", "This salon is paused.", 403);
  return tenant;
}

export async function publicBoard(slug: string) {
  const tenant = await requireQueueTenant(slug);
  const dayKey = kolkataDayKey();
  const { state, entries } = await loadDay(tenant.id, dayKey);
  const services = await prisma.service.findMany({
    where: { tenantId: tenant.id, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, durationMin: true },
  });
  const live = state.mode === "LIVE";
  const wait = live ? timing(entries, null, state.avgMinutes, state.units) : { ahead: 0, waitMin: 0 };
  return {
    name: tenant.name,
    slug: tenant.slug,
    open: state.isOpen,
    mode: state.mode,
    unitLabel: state.unitLabel,
    waitMin: wait.waitMin,
    ahead: wait.ahead,
    tryOn: tenant.productTryOn,
    lang: tenant.defaultLang,
    services: services.map((service) => ({ id: service.id, name: service.name, minutes: serviceMinutes(service.durationMin, state.avgMinutes) })),
  };
}

async function findService(tenantId: string, serviceId: string | undefined) {
  if (!serviceId) return null;
  const service = await prisma.service.findFirst({ where: { id: serviceId, tenantId, active: true } });
  if (!service) throw new QueueError("INVALID", "Choose a service from the list.", 400);
  return service;
}

function checkSlot(date: string, slot: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new QueueError("INVALID", "Choose a date.", 400);
  if (!/^\d{2}:\d{2}$/.test(slot)) throw new QueueError("INVALID", "Choose a time.", 400);
  if (date < kolkataDayKey()) throw new QueueError("INVALID", "Choose today or a later date.", 400);
}

export async function joinQueue(input: {
  slug: string;
  name: string;
  phone: string;
  serviceId?: string;
  consent: boolean;
  requestedDate?: string;
  requestedSlot?: string;
  ip: string;
  send?: Sender;
}) {
  const send = input.send || notifyGuest;
  const tenant = await requireQueueTenant(input.slug);
  const phone = indianMobile(input.phone);
  if (!phone) throw new QueueError("PHONE", "Enter a 10-digit Indian mobile number.", 400);
  if (!input.consent) throw new QueueError("CONSENT", "Tick the box to receive queue updates on this phone.", 400);
  const name = input.name.trim().slice(0, 80);
  if (name.length < 1) throw new QueueError("INVALID", "Add your name.", 400);
  const state = await ensureQueueState(tenant.id);
  const requestedDate = (input.requestedDate || "").trim();
  const requestedSlot = (input.requestedSlot || "").trim();
  if (state.mode === "REQUEST") checkSlot(requestedDate, requestedSlot);
  else if (!state.isOpen) throw new QueueError("CLOSED", "The queue is paused. Please ask at the desk.", 403);

  const dayKey = state.mode === "REQUEST" ? requestedDate : kolkataDayKey();
  const active = state.mode === "REQUEST" ? REQUEST_ACTIVE : LIVE_ACTIVE;
  const existing = await prisma.queueEntry.findFirst({
    where: { tenantId: tenant.id, phone, status: { in: active }, ...(state.mode === "LIVE" ? { dayKey } : {}) },
    include: { service: { select: { name: true, durationMin: true } } },
    orderBy: { joinedAt: "desc" },
  });
  if (existing) {
    const loaded = await loadDay(tenant.id, existing.dayKey);
    const wait = timing(loaded.entries, existing.id, loaded.state.avgMinutes, loaded.state.units);
    return ticket(tenant.slug, existing as EntryRow, state.mode, wait.waitMin, wait.ahead);
  }

  const ipLimit = await sharedRateLimit(`queue:ip:${input.ip}`, 8, 10 * 60 * 1000);
  const phoneLimit = await sharedRateLimit(`queue:phone:${tenant.id}:${phone}`, 4, 60 * 60 * 1000);
  if (!ipLimit.ok || !phoneLimit.ok) throw new QueueError("RATE", "Too many joins. Wait a few minutes and try again.", 429);

  await findService(tenant.id, input.serviceId);
  const created = await prisma.$transaction(async (tx) => {
    const last = await tx.queueEntry.aggregate({ where: { tenantId: tenant.id, dayKey }, _max: { token: true } });
    return tx.queueEntry.create({
      data: {
        tenantId: tenant.id,
        dayKey,
        token: (last._max.token ?? 0) + 1,
        name,
        phone,
        serviceId: input.serviceId || null,
        status: state.mode === "REQUEST" ? "REQUESTED" : "WAITING",
        source: "ONLINE",
        requestedDate: state.mode === "REQUEST" ? requestedDate : "",
        requestedSlot: state.mode === "REQUEST" ? requestedSlot : "",
        cancelToken: randomBytes(18).toString("base64url"),
        consentAt: new Date(),
      },
      include: { service: { select: { name: true, durationMin: true } } },
    });
  });
  const loaded = await loadDay(tenant.id, dayKey);
  const row = loaded.entries.find((entry) => entry.id === created.id) || (created as EntryRow);
  const wait = timing(loaded.entries, row.id, loaded.state.avgMinutes, loaded.state.units);
  if (state.mode !== "REQUEST") await sweepAlerts(tenant.id, send);
  return ticket(tenant.slug, row, state.mode, wait.waitMin, wait.ahead);
}

export async function guestTicket(slug: string, ref: string) {
  const tenant = await requireQueueTenant(slug);
  const row = await prisma.queueEntry.findFirst({
    where: { cancelToken: ref, tenantId: tenant.id },
    include: { service: { select: { name: true, durationMin: true } } },
  });
  if (!row) throw new QueueError("NOT_FOUND", "That visit was not found.", 404);
  const state = await ensureQueueState(tenant.id);
  const loaded = await loadDay(tenant.id, row.dayKey);
  const wait = timing(loaded.entries, row.id, state.avgMinutes, state.units);
  return {
    ...ticket(tenant.slug, row as EntryRow, state.mode, wait.waitMin, wait.ahead),
    salon: tenant.name,
    tryOn: tenant.productTryOn,
    lang: tenant.defaultLang,
    serviceName: row.service?.name || "",
  };
}

export async function guestVisit(input: { slug: string; ref: string; action: "way" | "cancel"; ip: string }) {
  const limit = await sharedRateLimit(`queue:visit:${input.ip}`, 30, 10 * 60 * 1000);
  if (!limit.ok) throw new QueueError("RATE", "Too many taps. Wait a moment.", 429);
  const tenant = await requireQueueTenant(input.slug);
  const row = await prisma.queueEntry.findFirst({ where: { cancelToken: input.ref, tenantId: tenant.id } });
  if (!row) throw new QueueError("NOT_FOUND", "That visit was not found.", 404);
  if (input.action === "way") {
    if (row.status === "CANCELLED" || row.status === "DONE" || row.status === "NO_SHOW") {
      throw new QueueError("STATE", "This visit is already closed.", 409);
    }
    await prisma.queueEntry.update({ where: { id: row.id }, data: { onTheWay: true } });
  } else {
    if (row.status === "DONE" || row.status === "IN_SERVICE") throw new QueueError("STATE", "Ask the desk to close this visit.", 409);
    if (row.status !== "CANCELLED") {
      await prisma.queueEntry.update({ where: { id: row.id }, data: { status: "CANCELLED", doneAt: new Date(), unitSlot: null } });
    }
  }
  return guestTicket(input.slug, input.ref);
}

function deskCard(tenantName: string, row: EntryRow, avgMinutes: number, entries: EntryRow[], units: number) {
  const wait = timing(entries, row.id, avgMinutes, units);
  const text = deskWhatsAppText(tenantName, row.token, row.name);
  const phone = row.phone;
  return {
    id: row.id,
    token: row.token,
    name: row.name || "Walk-in",
    phone,
    serviceName: row.service?.name || "",
    status: row.status,
    source: row.source,
    unitSlot: row.unitSlot,
    waitMin: wait.waitMin,
    ahead: wait.ahead,
    onTheWay: row.onTheWay,
    requestedDate: row.requestedDate,
    requestedSlot: row.requestedSlot,
    whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : "",
    callUrl: phone ? `tel:+${phone}` : "",
  };
}

export async function deskSnapshot(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.productQueue) throw new QueueError("PRODUCT", "The queue is not available for this salon.", 404);
  const dayKey = kolkataDayKey();
  const { state, entries } = await loadDay(tenantId, dayKey);
  const requests = state.mode === "REQUEST"
    ? await prisma.queueEntry.findMany({
      where: { tenantId, status: { in: ["REQUESTED", "CONFIRMED"] }, requestedDate: { gte: dayKey } },
      include: { service: { select: { name: true, durationMin: true } } },
      orderBy: [{ requestedDate: "asc" }, { requestedSlot: "asc" }],
      take: 80,
    })
    : [];
  const services = await prisma.service.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const card = (row: EntryRow) => deskCard(tenant.name, row, state.avgMinutes, entries, state.units);
  const serving = Array.from({ length: state.units }, (_, index) => {
    const unit = index + 1;
    const entry = entries.find((row) => row.unitSlot === unit && (row.status === "CALLED" || row.status === "IN_SERVICE"));
    return { unit, entry: entry ? card(entry) : null };
  });
  return {
    salon: tenant.name,
    state: {
      isOpen: state.isOpen,
      units: state.units,
      unitLabel: state.unitLabel,
      avgMinutes: state.avgMinutes,
      alertLeadMin: state.alertLeadMin,
      mode: state.mode,
    },
    services,
    serving,
    waiting: entries.filter((row) => row.status === "WAITING").map(card),
    requests: (requests as EntryRow[]).filter((row) => row.status === "REQUESTED").map((row) => deskCard(tenant.name, row, state.avgMinutes, [], state.units)),
    confirmed: (requests as EntryRow[]).filter((row) => row.status === "CONFIRMED").map((row) => deskCard(tenant.name, row, state.avgMinutes, [], state.units)),
  };
}

async function requireDesk(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.productQueue) throw new QueueError("PRODUCT", "The queue is not available for this salon.", 404);
  return tenant;
}

function freeSlot(entries: EntryRow[], units: number) {
  const occupied = new Set(entries.filter((row) => (row.status === "CALLED" || row.status === "IN_SERVICE") && row.unitSlot).map((row) => row.unitSlot));
  for (let unit = 1; unit <= units; unit += 1) {
    if (!occupied.has(unit)) return unit;
  }
  return 0;
}

export async function callNext(tenantId: string, send: Sender = notifyGuest) {
  await requireDesk(tenantId);
  const dayKey = kolkataDayKey();
  const { state, entries } = await loadDay(tenantId, dayKey);
  if (state.mode !== "LIVE") throw new QueueError("STATE", "This salon takes time requests, not a live line.", 409);
  const slot = freeSlot(entries, state.units);
  if (!slot) throw new QueueError("BUSY", "Every place is busy. Mark one done first.", 409);
  const next = entries.find((row) => row.status === "WAITING");
  if (!next) throw new QueueError("EMPTY", "No one is waiting.", 409);
  await prisma.queueEntry.update({
    where: { id: next.id },
    data: { status: "CALLED", calledAt: new Date(), unitSlot: slot },
  });
  await sweepAlerts(tenantId, send);
  return deskSnapshot(tenantId);
}

export async function startEntry(tenantId: string, id: string) {
  await requireDesk(tenantId);
  const dayKey = kolkataDayKey();
  const { state, entries } = await loadDay(tenantId, dayKey);
  const row = entries.find((entry) => entry.id === id);
  if (!row || (row.status !== "WAITING" && row.status !== "CALLED")) throw new QueueError("STATE", "That guest is not waiting.", 409);
  const slot = row.status === "CALLED" && row.unitSlot ? row.unitSlot : freeSlot(entries, state.units);
  if (!slot) throw new QueueError("BUSY", "Every place is busy. Mark one done first.", 409);
  await prisma.queueEntry.update({
    where: { id },
    data: { status: "IN_SERVICE", startedAt: row.startedAt || new Date(), calledAt: row.calledAt || new Date(), unitSlot: slot },
  });
  return deskSnapshot(tenantId);
}

export async function finishEntry(tenantId: string, id: string, status: "DONE" | "NO_SHOW", send: Sender = notifyGuest) {
  await requireDesk(tenantId);
  const row = await prisma.queueEntry.findFirst({ where: { id, tenantId } });
  if (!row) throw new QueueError("NOT_FOUND", "That guest was not found.", 404);
  const allowed = status === "DONE" ? ["CALLED", "IN_SERVICE", "WAITING"] : ["WAITING", "CALLED", "IN_SERVICE"];
  if (!allowed.includes(row.status)) throw new QueueError("STATE", "That guest is already closed.", 409);
  await prisma.queueEntry.update({ where: { id }, data: { status, doneAt: new Date(), unitSlot: null } });
  await sweepAlerts(tenantId, send);
  return deskSnapshot(tenantId);
}

export async function addWalkIn(tenantId: string, input: { name?: string; phone?: string; serviceId?: string }, send: Sender = notifyGuest) {
  const tenant = await requireDesk(tenantId);
  const state = await ensureQueueState(tenantId);
  if (state.mode !== "LIVE") throw new QueueError("STATE", "Switch to the live queue to add a walk-in.", 409);
  const phone = (input.phone || "").trim() ? indianMobile(input.phone || "") : "";
  if ((input.phone || "").trim() && !phone) throw new QueueError("PHONE", "Enter a 10-digit Indian mobile number, or leave the phone empty.", 400);
  await findService(tenantId, input.serviceId);
  const dayKey = kolkataDayKey();
  const name = (input.name || "").trim().slice(0, 80) || "Walk-in";
  const created = await prisma.$transaction(async (tx) => {
    const last = await tx.queueEntry.aggregate({ where: { tenantId, dayKey }, _max: { token: true } });
    return tx.queueEntry.create({
      data: {
        tenantId,
        dayKey,
        token: (last._max.token ?? 0) + 1,
        name,
        phone,
        serviceId: input.serviceId || null,
        status: "WAITING",
        source: "WALKIN",
        cancelToken: randomBytes(18).toString("base64url"),
      },
    });
  });
  if (phone) {
    await safeSend(send, {
      ...joinedMessage({
        salon: tenant.name,
        token: created.token,
        link: statusUrl(tenant.slug, created.cancelToken),
      }),
      to: phone,
    });
  }
  await sweepAlerts(tenantId, send);
  return deskSnapshot(tenantId);
}

export async function setQueueOpen(tenantId: string, isOpen: boolean) {
  await requireDesk(tenantId);
  await ensureQueueState(tenantId);
  await prisma.queueState.update({ where: { tenantId }, data: { isOpen } });
  if (isOpen) await sweepAlerts(tenantId);
  return deskSnapshot(tenantId);
}

export async function saveQueueSettings(tenantId: string, input: {
  units: number;
  avgMinutes: number;
  alertLeadMin: number;
  mode: "LIVE" | "REQUEST";
  unitLabel: "chair" | "station" | "room";
}) {
  await requireDesk(tenantId);
  await ensureQueueState(tenantId);
  await prisma.queueState.update({
    where: { tenantId },
    data: {
      units: input.units,
      avgMinutes: input.avgMinutes,
      alertLeadMin: input.alertLeadMin,
      mode: input.mode,
      unitLabel: input.unitLabel,
    },
  });
  return deskSnapshot(tenantId);
}

export async function confirmRequest(tenantId: string, id: string, input: { date?: string; slot?: string }, send: Sender = notifyGuest) {
  const tenant = await requireDesk(tenantId);
  const row = await prisma.queueEntry.findFirst({ where: { id, tenantId } });
  if (!row || row.status !== "REQUESTED") throw new QueueError("STATE", "That request is not waiting.", 409);
  const date = (input.date || row.requestedDate).trim();
  const slot = (input.slot || row.requestedSlot).trim();
  checkSlot(date, slot);
  await prisma.queueEntry.update({
    where: { id },
    data: { status: "CONFIRMED", requestedDate: date, requestedSlot: slot },
  });
  if (row.phone) {
    await safeSend(send, {
      ...confirmedMessage({ salon: tenant.name, date, slot, link: statusUrl(tenant.slug, row.cancelToken) }),
      to: row.phone,
    });
  }
  return deskSnapshot(tenantId);
}

export async function declineRequest(tenantId: string, id: string) {
  await requireDesk(tenantId);
  const row = await prisma.queueEntry.findFirst({ where: { id, tenantId } });
  if (!row || row.status !== "REQUESTED") throw new QueueError("STATE", "That request is not waiting.", 409);
  await prisma.queueEntry.update({ where: { id }, data: { status: "CANCELLED", doneAt: new Date() } });
  return deskSnapshot(tenantId);
}

export async function purgeOldQueueEntries(now = Date.now()) {
  const days = Math.max(1, Number(process.env.QUEUE_RETENTION_DAYS || 30) || 30);
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
  const result = await prisma.queueEntry.deleteMany({ where: { joinedAt: { lt: cutoff } } });
  return result.count;
}
