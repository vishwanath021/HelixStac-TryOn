import { describe, expect, it } from "vitest";
import { legalName, productionEnvProblems } from "@/lib/env";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://lookuvi:lookuvi@localhost:5432/lookuvi",
  AUTH_SECRET: "test-secret-not-for-production-use-32",
  AUTH_TRUST_HOST: "true",
  APP_BASE_URL: "https://lookuvi.example",
  TRUST_PROXY: "true",
  AI_SPEND_CAP_INR: "5000",
  AI_SALON_SPEND_CAP_INR: "2000",
  CRON_SECRET: "cron-secret-at-least-16",
  OBJECT_STORAGE: "s3",
  S3_BUCKET: "lookuvi-previews",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};

describe("production env", () => {
  it("names Agentic Build Works unless BRAND_LEGAL_NAME is set", () => {
    const previous = process.env.BRAND_LEGAL_NAME;
    delete process.env.BRAND_LEGAL_NAME;
    expect(legalName()).toBe("Agentic Build Works");
    process.env.BRAND_LEGAL_NAME = "Custom Co";
    expect(legalName()).toBe("Custom Co");
    if (previous === undefined) delete process.env.BRAND_LEGAL_NAME;
    else process.env.BRAND_LEGAL_NAME = previous;
  });

  it("stays quiet outside production", () => {
    expect(productionEnvProblems({ NODE_ENV: "development" })).toEqual([]);
    expect(productionEnvProblems({ NODE_ENV: "test" })).toEqual([]);
  });

  it("accepts a complete production env without AI keys", () => {
    expect(productionEnvProblems(good)).toEqual([]);
  });

  it("fails fast when secrets or dev flags are wrong", () => {
    const problems = productionEnvProblems({
      NODE_ENV: "production",
      AUTH_SECRET: "short",
      AUTH_TRUST_HOST: "false",
      ALLOW_DEV_MAGIC_LINK: "true",
      ALLOW_DEV_OTP: "true",
    });
    expect(problems.join(" ")).toContain("DATABASE_URL");
    expect(problems.join(" ")).toContain("AUTH_SECRET");
    expect(problems.join(" ")).toContain("AUTH_TRUST_HOST");
    expect(problems.join(" ")).toContain("APP_BASE_URL");
    expect(problems.join(" ")).toContain("ALLOW_DEV_MAGIC_LINK");
    expect(problems.join(" ")).toContain("ALLOW_DEV_OTP");
  });
});
