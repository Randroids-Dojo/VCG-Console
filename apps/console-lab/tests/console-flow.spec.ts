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
  const canonicalMuseumCatalog = page.getByLabel("Canonical museum catalog");
  await expect(canonicalMuseumCatalog.getByText("VibeBots")).toBeVisible();
  await expect(canonicalMuseumCatalog.getByText("Mi Casa Es Su Casa")).toBeVisible();
  await expect(canonicalMuseumCatalog.getByText("Determined")).toBeVisible();
  await page.getByRole("button", { name: /Enter the museum/ }).click();
  await expect(page.getByRole("dialog", { name: "VibeCoded Museum" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open museum/ })).toHaveAttribute("href", "https://vibecoded.games");
  await page.getByRole("button", { name: /Exit/ }).click();
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
  await expect(page.getByText("Installed retro catalog unavailable")).toBeVisible();

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

test("one launch screen represents every adapter without inventing progress", async ({ page }) => {
  await page.goto("/?skipBoot=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Developer", exact: true }).click();
  const previews = page.locator(".launch-preview");

  const localPreview = previews.getByRole("button", { name: "Local web", exact: true });
  await localPreview.click();
  const localLaunch = page.getByRole("dialog", { name: "Obstacle" });
  await expect(localLaunch).toHaveAttribute("data-launch-adapter", "local-web");
  await expect(localLaunch.getByRole("progressbar", { name: "Launch progress" })).toHaveAttribute("aria-valuenow", "67");
  await expect(localLaunch.getByText("Console controls reserved")).toBeVisible();
  await page.waitForTimeout(220);
  await page.screenshot({ path: "../../test-results/console-lab/launch-state-local.png" });
  await page.keyboard.press("Escape");
  await expect(localPreview).toBeFocused();

  await previews.getByRole("button", { name: "Remote web", exact: true }).click();
  const remoteLaunch = page.getByRole("dialog", { name: "VibeCoded Museum" });
  await expect(remoteLaunch).toHaveAttribute("data-launch-adapter", "remote-web");
  await expect(remoteLaunch.getByRole("progressbar")).toHaveCount(0);
  await expect(remoteLaunch.getByRole("link", { name: /Open museum/ })).toHaveAttribute("href", "https://vibecoded.games");
  await remoteLaunch.getByRole("button", { name: /Exit/ }).click();

  await previews.getByRole("button", { name: "Native", exact: true }).click();
  const nativeLaunch = page.getByRole("dialog", { name: "Native game" });
  await expect(nativeLaunch).toHaveAttribute("data-launch-adapter", "native");
  await expect(nativeLaunch.getByText("NOT AVAILABLE")).toBeVisible();
  await expect(nativeLaunch.getByText(/Rust console host is not connected/)).toBeVisible();
  await nativeLaunch.getByRole("button", { name: /Exit/ }).click();

  await previews.getByRole("button", { name: "Retro", exact: true }).click();
  const retroLaunch = page.getByRole("dialog", { name: "RetroArch" });
  await expect(retroLaunch).toHaveAttribute("data-launch-adapter", "retro");
  await expect(retroLaunch.getByText("NOT AVAILABLE")).toBeVisible();
  await retroLaunch.getByRole("button", { name: /Exit/ }).click();
});

test("native launch authenticates to the Rust host before checking installed packages", async ({ page }) => {
  const token = "b".repeat(64);
  let authorization: string | undefined;
  await page.route("http://127.0.0.1:43123/v1/status", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization",
        },
      });
      return;
    }
    authorization = route.request().headers().authorization;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
      body: JSON.stringify({
        protocolVersion: "0.1.0",
        hostVersion: "0.1.0",
        target: "x86_64-windows",
        capabilities: ["launcher-shell", "process-supervision", "game-watchdog", "retroarch-plan"],
      }),
    });
  });
  await page.goto(`/?skipBoot=1#vcg-host-port=43123&vcg-host-token=${token}`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Developer", exact: true }).click();
  await page.locator(".launch-preview").getByRole("button", { name: "Native", exact: true }).click();

  const launch = page.getByRole("dialog", { name: "Native game" });
  await expect(launch.getByText("NOT AVAILABLE")).toBeVisible();
  await expect(launch.getByText(/Rust host connected.*no trusted installed package/)).toBeVisible();
  await launch.getByRole("button", { name: /Details/ }).click();
  await expect(launch.getByText("PACKAGE_NOT_INSTALLED")).toBeVisible();
  expect(authorization).toBe(`Bearer ${token}`);
});

