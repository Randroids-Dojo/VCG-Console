import { expect, test, type Page } from "@playwright/test";

async function openMotionLab(page: Page): Promise<void> {
  await page.goto("/?skipBoot=1");
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: /Motion Lab Skeleton/ }).click();
}

test("boots into a purposeful launcher", async ({ page }) => {
  await page.goto("/?holdBoot=1");
  await expect(page.locator("#boot-screen")).toBeVisible();
  await expect(page.locator("#boot-status")).toHaveText("SYSTEM READY", { timeout: 2_000 });
  await page.screenshot({ path: "../../test-results/console-lab/boot-screen.png" });
});

test("launcher exposes every hub and universal search", async ({ page }) => {
  await page.goto("/?skipBoot=1");
  await expect(page.getByRole("heading", { name: /Good evening/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Enter the museum/ })).toHaveCount(0);
  await page.waitForTimeout(220);
  await page.screenshot({ path: "../../test-results/console-lab/launcher-home.png" });

  await page.getByRole("button", { name: "Museum", exact: true }).click();
  await expect(page.getByRole("link", { name: /Enter the museum/ })).toHaveAttribute("href", "https://vibecoded.games");
  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  await page.getByRole("button", { name: /Guest Local guest/ }).click();
  await expect(page.locator("#active-profile-name")).toHaveText("Guest");
  await page.getByRole("button", { name: "Update selected profile" }).click();
  await page.locator("#profile-name-input").fill("Guest Two");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator("#active-profile-name")).toHaveText("Guest Two");
  await page.getByRole("button", { name: /Create profile New local player/ }).click();
  await page.locator("#profile-name-input").fill("Player Three");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator("#active-profile-name")).toHaveText("Player Three");

  await page.keyboard.press("/");
  await page.locator("#universal-search").fill("VibeBots");
  await page.getByRole("button", { name: /VibeBots Museum catalog/ }).click();
  await expect(page.getByRole("heading", { name: /museum is/ })).toBeVisible();
  await page.keyboard.press("/");
  await page.locator("#universal-search").fill("retro");
  await page.getByRole("button", { name: /RetroArch Retro library/ }).click();
  await expect(page.getByRole("heading", { name: /One library/ })).toBeVisible();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Storage", exact: true }).click();
  await expect(page.getByText("218 GB available")).toBeVisible();
  await page.getByRole("button", { name: "Wi-Fi", exact: true }).click();
  await page.getByRole("button", { name: "Scan for networks" }).click();
  await expect(page.getByRole("button", { name: /No networks found/ })).toBeVisible({ timeout: 1_500 });
  await page.getByRole("button", { name: "Developer", exact: true }).click();
  const diagnosticSwitch = page.getByRole("switch").first();
  await diagnosticSwitch.click();
  await expect(diagnosticSwitch).toHaveAttribute("aria-checked", "true");
  await expect(diagnosticSwitch).toHaveText("On");
});

test("launcher remains usable on a narrow setup display", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?skipBoot=1");
  await expect(page.getByRole("heading", { name: /Good evening/ })).toBeVisible();
  await page.getByRole("button", { name: "Retro", exact: true }).click();
  await expect(page.getByRole("heading", { name: /One library/ })).toBeVisible();
  await page.keyboard.press("/");
  await expect(page.locator("#universal-search")).toBeFocused();
  await page.screenshot({ path: "../../test-results/console-lab/launcher-mobile-search.png" });
});

test("console lab preserves navigation and overlay focus contracts", async ({ page }) => {
  await openMotionLab(page);
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
  await openMotionLab(page);
  await page.getByRole("button", { name: /02 OBSTACLE/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "YOUR BODY IS THE SIGNAL." })).toBeVisible();
});

test("captures the reviewed tracker surface", async ({ page }) => {
  await openMotionLab(page);
  await page.screenshot({ path: "../../test-results/console-lab/tracker-surface.png", fullPage: true });
});

test("loads the pinned local model and starts a camera pipeline", async ({ page }) => {
  await openMotionLab(page);
  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.locator("#health-badge")).toHaveText("LIVE", { timeout: 15_000 });
  await expect(page.locator("#source-badge")).toHaveText("MEDIAPIPE / LOCAL");
  await expect
    .poll(async () => `${await page.locator("#metric-tracker").textContent()} / ${await page.locator("#status-detail").textContent()}`, { timeout: 15_000 })
    .toContain("WORKER");
});

test("reports and survives an unavailable worker with the explicit fallback", async ({ page }) => {
  await page.route("**/tracker-worker-*.js", (route) => route.abort());
  await openMotionLab(page);
  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.locator("#health-badge")).toHaveText("LIVE", { timeout: 15_000 });
  await expect(page.locator("#metric-tracker")).toContainText("MAIN", { timeout: 15_000 });
  await expect(page.locator("#status-detail")).toContainText("Worker initialization failed");
});

test("cooperative web game negotiates, receives a frame, and reconnects after reload", async ({ page }) => {
  await page.goto("/bridge-host.html");
  const game = page.frameLocator("#game");
  await expect(game.locator("#client-status")).toHaveText("CONNECTED");
  await expect(page.locator("#host-status")).toHaveText("CONNECTED");
  await page.getByRole("button", { name: "PUBLISH FRAME" }).click();
  await expect(game.locator("#frame-sequence")).toHaveText("FRAME 0");

  await page.locator("#game").evaluate((element: HTMLIFrameElement) => element.contentWindow?.location.reload());
  await expect(game.locator("#client-status")).toHaveText("CONNECTED");
  await page.waitForTimeout(20);
  await page.getByRole("button", { name: "PUBLISH FRAME" }).click();
  await expect(game.locator("#frame-sequence")).toHaveText("FRAME 1");
});
