import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const fakeCamera = path.join(process.cwd(), "tests/fixtures/selfie.y4m");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    ...devices["Pixel 5"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-video-capture=${fakeCamera}`,
      ],
    },
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
