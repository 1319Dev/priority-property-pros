import { defineConfig } from "@playwright/test";

const port = 4173;
const harnessPort = 5174;
const baseURL = `http://127.0.0.1:${port}`;
const harnessURL = `http://127.0.0.1:${harnessPort}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: /(responsive|priority-help)\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --config vite.harness.config.ts --host 127.0.0.1 --port ${harnessPort} --strictPort`,
      url: `${harnessURL}/e2e/harness/index.html?as=customer`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
