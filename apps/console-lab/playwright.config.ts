import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "../../test-results/console-lab",
  fullyParallel: false,
  retries: 0,
  // One worker, deliberately. `fullyParallel: false` only serializes tests
  // within a file; Playwright still runs files concurrently, and the worker
  // count then varies with the host's core count. This suite measures real
  // layout geometry and drives timing-sensitive launcher transitions, so
  // concurrent load makes it flaky in a way that depends on the machine: a
  // three-worker Linux run and a two-worker CI run each failed a different
  // test that passed on a repeat of the identical commit. With `retries: 0`
  // any such flake fails the whole run, so determinism is worth the wall
  // clock. Raise this only alongside evidence that the suite is race-free.
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "chrome",
    permissions: ["camera"],
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && pnpm vite preview --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: false,
  },
});
