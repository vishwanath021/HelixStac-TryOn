import { afterEach, describe, expect, it } from "vitest";
import { hushMediapipeInfo } from "@/lib/face/detect-client";

describe("MediaPipe console noise", () => {
  const original = console.error;

  afterEach(() => {
    console.error = original;
  });

  it("drops the TensorFlow Lite XNNPACK info line and keeps real errors", () => {
    const seen: string[] = [];
    console.error = (...args: unknown[]) => {
      seen.push(args.map(String).join(" "));
    };
    hushMediapipeInfo();
    console.error("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.");
    console.error("real failure");
    expect(seen).toEqual(["real failure"]);
  });
});
