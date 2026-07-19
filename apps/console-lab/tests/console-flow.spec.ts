import { expect, test } from "@playwright/test";

test("console lab preserves navigation and overlay focus contracts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "YOUR BODY IS THE SIGNAL." })).toBeVisible();
  await expect(page.getByText("RAW VIDEO", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: /02 OBSTACLE/ }).click();
  await expect(page.getByRole("heading", { name: "MOVE BEFORE IT HITS." })).toBeVisible();
  await expect(page.locator("#obstacle-canvas")).toBeVisible();

  await page.getByRole("button", { name: /03 SHELL LAB/ }).click();
  await expect(page.getByRole("heading", { name: "EVERY PATH LEADS BACK." })).toBeVisible();
  await page.getByRole("button", { name: "TEST MANUAL PAUSE" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "EXIT TO TRACKER" })).toHaveClass(/focused/);
  await expect(page.getByRole("button", { name: "EXIT TO TRACKER" })).toBeFocused();
  await page.getByRole("button", { name: "EXIT TO TRACKER" }).click();
  await expect(page.getByRole("heading", { name: "YOUR BODY IS THE SIGNAL." })).toBeVisible();

  await page.getByRole("button", { name: /03 SHELL LAB/ }).click();
  await page.getByRole("button", { name: "TEST TRACKING LOSS" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_500 });
  await expect(page.getByRole("button", { name: "RESUME" })).toHaveClass(/focused/);
  await expect(page.getByRole("button", { name: "RESUME" })).toBeFocused();
});

test("Escape always walks back toward the tracker", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /02 OBSTACLE/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "YOUR BODY IS THE SIGNAL." })).toBeVisible();
});

test("captures the reviewed tracker surface", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({ path: "../../test-results/console-lab/tracker-surface.png", fullPage: true });
});

test("loads the pinned local model and starts a camera pipeline", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.locator("#health-badge")).toHaveText("LIVE", { timeout: 15_000 });
  await expect(page.locator("#source-badge")).toHaveText("MEDIAPIPE / LOCAL");
  await expect
    .poll(async () => `${await page.locator("#metric-tracker").textContent()} / ${await page.locator("#status-detail").textContent()}`, { timeout: 15_000 })
    .toContain("WORKER");
});

test("reports and survives an unavailable worker with the explicit fallback", async ({ page }) => {
  await page.route("**/tracker-worker-*.js", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.locator("#health-badge")).toHaveText("LIVE", { timeout: 15_000 });
  await expect(page.locator("#metric-tracker")).toContainText("MAIN", { timeout: 15_000 });
  await expect(page.locator("#status-detail")).toContainText("Worker initialization failed");
});
