import { NextResponse } from "next/server";
import { approveMediumQuality, platformAiView } from "@/lib/ai/settings-store";
import { requireSuper } from "@/lib/session";

export async function POST() {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  if (!("session" in access)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  try {
    await approveMediumQuality();
  } catch (error) {
    if (error instanceof Error && error.message === "CALIBRATION_REQUIRED") {
      return NextResponse.json(
        { error: "CALIBRATION_REQUIRED", message: "Run calibration and place every zone before approving medium quality." },
        { status: 400 },
      );
    }
    throw error;
  }
  return NextResponse.json(await platformAiView());
}