test("retro launch submits only signed package and profile intent to the host", async ({ page }) => {
  const token = "c".repeat(64);
  let installedVersion = "0.9.0";
  let packageVersion = "0.9.0";
  let packageGeneration = 6;
  const observed: Array<{
    url: string;
    method: string;
    authorization: string | undefined;
    body?: unknown;
  }> = [];
  await page.route("http://127.0.0.1:43124/v1/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
      return;
    }
    const entry: (typeof observed)[number] = {
      url: request.url(),
      method: request.method(),
      authorization: request.headers().authorization,
    };
    if (request.method() === "POST") {
      entry.body = request.postDataJSON();
    }
    observed.push(entry);

    let status = 200;
    let body: unknown;
    if (request.url().endsWith("/v1/status")) {
      body = {
          protocolVersion: "0.1.0",
          hostVersion: "0.1.0",
          target: "x86_64-windows",
          capabilities: [
            "launcher-shell",
            "retroarch-plan",
            "trusted-package-catalog",
            "trusted-package-launch",
          ],
      };
    } else if (request.url().endsWith("/v1/packages")) {
      body = {
        protocolVersion: "0.1.0",
        catalogGeneration: 7,
        packages: [
          {
            id: "retro-2048",
            version: installedVersion,
            runtime: "libretro",
          },
          {
            id: "secret-diagnostic",
            version: "1.0.0",
            runtime: "libretro",
          },
        ],
      };
    } else if (request.url().includes("/v1/packages/")) {
      body = {
        id: "retro-2048",
        version: packageVersion,
        runtime: "libretro",
        catalogGeneration: packageGeneration,
      };
    } else {
      const intent = request.postDataJSON() as {
        requestId: string;
        gameId: string;
        profileId: string;
      };
      status = 422;
      body = {
        protocolVersion: "0.1.0",
        requestId: intent.requestId,
        gameId: intent.gameId,
        profileId: intent.profileId,
        state: "failed",
        sequence: 2,
        detailCode: "PROCESS_START_FAILED",
        replayed: false,
        exitCode: null,
      };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
      body: JSON.stringify(body),
    });
  });

  await page.goto(`/?skipBoot=1#vcg-host-port=43124&vcg-host-token=${token}`);
  await page.getByRole("button", { name: "Retro", exact: true }).click();
  await expect(page.getByRole("button", { name: /2048.*Candidate/ })).toBeVisible();
  await expect(page.getByText("No retro packages installed")).toBeVisible();
  await page.getByRole("button", { name: /2048 Contentless public-domain core/ }).click();
  const mismatchedLaunch = page.getByRole("dialog", { name: "2048" });
  await expect(mismatchedLaunch.getByText("NOT AVAILABLE")).toBeVisible();
  await mismatchedLaunch.getByRole("button", { name: /Details/ }).click();
  await expect(mismatchedLaunch.getByText("PACKAGE_RELEASE_MISMATCH")).toBeVisible();
  expect(observed.some(({ method }) => method === "POST")).toBe(false);
  await mismatchedLaunch.getByRole("button", { name: /Exit/ }).click();

  installedVersion = "qualification-candidate-2026-07-23";
  observed.length = 0;
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Retro", exact: true }).click();
  await expect(page.getByRole("button", { name: /2048.*Installed/ })).toBeVisible();
  await expect(page.locator(".home-status")).toContainText("1 signed package installed");
  await expect(page.getByText("secret-diagnostic")).toHaveCount(0);
  await page.getByRole("button", { name: /2048 Contentless public-domain core/ }).click();

  const launch = page.getByRole("dialog", { name: "2048" });
  await expect(launch.getByText("NOT AVAILABLE")).toBeVisible();
  await launch.getByRole("button", { name: /Details/ }).click();
  await expect(launch.getByText("PACKAGE_RELEASE_MISMATCH")).toBeVisible();
  expect(observed.some(({ method }) => method === "POST")).toBe(false);

  packageVersion = "qualification-candidate-2026-07-23";
  packageGeneration = 7;
  observed.length = 0;
  await launch.getByRole("button", { name: /Retry/ }).click();
  await expect(launch.getByText("STOPPED")).toBeVisible();
  await expect(
    launch.getByText("The host could not start the verified package"),
  ).toBeVisible();
  await expect(launch.getByText("PROCESS_START_FAILED")).toBeVisible();
  expect(observed.map(({ url, method }) => ({ url, method }))).toEqual([
    { url: "http://127.0.0.1:43124/v1/status", method: "GET" },
    {
      url: "http://127.0.0.1:43124/v1/packages/retro-2048",
      method: "GET",
    },
    { url: "http://127.0.0.1:43124/v1/status", method: "GET" },
    { url: "http://127.0.0.1:43124/v1/launches", method: "POST" },
  ]);
  expect(observed.every(({ authorization }) => authorization === `Bearer ${token}`)).toBe(true);
  expect(observed.at(-1)?.body).toMatchObject({
    protocolVersion: "0.1.0",
    gameId: "retro-2048",
    profileId: "profile-randy",
  });
  expect(String((observed.at(-1)?.body as { requestId?: string })?.requestId)).toMatch(
    /^[0-9a-f]{32}$/,
  );
  expect(JSON.stringify(observed)).not.toMatch(
    /sha256|frontend|core|config|path|program|command|environment|root/i,
  );
});

