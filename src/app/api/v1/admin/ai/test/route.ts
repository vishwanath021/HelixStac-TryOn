import { NextResponse } from "next/server";
import { z } from "zod";
import { allowByoKey } from "@/lib/ai/credentials";
import { storedKey, testProviderKey } from "@/lib/ai/settings-store";
import { requireOwner } from "@/lib/session";

const schema = z.object({
  provider: z.enum(["openai", "gemini"]),
  apiKey: z.string().max(300).optional().default(""),
});

export async function POST(req: Request) {
  const access = await requireOwner();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "OWNER_ONLY" }, { status: 403 });
  if (!(await allowByoKey())) {
    return NextResponse.json({ error: "BYO_OFF", message: "This salon uses the platform key." }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const pasted = parsed.data.apiKey.trim();
  let apiKey = pasted.startsWith("•") || pasted === "" ? "" : pasted;
  if (!apiKey) {
    try {
      const saved = await storedKey({ tenantId: access.tenant.id });
      if (saved && saved.provider === parsed.data.provider) apiKey = saved.apiKey;
    } catch {
      apiKey = "";
    }
  }
  if (!apiKey) return NextResponse.json({ ok: false, message: "Paste a key first." }, { status: 400 });
  const result = await testProviderKey(parsed.data.provider, apiKey);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
