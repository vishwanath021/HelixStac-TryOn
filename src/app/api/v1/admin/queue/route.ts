import { NextResponse } from "next/server";
import { z } from "zod";
import { queueJson } from "@/lib/queue/http";
import {
  addWalkIn,
  callNext,
  confirmRequest,
  declineRequest,
  deskSnapshot,
  finishEntry,
  saveQueueSettings,
  setQueueOpen,
  startEntry,
} from "@/lib/queue/service";
import { requireMembership } from "@/lib/session";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open") }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("next") }),
  z.object({ action: z.literal("start"), id: z.string().min(1) }),
  z.object({ action: z.literal("done"), id: z.string().min(1) }),
  z.object({ action: z.literal("noshow"), id: z.string().min(1) }),
  z.object({
    action: z.literal("walkin"),
    name: z.string().optional().transform((value) => (value ?? "").trim().slice(0, 80)),
    phone: z.string().optional().transform((value) => (value ?? "").trim().slice(0, 20)),
    serviceId: z.string().max(40).optional(),
  }),
  z.object({
    action: z.literal("confirm"),
    id: z.string().min(1),
    date: z.string().max(10).optional(),
    slot: z.string().max(5).optional(),
  }),
  z.object({ action: z.literal("decline"), id: z.string().min(1) }),
  z.object({
    action: z.literal("settings"),
    units: z.number().int().min(1).max(30),
    avgMinutes: z.number().int().min(5).max(240),
    alertLeadMin: z.number().int().min(0).max(120),
    mode: z.enum(["LIVE", "REQUEST"]),
    unitLabel: z.enum(["chair", "station", "room"]),
  }),
]);

async function desk() {
  const access = await requireMembership();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  return access.tenant;
}

export async function GET() {
  const tenant = await desk();
  if (tenant instanceof NextResponse) return tenant;
  try {
    return NextResponse.json(await deskSnapshot(tenant.id));
  } catch (error) {
    const response = queueJson(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(req: Request) {
  const tenant = await desk();
  if (tenant instanceof NextResponse) return tenant;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID", message: "That update was not understood." }, { status: 400 });
  const body = parsed.data;
  try {
    if (body.action === "open") return NextResponse.json(await setQueueOpen(tenant.id, true));
    if (body.action === "pause") return NextResponse.json(await setQueueOpen(tenant.id, false));
    if (body.action === "next") return NextResponse.json(await callNext(tenant.id));
    if (body.action === "start") return NextResponse.json(await startEntry(tenant.id, body.id));
    if (body.action === "done") return NextResponse.json(await finishEntry(tenant.id, body.id, "DONE"));
    if (body.action === "noshow") return NextResponse.json(await finishEntry(tenant.id, body.id, "NO_SHOW"));
    if (body.action === "walkin") return NextResponse.json(await addWalkIn(tenant.id, body));
    if (body.action === "confirm") return NextResponse.json(await confirmRequest(tenant.id, body.id, body));
    if (body.action === "decline") return NextResponse.json(await declineRequest(tenant.id, body.id));
    return NextResponse.json(await saveQueueSettings(tenant.id, body));
  } catch (error) {
    const response = queueJson(error);
    if (response) return response;
    throw error;
  }
}