test("launch supervision distinguishes faults and recovers through retry", async ({ page }) => {
  await page.goto("/?skipBoot=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Developer", exact: true }).click();
  const recovery = page.locator(".launch-preview").nth(1);

  await recovery.getByRole("button", { name: "Slow", exact: true }).click();
  const slow = page.getByRole("dialog", { name: "Obstacle" });
  await expect(slow.getByText("TAKING LONGER")).toBeVisible();
  await expect(slow.getByText(/keep waiting or go back/)).toBeVisible();
  await slow.getByRole("button", { name: /Details/ }).click();
  await expect(slow.getByText("LAUNCH_SLOW")).toBeVisible();
  await slow.getByRole("button", { name: /Exit/ }).click();

  await recovery.getByRole("button", { name: "Offline", exact: true }).click();
  const offline = page.getByRole("dialog", { name: "Obstacle" });
  await expect(offline.getByText("OFFLINE")).toBeVisible();
  await expect(offline.getByText("Network disconnected before handoff")).toBeVisible();
  await offline.getByRole("button", { name: /Retry/ }).click();
  await expect(offline.getByText("RECOVERED", { exact: true })).toBeVisible();
  await expect(offline.getByText("Launch recovered and is ready")).toBeVisible();
  await offline.getByRole("button", { name: /Exit/ }).click();

  await recovery.getByRole("button", { name: "Hung", exact: true }).click();
  const hung = page.getByRole("dialog", { name: "Obstacle" });
  await expect(hung.getByText("NOT RESPONDING")).toBeVisible();
  await hung.getByRole("button", { name: /Details/ }).click();
  await expect(hung.getByText("HEARTBEAT_TIMEOUT")).toBeVisible();
  await hung.getByRole("button", { name: /Exit/ }).click();

  await recovery.getByRole("button", { name: "Crashed", exact: true }).click();
  const crashed = page.getByRole("dialog", { name: "Obstacle" });
  await expect(crashed.getByText("STOPPED")).toBeVisible();
  await expect(crashed.getByText("Game process exited with code 137")).toBeVisible();
  await crashed.getByRole("button", { name: /Details/ }).click();
  await expect(crashed.getByText("PROCESS_EXIT_137")).toBeVisible();
  await page.waitForTimeout(220);
  await page.screenshot({ path: "../../test-results/console-lab/launch-state-crashed.png" });
  await crashed.getByRole("button", { name: /Exit/ }).click();

  await recovery.getByRole("button", { name: "Recovered", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Obstacle" }).getByText("RECOVERED", { exact: true })).toBeVisible();
});

test("museum launch uses the real browser network state and retries", async ({ page, context }) => {
  await page.goto("/?skipBoot=1");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Museum", exact: true }).click();
  await page.getByRole("button", { name: /Enter the museum/ }).click();
  const launch = page.getByRole("dialog", { name: "VibeCoded Museum" });
  await expect(launch.getByText("OFFLINE", { exact: true })).toBeVisible();
  await expect(launch.getByText("No network connection")).toBeVisible();

  await context.setOffline(false);
  await launch.getByRole("button", { name: /Retry/ }).click();
  await expect(launch.getByText("RECOVERED", { exact: true })).toBeVisible();
  await expect(launch.getByRole("link", { name: /Open museum/ })).toHaveAttribute("href", "https://vibecoded.games");
});

test("universal search traps focus and restores its opener", async ({ page }) => {
  await page.goto("/?skipBoot=1");
  await page.getByRole("button", { name: "Retro", exact: true }).click();
  const trigger = page.getByRole("button", { name: /Search games/ });
  await trigger.focus();
  await trigger.click();
  const input = page.locator("#universal-search");
  await expect(input).toBeFocused();
  await input.fill("retroarch");
  const result = page.getByRole("button", { name: /RetroArch Retro library/ });
  await result.focus();
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(result).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("heading", { name: /One library/ })).toBeVisible();
});

