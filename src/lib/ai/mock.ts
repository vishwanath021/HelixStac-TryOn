import { sampleCard } from "@/lib/ai/sample-card";
import type { GenerateInput, GenerateOutput, ImageStyleProvider } from "@/lib/ai/types";

export class MockProvider implements ImageStyleProvider {
  name = "mock";

  async health() {
    return true;
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const started = Date.now();
    const delay = Number(process.env.MOCK_DELAY_MS ?? 900);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const caption = input.prompt.split(".").slice(0, 1).join("").replace(/\s+/g, " ").trim();
    const image = await sampleCard("AFTER", caption || "Demo");
    return { image, mime: "image/jpeg", provider: this.name, providerCostUsd: 0, latencyMs: Date.now() - started };
  }
}
