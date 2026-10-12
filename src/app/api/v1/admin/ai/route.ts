import { NextResponse } from "next/server";
import { z } from "zod";
import { salonAiView, saveSalonAi } from "@/lib/ai/settings-store";
import { requireOwner } from "@/lib/session";

const schema = z.object({
  provider: z.enum(["openai", "gemini"]),
  apiKey: z.string().max(300).optional().default(""),
  tier: z.enum(["test", "medium", "high"]).optional().default("test"),
});

export async function GET() {
  const access = await requireOwner();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "OWNER_ONLY" }, { status: 403 });
  return NextResponse.json(await salonAiView(access.tenant.id));
}

export async function PUT(req: Request) {
  const access = await requireOwner();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access) || !("session" in access)) return NextResponse.json({ error: "OWNER_ONLY" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  try {
    await saveSalonAi(access.tenant.id, parsed.data, access.session.user.id);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "BYO_OFF") {
      return NextResponse.json({ error: "BYO_OFF", message: "This salon uses the platform key. Ask Lookuvi to turn on a salon key." }, { status: 403 });
    }
    if (code === "INVALID_KEY") {
      return NextResponse.json({ error: "INVALID_KEY", message: "Paste the provider key. It is stored encrypted and is not shown again." }, { status: 400 });
    }
    throw error;
  }
  return NextResponse.json(await salonAiView(access.tenant.id));
}
