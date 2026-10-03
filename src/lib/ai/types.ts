export type PreviewQuality = "standard" | "hd";

export type GenerateInput = {
  image: Buffer;
  styleId: string;
  gender: "women" | "men" | "kids";
  prompt: string;
  colour?: string | null;
  tenantId: string;
  quality: PreviewQuality;
  kind?: "style" | "brows";
};

export type GenerateOutput = {
  image: Buffer;
  mime: "image/jpeg";
  provider: string;
  providerCostUsd: number;
  latencyMs: number;
};

export interface ImageStyleProvider {
  name: string;
  generate(input: GenerateInput): Promise<GenerateOutput>;
  health(): Promise<boolean>;
}
