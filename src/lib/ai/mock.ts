import { demoStyleComposite } from "@/lib/ai/composite";
import { thumbnailFolder } from "@/lib/ai/style-reference";
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
    const image = await demoStyleComposite(input.image, input.styleId, input.styleName || input.styleId, thumbnailFolder(input.kind));
    return { image, mime: "image/jpeg", provider: this.name, providerCostUsd: 0, latencyMs: Date.now() - started };
  }
}
