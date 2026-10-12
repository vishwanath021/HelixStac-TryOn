import type { GenerateInput, GenerateOutput, ImageStyleProvider } from "@/lib/ai/types";

/**
 * Failover stub for a Replicate or fal image-edit model.
 * The request shape matches flux-kontext-apps/change-haircut, but this adapter
 * does not call the network unless a token is present — and even then it posts
 * a documented JSON body. Tests and local demo stay on MockProvider.
 */
export class ReplicateStubProvider implements ImageStyleProvider {
  name: string;

  constructor(private kind: "replicate" | "fal" = "replicate") {
    this.name = kind;
  }

  async health() {
    return this.kind === "fal" ? Boolean(process.env.FAL_KEY) : Boolean(process.env.REPLICATE_API_TOKEN);
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const token = this.kind === "fal" ? process.env.FAL_KEY : process.env.REPLICATE_API_TOKEN;
    if (!token) throw new Error(`${this.kind} API token is not set`);
    const model = this.kind === "fal" ? process.env.FAL_MODEL || "fal-ai/flux-pro/kontext" : process.env.REPLICATE_MODEL || "flux-kontext-apps/change-haircut";
    const started = Date.now();
    const endpoint =
      this.kind === "fal"
        ? `https://fal.run/${model}`
        : `https://api.replicate.com/v1/models/${model}/predictions`;
    const body =
      this.kind === "fal"
        ? { prompt: input.prompt, image_url: `data:image/jpeg;base64,${input.image.toString("base64")}` }
        : { input: { prompt: input.prompt, gender: input.gender, haircut: input.styleId } };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: this.kind === "fal" ? `Key ${token}` : `Bearer ${token}`,
        "content-type": "application/json",
        prefer: "wait",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`${this.kind} request failed (${response.status})`);
    }
    const payload = (await response.json()) as { output?: string | string[]; images?: { url: string }[] };
    const url = Array.isArray(payload.output) ? payload.output[0] : payload.output || payload.images?.[0]?.url;
    if (!url) throw new Error(`${this.kind} returned no image`);
    const imageRes = await fetch(url);
    if (!imageRes.ok) throw new Error(`${this.kind} image download failed`);
    return {
      image: Buffer.from(await imageRes.arrayBuffer()),
      mime: "image/jpeg",
      provider: `${this.kind}:${model}`,
      providerCostUsd: 0.04,
      latencyMs: Date.now() - started,
    };
  }
}
