import { NextResponse } from "next/server";
import { z } from "zod";
import { platformAiView, savePlatformAi } from "@/lib/ai/settings-store";
import { requireSuper } from "@/lib/session";

const schema = z.object({
  provider: z.enum(["openai", "gemini"]),
  apiKey: z.string().max(300).optional().default(""),
  allowByo: z.boolean(),
});

export async function GET() {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  return NextResponse.json(await platformAiView());
}

export async function PUT(req: Request) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  if (!("session" in access)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  try {
    await savePlatformAi(parsed.data, access.session.user.id);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_KEY") {
      return NextResponse.json({ error: "INVALID_KEY", message: "Paste the provider key. It is stored encrypted and is not shown again." }, { status: 400 });
    }
    throw error;
  }
  return NextResponse.json(await platformAiView());
}
