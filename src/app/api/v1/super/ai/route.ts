import { NextResponse } from "next/server";
import { z } from "zod";
import { platformAiView, saveFalKey, savePlatformAi } from "@/lib/ai/settings-store";
import { requireSuper } from "@/lib/session";

const schema = z.object({
  provider: z.enum(["openai", "gemini"]).optional(),
  apiKey: z.string().max(300).optional().default(""),
  allowByo: z.boolean().optional(),
  tier: z.enum(["test", "medium", "high"]).optional().default("test"),
  highEnabled: z.boolean().optional().default(false),
  falOnly: z.boolean().optional(),
  falKey: z.string().max(400).optional().default(""),
  falEnabled: z.boolean().optional().default(false),
  removeFalKey: z.boolean().optional().default(false),
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
    if (parsed.data.falOnly) {
      await saveFalKey(
        { apiKey: parsed.data.falKey, enabled: parsed.data.falEnabled, remove: parsed.data.removeFalKey },
        access.session.user.id,
      );
    } else {
      if (!parsed.data.provider || parsed.data.allowByo === undefined) {
        return NextResponse.json({ error: "INVALID" }, { status: 400 });
      }
      await savePlatformAi(
        {
          provider: parsed.data.provider,
          apiKey: parsed.data.apiKey,
          allowByo: parsed.data.allowByo,
          tier: parsed.data.tier,
          highEnabled: parsed.data.highEnabled,
        },
        access.session.user.id,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_KEY") {
      return NextResponse.json({ error: "INVALID_KEY", message: "Paste the provider key. It is stored encrypted and is not shown again." }, { status: 400 });
    }
    throw error;
  }
  return NextResponse.json(await platformAiView());
}
