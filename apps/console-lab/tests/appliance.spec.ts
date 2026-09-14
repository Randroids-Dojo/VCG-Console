import { expect, test } from "@playwright/test";
import { connectSyntheticController } from "./synthetic-controller";

test("host profile IDs remain exact and fit the 720p profile picker", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const id = `family-${"x".repeat(57)}`;
  await page.route("http://127.0.0.1:43210/v1/profiles", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${"a".repeat(64)}`);
    await route.fulfill({ json: { protocolVersion: "0.1.0", profileIds: [id, "family-two"] }, headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:4173" } });
  });
  await page.goto(`/?skipBoot=1&input=controller#vcg-host-port=43210&vcg-host-token=${"a".repeat(64)}`);
  await expect(page.locator("#active-profile-name")).toHaveText(id);
  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  const profile = page.locator(".host-profile-list strong").first();
  await expect(profile).toHaveText(id);
  expect(await profile.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return element.scrollWidth <= element.clientWidth && bounds.left >= 64 && bounds.right <= 1216;
  })).toBe(true);
  await page.screenshot({ path: "../../artifacts/cleanup-review/appliance-host-profiles-720p.png" });
  for (const width of [800, 540]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.locator(".host-profile-list button").evaluateAll((buttons) => {
      const first = buttons[0]!.getBoundingClientRect();
      const second = buttons[1]!.getBoundingClientRect();
      return second.top >= first.bottom && Math.abs(second.left - first.left) < 1;
    })).toBe(true);
  }
});

for (const profileId of ["", "family-host-profile"]) {
  test(`installed and imported launches ${profileId ? "use the exact host profile" : "require a saved host profile"}`, async ({ page }) => {
    await connectSyntheticController(page);
    const posted: Array<Record<string, unknown>> = [];
    const entries = [{ entryId: `content-${"1".repeat(64)}`, title: "Imported NES game", systemId: "nes", coreId: "mesen", sizeBytes: 40976 }];
    const release = { id: "retro-2048", version: "qualification-candidate-2026-07-23", runtime: "libretro" };
    await page.route("http://127.0.0.1:43211/v1/**", async (route) => {
      const request = route.request();
      const headers = {
        "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      };
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers });
        return;
      }
      const path = new URL(request.url()).pathname;
      let body: unknown;
      let status = 200;
      if (path === "/v1/profiles") body = { protocolVersion: "0.1.0", profileIds: profileId ? [profileId] : [] };
      else if (path === "/v1/status") body = { protocolVersion: "0.1.0", hostVersion: "0.1.0", target: "x86_64-windows", capabilities: ["launcher-shell", "trusted-package-catalog", "trusted-package-launch", "retro-library"] };
      else if (path === "/v1/packages") body = { protocolVersion: "0.1.0", catalogGeneration: 7, packages: [{ id: "nes-library", version: "1.0.0", runtime: "libretro" }, release] };
      else if (path === "/v1/packages/retro-2048") body = { ...release, catalogGeneration: 7 };
      else if (path === "/v1/library") body = { protocolVersion: "0.1.0", libraryGeneration: 2, entryCount: 1, entries };
      else if (path === "/v1/launches" && request.method() === "POST") {
        posted.push(request.postDataJSON() as Record<string, unknown>);
        status = 409;
        body = { code: "LIBRARY_ENTRY_INCOMPATIBLE" };
      } else {
        status = 404;
        body = { code: "NOT_FOUND" };
      }
      await route.fulfill({ status, headers, json: body });
    });
    await page.goto(`/?skipBoot=1&input=controller#vcg-host-port=43211&vcg-host-token=${"b".repeat(64)}`);
    await expect(page.locator("#active-profile-name")).toHaveText(profileId || "Guest");
    await page.getByRole("button", { name: "Retro", exact: true }).click();
    await expect(page.getByRole("button", { name: /2048.*Installed/ })).toBeVisible();
    await page.getByRole("button", { name: /2048 Contentless public-domain core/ }).click();
    const catalogLaunch = page.getByRole("dialog", { name: "2048" });
    await expect(catalogLaunch.getByText("NOT AVAILABLE")).toBeVisible();
    if (!profileId) await expect(catalogLaunch.getByText("Select a saved profile in Profiles before launching an installed game.")).toBeVisible();
    await catalogLaunch.getByRole("button", { name: /Exit/ }).click();
    await page.getByRole("button", { name: "Imported games", exact: true }).click();
    await page.locator('[data-launcher-view="retro-library"] [data-library-index="0"]').click();
    const importedLaunch = page.getByRole("dialog", { name: "Imported NES game" });
    await expect(importedLaunch.getByText("NOT AVAILABLE")).toBeVisible();
    if (!profileId) {
      await expect(importedLaunch.getByText("Select a saved profile in Profiles before launching an installed game.")).toBeVisible();
      expect(posted).toEqual([]);
    } else {
      expect(posted.map(({ gameId, profileId: selected, entryId }) => ({ gameId, profileId: selected, entryId }))).toEqual([
        { gameId: "retro-2048", profileId, entryId: undefined },
        { gameId: "nes-library", profileId, entryId: entries[0]!.entryId },
      ]);
    }
  });
}

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
