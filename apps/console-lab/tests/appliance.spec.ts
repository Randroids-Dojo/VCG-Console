import { expect, test } from "@playwright/test";

test("host profile IDs remain exact and fit the 720p profile picker", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const id = `family-${"x".repeat(57)}`;
  await page.route("http://127.0.0.1:43210/v1/profiles", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${"a".repeat(64)}`);
    await route.fulfill({ json: { protocolVersion: "0.1.0", profileIds: [id] }, headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:4173" } });
  });
  await page.goto(`/?skipBoot=1&input=controller#vcg-host-port=43210&vcg-host-token=${"a".repeat(64)}`);
  await expect(page.locator("#active-profile-name")).toHaveText(id);
  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  const profile = page.locator(".host-profile-list strong");
  await expect(profile).toHaveText(id);
  expect(await profile.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return element.scrollWidth <= element.clientWidth && bounds.left >= 64 && bounds.right <= 1216;
  })).toBe(true);
  await page.screenshot({ path: "../../artifacts/cleanup-review/appliance-host-profiles-720p.png" });
});

test("the appliance excludes fixture documents and synthetic profile administration", async ({ page, request }) => {
  for (const fixture of ["bridge-host.html", "bridge-stalled-client.html", "browser-policy-hostile.html", "browser-policy-opaque-host.html"]) {
    expect((await request.get(`/${fixture}`)).status()).toBe(404);
  }
  await page.goto("/?skipBoot=1&input=controller&motionSimulatorTest=1&spatialFocusTest=1");
  await expect(page.locator("#active-profile-name")).toHaveText("Guest");
  expect(await page.evaluate(() => [window.__vcgSpatialFocus, window.__vcgMotionSimulator, window.__vcgObstacleJourney].every((value) => value === undefined))).toBe(true);
  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  await expect(page.getByText("Connect the native console host to select a saved profile.")).toBeVisible();
  await expect(page.locator("#create-profile")).toHaveCount(0);
  await expect(page.locator("[data-launcher-view='profile-management']")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check for updates" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Developer", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Storage", exact: true }).click();
  await expect(page.getByText("Storage usage is unavailable. Check capacity with the native console tools.")).toBeVisible();
  await expect(page.getByText("38 GB used")).not.toBeVisible();
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await expect(page.getByRole("button", { name: /Motion Lab Skeleton/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Obstacle Dodge/ })).toBeVisible();
});

test("the appliance can play built-in games and return to Home", async ({ page }) => {
  await page.goto("/?skipBoot=1&input=controller");
  await page.getByRole("button", { name: "Retro", exact: true }).click();
  await page.getByRole("button", { name: /Circuit Shift/ }).click();
  await expect(page.locator("[data-launcher-view='retro-game']")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-launcher-view='retro']")).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: /MOTION Obstacle/ }).click();
  await expect(page.locator("#obstacle-view")).toBeVisible();
  await page.locator("#diagnostics-toggle").click();
  await expect(page.locator("[data-health-fixture]:visible, [data-body-fixture]:visible, #simulator-card:visible, #export-button:visible")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-launcher-view='home']")).toBeVisible();
});
