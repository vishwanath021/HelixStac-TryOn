import { describe, expect, it } from "vitest";
import { productionEnvProblems } from "@/lib/env";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://lookuvi:lookuvi@localhost:5432/lookuvi",
  AUTH_SECRET: "test-secret-not-for-production-use-32",
  AUTH_TRUST_HOST: "true",
  APP_BASE_URL: "https://lookuvi.example",
};

describe("production env", () => {
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
