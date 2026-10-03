import { GoogleGenAI, Modality } from "@google/genai";
import { styleReferenceFor } from "@/lib/ai/style-reference";
import type { GenerateInput, GenerateOutput, ImageStyleProvider } from "@/lib/ai/types";

const STANDARD_USD = 0.0336;
const HD_USD = 0.067;

export class GeminiProvider implements ImageStyleProvider {
  name = "gemini";

  constructor(private readonly apiKey = process.env.GEMINI_API_KEY || "") {}

  async health() {
    return Boolean(this.apiKey);
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const apiKey = this.apiKey;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    const model =
      input.quality === "hd"
        ? process.env.GEMINI_MODEL_HD || "gemini-3.1-flash-image"
        : process.env.GEMINI_MODEL_STANDARD || "gemini-3.1-flash-lite-image";
    const started = Date.now();
    const ai = new GoogleGenAI({ apiKey });
    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [
      { inlineData: { mimeType: "image/jpeg", data: input.image.toString("base64") } },
    ];
    const reference = styleReferenceFor(input, "gemini");
    if (reference) parts.push({ inlineData: { mimeType: "image/jpeg", data: reference.toString("base64") } });
    parts.push({ text: input.prompt });
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
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
