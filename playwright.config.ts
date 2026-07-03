import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src",
  testMatch: "**/*.browser.pw.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  outputDir: ".playwright-output",
  use: {
    browserName: "chromium",
    headless: true,
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
});
