import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "appliance.spec.ts",
  outputDir: "../../test-results/appliance",
  webServer: {
    command: "pnpm -w build && pnpm -w serve",
    port: 4173,
    reuseExistingServer: false,
  },
});
