import { NextResponse } from "next/server";
import { z } from "zod";
import { colourGuidance, faceGuidance, quizGuidance } from "@/lib/guidance";
import { tooMany } from "@/lib/http/guard";

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("face"), shape: z.string().min(2).max(20), who: z.enum(["women", "men", "kids"]) }),
  z.object({ kind: z.literal("colour"), grey: z.boolean(), undertone: z.enum(["warm", "cool", "neutral"]) }),
  z.object({
    kind: z.literal("quiz"),
    who: z.enum(["women", "men", "kids"]),
    length: z.string().max(20),
    texture: z.string().max(20),
    occasion: z.string().max(20),
  }),
]);

export async function POST(req: Request) {
  const limited = await tooMany(req, "guide", 120, 60 * 60 * 1000);
  if (limited) return limited;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const body = parsed.data;
  if (body.kind === "face") return NextResponse.json(faceGuidance(body.shape, body.who));
  if (body.kind === "colour") return NextResponse.json(colourGuidance(body));
  return NextResponse.json(quizGuidance(body));
}
