import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const fakeCamera = path.join(process.cwd(), "tests/fixtures/selfie.y4m");

const chromiumCamera = {
  permissions: ["camera"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${fakeCamera}`,
    ],
  },
};

const desktop = (width: number, height: number) => ({
  ...devices["Desktop Chrome"],
  viewport: { width, height },
  ...chromiumCamera,
});

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  projects: [
    { name: "android", testIgnore: /responsive/, use: { ...devices["Pixel 5"], ...chromiumCamera } },
    {
      name: "iphone",
      testIgnore: /responsive/,
      use: { ...devices["iPhone 13"], browserName: "chromium", defaultBrowserType: "chromium", ...chromiumCamera },
    },
    { name: "desktop", testIgnore: /responsive/, use: desktop(1280, 800) },
    { name: "webkit-iphone-13", testMatch: /responsive/, use: { ...devices["iPhone 13"] } },
    { name: "webkit-iphone-15", testMatch: /responsive/, use: { ...devices["iPhone 15"] } },
    { name: "pixel-7", testMatch: /responsive/, use: { ...devices["Pixel 7"], ...chromiumCamera } },
    { name: "webkit-ipad-mini", testMatch: /responsive/, use: { ...devices["iPad Mini"] } },
    { name: "webkit-ipad-pro", testMatch: /responsive/, use: { ...devices["iPad Pro 11"] } },
    { name: "galaxy-tab", testMatch: /responsive/, use: { ...devices["Galaxy Tab S4"], ...chromiumCamera } },
    { name: "webkit-ipad-mini-land", testMatch: /responsive/, use: { ...devices["iPad Mini landscape"] } },
    { name: "webkit-ipad-pro-land", testMatch: /responsive/, use: { ...devices["iPad Pro 11 landscape"] } },
    { name: "galaxy-tab-land", testMatch: /responsive/, use: { ...devices["Galaxy Tab S4 landscape"], ...chromiumCamera } },
    { name: "desk-1280", testMatch: /responsive/, use: desktop(1280, 800) },
    { name: "desk-1440", testMatch: /responsive/, use: desktop(1440, 900) },
    { name: "desk-1920", testMatch: /responsive/, use: desktop(1920, 1080) },
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
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
          OTP_PROVIDER: "mock",
          GENERATE_PER_IP_HOUR: "40",
          GENERATE_PER_IP_DAY: "80",
          GENERATE_PER_TENANT_MINUTE: "200",
          APP_BASE_URL: "http://127.0.0.1:3000",
        },
      },
});
