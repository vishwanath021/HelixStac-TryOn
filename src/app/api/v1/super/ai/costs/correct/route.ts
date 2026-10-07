import { NextResponse } from "next/server";
import { z } from "zod";
import { correctActualCost } from "@/lib/ai/spend";
import { requireSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().min(1).max(80),
  actualUsd: z.number().finite().nonnegative().max(1000),
  note: z.string().trim().min(1).max(500),
});

export async function POST(req: Request) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  if (!("session" in access)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID", message: "Enter a dollar amount and an audit note." }, { status: 400 });
  const result = await correctActualCost({
    id: parsed.data.id,
    actorId: access.session.user.id,
    actualUsd: parsed.data.actualUsd,
    note: parsed.data.note,
  });
  if (!result.ok) return NextResponse.json({ error: "INVALID", message: result.message }, { status: 400 });
  return NextResponse.json({ message: result.message });
}