test("retro candidate remains visibly uninstalled and guards the host handoff", async ({ page }) => {
  await page.goto("/?skipBoot=1");
  await page.getByRole("button", { name: "Retro", exact: true }).click();
  await expect(page.getByText("Installed retro catalog unavailable")).toBeVisible();
  await page.getByRole("button", { name: /2048 Contentless public-domain core/ }).click();
  const launch = page.getByRole("dialog", { name: "2048" });
  await expect(launch).toHaveAttribute("data-launch-adapter", "retro");
  await expect(launch.getByText("NOT AVAILABLE")).toBeVisible();
  await expect(
    launch.getByText("The selected release is not present in the current signed package inventory"),
  ).toBeVisible();
  await launch.getByRole("button", { name: /Exit/ }).click();

  await page.getByRole("button", { name: /Search games/ }).click();
  await page.locator("#universal-search").fill("2048");
  await expect(page.getByRole("button", { name: /2048 Retro qualification candidate/ })).toBeVisible();
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

test("launch screen remains purposeful on a narrow display", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?skipBoot=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Developer", exact: true }).click();
  await page.getByRole("button", { name: "Local web", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Obstacle" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Back/ })).toBeVisible();
  await page.waitForTimeout(220);
  await page.screenshot({ path: "../../test-results/console-lab/launch-state-mobile.png", fullPage: true });
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

  await page.getByRole("button", { name: "STOP CAMERA" }).click();
  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.locator("#health-badge")).toHaveText("LIVE", { timeout: 15_000 });
  await expect(page.locator("#metric-tracker")).toContainText("WORKER", { timeout: 15_000 });
});

test("normal camera mode stores and transmits no raw frames", async ({ page }) => {
  const requests: Array<{ method: string; url: string; postData: string | null }> = [];
  page.on("request", (request) => {
    requests.push({ method: request.method(), url: request.url(), postData: request.postData() });
  });

  await openMotionLab(page);
  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.locator("#health-badge")).toHaveText("LIVE", { timeout: 15_000 });
  await expect(page.locator("#metric-trace")).not.toHaveText("0", { timeout: 15_000 });
  await page.getByRole("button", { name: "STOP CAMERA" }).click();

  const persistence = await page.evaluate(async () => ({
    localStorageKeys: Object.keys(localStorage),
    sessionStorageKeys: Object.keys(sessionStorage),
    indexedDatabases: typeof indexedDB.databases === "function" ? (await indexedDB.databases()).map((database) => database.name ?? "unnamed") : [],
    cacheNames: await caches.keys(),
    serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  const applicationOrigin = new URL(page.url()).origin;
  const externalRequests = requests.filter((request) => new URL(request.url).origin !== applicationOrigin);
  const mutatingRequests = requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method));
  const suspiciousQueryRequests = requests.filter((request) => /[?&](frame|image|video|pixels|blob)=/i.test(new URL(request.url).search));

  expect(externalRequests).toEqual([]);
  expect(mutatingRequests).toEqual([]);
  expect(suspiciousQueryRequests).toEqual([]);
  expect(requests.some((request) => request.postData !== null)).toBe(false);
  expect(persistence).toEqual({
    localStorageKeys: [],
    sessionStorageKeys: [],
    indexedDatabases: [],
    cacheNames: [],
    serviceWorkers: 0,
  });
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
