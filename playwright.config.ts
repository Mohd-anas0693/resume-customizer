import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command: "npm run build && npx next start -p 3100",
    url: "http://127.0.0.1:3100",
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
  },
});
