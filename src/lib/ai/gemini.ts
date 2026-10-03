import { GoogleGenAI, Modality } from "@google/genai";
import type { GenerateInput, GenerateOutput, ImageStyleProvider } from "@/lib/ai/types";

const STANDARD_USD = 0.0336;
const HD_USD = 0.067;

export class GeminiProvider implements ImageStyleProvider {
  name = "gemini";

  async health() {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    const model =
      input.quality === "hd"
        ? process.env.GEMINI_MODEL_HD || "gemini-3.1-flash-image"
        : process.env.GEMINI_MODEL_STANDARD || "gemini-3.1-flash-lite-image";
    const started = Date.now();
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: input.image.toString("base64") } },
            { text: input.prompt },
          ],
        },
      ],
      config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });
    const data = response.data;
    if (!data) throw new Error("Gemini returned no image");
    return {
      image: Buffer.from(data, "base64"),
      mime: "image/jpeg",
      provider: `${this.name}:${model}`,
      providerCostUsd: input.quality === "hd" ? HD_USD : STANDARD_USD,
      latencyMs: Date.now() - started,
    };
  }
}
