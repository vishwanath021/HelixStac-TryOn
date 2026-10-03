import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-secret",
      AI_PROVIDER: "mock",
      BILLING_PROVIDER: "mock",
      MOCK_DELAY_MS: "0",
    },
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
