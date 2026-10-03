import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    ...devices["Pixel 5"],
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          DATABASE_URL: "file:./dev.db",
          AUTH_SECRET: "test-secret-not-for-production-use-32",
          AUTH_TRUST_HOST: "true",
          AI_PROVIDER: "mock",
          BILLING_PROVIDER: "mock",
          MOCK_DELAY_MS: "200",
          ALLOW_DEV_MAGIC_LINK: "true",
          APP_BASE_URL: "http://127.0.0.1:3000",
        },
      },
});
