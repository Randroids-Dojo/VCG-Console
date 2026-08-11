import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openMotionLab(page: Page, simulatorTest = false): Promise<void> {
  await page.goto(`/?skipBoot=1${simulatorTest ? "&motionSimulatorTest=1" : ""}`);
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: /Motion Lab Skeleton/ }).click();
}

async function pressSyntheticGamepadButton(
  page: Page,
  setterName: string,
  button: number,
): Promise<void> {
  await page.evaluate(
    ({ setterName: name, button: pressed }) => {
      (window as unknown as Record<string, (buttons: number[]) => void>)[name]?.([pressed]);
    },
    { setterName, button },
  );
  await page.waitForTimeout(50);
  await page.evaluate((name) => {
    (window as unknown as Record<string, (buttons: number[]) => void>)[name]?.([]);
  }, setterName);
  await page.waitForTimeout(50);
}

async function installSyntheticStandardGamepad(
  page: Page,
  setterName: string,
  id: string,
): Promise<void> {
  await page.addInitScript(
    ({ name, gamepadId }) => {
      let gamepad: Gamepad | null = null;
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        value: () => [gamepad],
      });
      (
        window as unknown as Record<string, (buttons: number[]) => void>
      )[name] = (buttons) => {
        gamepad = {
          axes: [0, 0],
          buttons: Array.from({ length: 17 }, (_, index) => ({
            pressed: buttons.includes(index),
            touched: buttons.includes(index),
            value: buttons.includes(index) ? 1 : 0,
          })),
          connected: true,
          hapticActuators: [],
          id: gamepadId,
          index: 0,
          mapping: "standard",
          timestamp: performance.now(),
          vibrationActuator: null,
        } as unknown as Gamepad;
      };
    },
    { name: setterName, gamepadId: id },
  );
}

test("boots into a purposeful launcher", async ({ page }) => {
  await page.goto("/?holdBoot=1");
  await expect(page.locator("#boot-screen")).toBeVisible();
  await expect(page.locator("#boot-status")).toHaveText("SYSTEM READY", { timeout: 2_000 });
  await page.screenshot({ path: "../../test-results/console-lab/boot-screen.png" });
});

test("rehearses display and audio settings without claiming hardware authority", async ({
  page,
}) => {
  await installSyntheticStandardGamepad(
    page,
    "__setAvSettingsGamepad",
    "Playwright display and audio controller",
  );
  await page.addInitScript(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let mediaRequests = 0;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: (...args: Parameters<typeof getUserMedia>) => {
        mediaRequests += 1;
        return getUserMedia(...args);
      },
    });
    (
      window as unknown as { __avSettingsMediaRequests: () => number }
    ).__avSettingsMediaRequests = () => mediaRequests;
  });
  await page.goto("/?skipBoot=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Display", exact: true }).click();
  const displayPanel = page.locator('[data-settings-panel="display"]');
  await expect(displayPanel.getByText("No display service is connected")).toBeVisible();
  await expect(displayPanel.getByText("NOT ENUMERATED")).toBeVisible();
  const safePreview = displayPanel.locator(".display-safe-preview");
  await expect(safePreview).toHaveAttribute("data-safe-area-guide", "hidden");
  await displayPanel.getByRole("button", { name: "Show 5% guide" }).focus();
  await pressSyntheticGamepadButton(page, "__setAvSettingsGamepad", 0);
  await expect(safePreview).toHaveAttribute("data-safe-area-guide", "visible");
  await page.screenshot({
    path: "../../test-results/console-lab/display-settings.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Audio", exact: true }).click();
  const audioPanel = page.locator('[data-settings-panel="audio"]');
  await expect(audioPanel.getByText("No audio service is connected")).toBeVisible();
  await expect(audioPanel.getByText("SYSTEM DEFAULT / UNVERIFIED")).toBeVisible();
  await expect(audioPanel.getByText("NOT REQUESTED")).toBeVisible();
  await audioPanel.getByRole("button", { name: "Quiet", exact: true }).focus();
  await pressSyntheticGamepadButton(page, "__setAvSettingsGamepad", 0);
  await expect(audioPanel.getByRole("button", { name: "Quiet", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await audioPanel.getByRole("button", { name: "Play local test cue" }).click();
  await expect(page.locator("#launcher-toast")).toHaveText(
    "Quiet audio cue played locally.",
  );
  expect(await page.evaluate(() =>
    (
      window as unknown as { __avSettingsMediaRequests: () => number }
    ).__avSettingsMediaRequests(),
  )).toBe(0);
  await page.screenshot({
    path: "../../test-results/console-lab/display-audio-settings.png",
    fullPage: true,
  });
  await pressSyntheticGamepadButton(page, "__setAvSettingsGamepad", 1);
  await expect(page.getByRole("heading", { name: /Good evening/ })).toBeVisible();
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
  const museumEntry = page.getByRole("button", { name: /Enter the museum/ });
  const museumEntryIcon = museumEntry.locator(".ui-icon-arrow-up-right");
  await expect(museumEntryIcon).toHaveAttribute("aria-hidden", "true");
  await expect(museumEntryIcon).toHaveText("");
  await museumEntry.click();
  await expect(page.getByRole("dialog", { name: "VibeCoded Museum" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open unsupervised preview" }),
  ).toBeVisible();
  await expect(
    page.getByText(/reachability and containment are not verified/),
  ).toBeVisible();
  await page.getByRole("button", { name: /Exit/ }).click();
  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  await page.getByRole("button", { name: /Guest Local guest/ }).click();
  await expect(page.locator("#active-profile-name")).toHaveText("Guest");
  await page.getByRole("button", { name: "Manage selected profile" }).click();
  await page.locator("#managed-profile-name").fill("Guest Two");
  await page.getByRole("button", { name: "Save display name" }).click();
  await expect(page.locator("#active-profile-name")).toHaveText("Guest Two");
  const management = page.locator('[data-launcher-view="profile-management"]');
  const profileBack = management.getByRole("button", {
    name: "Profiles",
    exact: true,
  });
  await expect(profileBack.locator(".ui-icon-arrow-left")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(profileBack.locator(".ui-icon-arrow-left")).toHaveText("");
  await profileBack.click();
  await page.getByRole("button", { name: /Create profile New local player/ }).click();
  await page.locator("#managed-profile-name").fill("Player Three");
  await page.getByRole("button", { name: "Create local profile" }).click();
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
  const retroEmptyMark = page.locator(".empty-library .empty-glyph");
  await expect(retroEmptyMark).toHaveText("");
  await expect(retroEmptyMark).toHaveAttribute("aria-hidden", "true");

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

  const operatingMode = page.locator(".operating-mode");
  await expect(operatingMode).toHaveAttribute("data-operating-mode", "family");
  await expect(operatingMode.getByText("Developer deployment is blocked")).toBeVisible();
  await operatingMode.getByRole("button", { name: "Request admin access" }).click();
  await expect(operatingMode.getByText("Confirm local administration")).toBeVisible();
  await operatingMode.getByRole("button", { name: "Confirm admin access" }).click();
  await expect(operatingMode).toHaveAttribute("data-operating-mode", "admin");
  await expect(operatingMode.getByText("Developer transport remains blocked")).toBeVisible();
  await operatingMode.getByRole("button", { name: "Enable developer mode" }).click();
  await expect(operatingMode.getByText("Enable temporary developer mode?")).toBeVisible();
  await operatingMode.getByRole("button", { name: "Confirm developer mode" }).click();
  await expect(operatingMode).toHaveAttribute("data-operating-mode", "developer");
  await expect(operatingMode.getByText("Pairing service not connected")).toBeVisible();
  await page.screenshot({ path: "../../test-results/console-lab/developer-mode.png" });
  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  await page.getByRole("button", { name: /Guest Two Local guest/ }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(operatingMode).toHaveAttribute("data-operating-mode", "family");
});

test("unassigned progress requires deliberate controller-safe claim and deletion", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let gamepad: Gamepad | null = null;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    });
    (
      window as unknown as Record<string, (buttons: number[]) => void>
    ).__setUnassignedGamepad = (buttons) => {
      gamepad = {
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: buttons.includes(index),
          touched: buttons.includes(index),
          value: buttons.includes(index) ? 1 : 0,
        })),
        connected: true,
        hapticActuators: [],
        id: "Playwright unassigned-progress controller",
        index: 0,
        mapping: "standard",
        timestamp: performance.now(),
        vibrationActuator: null,
      } as unknown as Gamepad;
    };
  });
  await page.goto("/?skipBoot=1");
  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  await page.getByRole("button", { name: /Unassigned progress 4/ }).click();

  const view = page.locator('[data-launcher-view="unassigned"]');
  await expect(
    view.getByRole("heading", { name: "Progress without a profile." }),
  ).toBeVisible();
  await expect(view.getByText("Prototype sample data")).toBeVisible();
  await expect(view.getByRole("button", { name: /Obstacle/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const claim = view.getByRole("button", { name: "Claim to profile" });
  await claim.focus();
  await pressSyntheticGamepadButton(page, "__setUnassignedGamepad", 0);
  await expect(
    page.getByRole("dialog", { name: /Who should receive Obstacle/ }),
  ).toBeVisible();
  const chooseProfileDialog = page.getByRole("dialog");
  await expect(
    chooseProfileDialog.getByRole("button", { name: /Randy/ }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    chooseProfileDialog.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    chooseProfileDialog.getByRole("button", { name: /Randy/ }),
  ).toBeFocused();
  await pressSyntheticGamepadButton(page, "__setUnassignedGamepad", 15);
  await expect(
    page.getByRole("dialog").getByRole("button", { name: /Guest/ }),
  ).toBeFocused();
  await pressSyntheticGamepadButton(page, "__setUnassignedGamepad", 1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(claim).toBeFocused();

  await claim.click();
  await page.getByRole("dialog").getByRole("button", { name: /Randy/ }).click();
  const conflict = page.getByRole("dialog", {
    name: "Randy already has this slot.",
  });
  await expect(conflict.getByText(/Nothing changes until/)).toBeVisible();
  await conflict
    .getByRole("button", { name: /Keep current profile progress/ })
    .click();
  await expect(view.getByRole("button", { name: /Obstacle/ })).toBeVisible();

  await claim.click();
  await page.getByRole("dialog").getByRole("button", { name: /Guest/ }).click();
  const claimConfirmation = page.getByRole("dialog", {
    name: /Claim Checkpoint 12 to Guest/,
  });
  await claimConfirmation.getByRole("button", { name: "Confirm claim" }).click();
  await expect(view.getByRole("button", { name: /Obstacle/ })).toHaveCount(0);
  await expect(
    view.getByRole("button", { name: /Godot Motion Game/ }),
  ).toBeFocused();
  await expect(page.locator("#launcher-toast")).toContainText(
    "Prototype claim completed",
  );
  const toastBox = await page.locator("#launcher-toast").boundingBox();
  expect(toastBox).not.toBeNull();
  expect((toastBox?.x ?? 0) + (toastBox?.width ?? 0)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );

  await view.getByRole("button", { name: /VibeBots/ }).click();
  await expect(
    view.getByText(/account or service data is separate/),
  ).toBeVisible();
  const deleteButton = view.getByRole("button", { name: "Delete permanently" });
  await deleteButton.click();
  const deletion = page.getByRole("dialog", {
    name: /Delete VibeBots/,
  });
  await expect(deletion.getByText(/Hosted-service account data remains separate/)).toBeVisible();
  await pressSyntheticGamepadButton(page, "__setUnassignedGamepad", 1);
  await expect(deletion).toHaveCount(0);
  await expect(view.getByRole("button", { name: /VibeBots/ })).toBeVisible();

  await deleteButton.click();
  await page
    .getByRole("dialog", { name: /Delete VibeBots/ })
    .getByRole("button", { name: "Delete this progress" })
    .click();
  await expect(view.getByRole("button", { name: /VibeBots/ })).toHaveCount(0);
  await expect(
    view.getByRole("button", { name: /Godot Motion Game/ }),
  ).toBeFocused();
  await page.screenshot({
    path: "../../test-results/console-lab/unassigned-progress.png",
  });
  await view.getByRole("button", { name: "Profiles" }).click();
  await expect(
    page.getByRole("button", { name: /Unassigned progress 2/ }),
  ).toBeVisible();
  await page.setViewportSize({ width: 520, height: 900 });
  await page.getByRole("button", { name: /Unassigned progress 2/ }).click();
  await expect(
    page.getByRole("heading", { name: "Progress without a profile." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("triggered motion shell actions navigate and safely leave unassigned progress", async ({
  page,
}) => {
  await page.goto("/?skipBoot=1&motionSimulatorTest=1");
  await page.waitForTimeout(850);
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("hands-together"));
  await page.waitForTimeout(550);
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
  await page.waitForTimeout(750);

  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  await page.getByRole("button", { name: /Unassigned progress 4/ }).click();
  const view = page.locator('[data-launcher-view="unassigned"]');
  const first = view.getByRole("button", { name: /Obstacle/ });
  const second = view.getByRole("button", { name: /Godot Motion Game/ });
  await expect(first).toBeFocused();

  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("swipe-right"));
  await expect(second).toBeFocused({ timeout: 1_500 });
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
  await page.waitForTimeout(750);

  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("hands-together"));
  await expect(second).toHaveAttribute("aria-pressed", "true", {
    timeout: 1_500,
  });
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
  await page.waitForTimeout(750);

  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("crossed-arms"));
  await expect(
    page.getByRole("heading", { name: "Who is playing?" }),
  ).toBeVisible({ timeout: 1_500 });
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
});

test("synthetic portrait rehearsal requires preview acceptance and never opens the camera", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let gamepad: Gamepad | null = null;
    let cameraCalls = 0;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    });
    (
      window as unknown as Record<string, (buttons: number[]) => void>
    ).__setPortraitGamepad = (buttons) => {
      gamepad = {
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: buttons.includes(index),
          touched: buttons.includes(index),
          value: buttons.includes(index) ? 1 : 0,
        })),
        connected: true,
        hapticActuators: [],
        id: "Playwright portrait controller",
        index: 0,
        mapping: "standard",
        timestamp: performance.now(),
        vibrationActuator: null,
      } as unknown as Gamepad;
    };
    const originalGetUserMedia =
      navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: (...constraints: Parameters<typeof originalGetUserMedia>) => {
        cameraCalls += 1;
        return originalGetUserMedia(...constraints);
      },
    });
    (
      window as unknown as Record<string, () => number>
    ).__portraitCameraCalls = () => cameraCalls;
  });
  await page.goto("/?skipBoot=1&motionSimulatorTest=1");
  await page.waitForTimeout(850);
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("hands-together"));
  await page.waitForTimeout(550);
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
  await page.waitForTimeout(750);

  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  const profileTile = page.locator('[data-profile="Randy"]');
  await page.locator("#capture-profile-portrait").click();
  const portraitView = page.locator('[data-launcher-view="portrait"]');
  await expect(
    portraitView.getByRole("heading", { name: "Choose the image deliberately." }),
  ).toBeVisible();
  await expect(
    portraitView.getByText("Camera off · synthetic fixture only"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as Record<string, () => number>
        ).__portraitCameraCalls!(),
    ),
  ).toBe(0);

  await portraitView
    .getByRole("button", { name: "Start 3-second rehearsal" })
    .click();
  await expect(
    portraitView.getByRole("heading", {
      name: "Fixture appears after the countdown.",
    }),
  ).toBeVisible();
  const firstPreview = portraitView.getByRole("img", {
    name: "Synthetic portrait preview for Randy",
  });
  await expect(firstPreview).toBeVisible({ timeout: 5_000 });
  await page.screenshot({
    path: "../../test-results/console-lab/synthetic-portrait-preview.png",
  });
  await pressSyntheticGamepadButton(page, "__setPortraitGamepad", 1);
  await expect(profileTile.locator(".synthetic-portrait")).toHaveCount(0);

  await page.locator("#capture-profile-portrait").click();
  await portraitView
    .getByRole("button", { name: "Start 3-second rehearsal" })
    .click();
  await expect(firstPreview).toBeVisible({ timeout: 5_000 });
  await expect(
    portraitView.getByRole("button", { name: "Use synthetic portrait" }),
  ).toBeFocused();
  await pressSyntheticGamepadButton(page, "__setPortraitGamepad", 0);
  await expect(profileTile.locator(".synthetic-portrait")).toHaveCount(1);
  await expect(profileTile.locator(".synthetic-portrait")).toHaveText("");
  const acceptedHandle = await profileTile
    .locator(".synthetic-portrait")
    .getAttribute("data-portrait-handle");

  await page.locator("#capture-profile-portrait").click();
  await portraitView
    .getByRole("button", { name: "Start 3-second rehearsal" })
    .click();
  await expect(firstPreview).toBeVisible({ timeout: 5_000 });
  await portraitView.getByRole("button", { name: "Retake" }).click();
  await expect(firstPreview).toBeVisible({ timeout: 5_000 });
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("hands-together"));
  await expect(
    page.getByRole("heading", { name: "Who is playing?" }),
  ).toBeVisible({ timeout: 1_500 });
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
  await expect(profileTile.locator(".synthetic-portrait")).not.toHaveAttribute(
    "data-portrait-handle",
    acceptedHandle ?? "",
  );
  const replacementHandle = await profileTile
    .locator(".synthetic-portrait")
    .getAttribute("data-portrait-handle");
  expect(replacementHandle).not.toBe(acceptedHandle);

  await page.locator("#capture-profile-portrait").click();
  await portraitView
    .getByRole("button", { name: "Start 3-second rehearsal" })
    .click();
  await pressSyntheticGamepadButton(page, "__setPortraitGamepad", 16);
  await expect(
    page.getByRole("heading", { name: /Good evening/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  await expect(profileTile.locator(".synthetic-portrait")).toHaveAttribute(
    "data-portrait-handle",
    replacementHandle ?? "",
  );
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as Record<string, () => number>
        ).__portraitCameraCalls!(),
    ),
  ).toBe(0);
  await page.screenshot({
    path: "../../test-results/console-lab/synthetic-portrait-profile.png",
  });
  await page.setViewportSize({ width: 520, height: 900 });
  await page.locator("#capture-profile-portrait").click();
  await expect(
    portraitView.getByRole("heading", { name: "Choose the image deliberately." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await portraitView.getByRole("button", { name: "Cancel" }).click();
});

test("credential-free profile management gates destructive scope and never reassigns by name", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let gamepad: Gamepad | null = null;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    });
    (
      window as unknown as Record<string, (buttons: number[]) => void>
    ).__setProfileManagementGamepad = (buttons) => {
      gamepad = {
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: buttons.includes(index),
          touched: buttons.includes(index),
          value: buttons.includes(index) ? 1 : 0,
        })),
        connected: true,
        hapticActuators: [],
        id: "Playwright profile-management controller",
        index: 0,
        mapping: "standard",
        timestamp: performance.now(),
        vibrationActuator: null,
      } as unknown as Gamepad;
    };
  });
  await page.goto("/?skipBoot=1&motionSimulatorTest=1");
  await page.waitForTimeout(850);
  await page.evaluate(() =>
    window.__vcgMotionSimulator?.setPose("hands-together")
  );
  await page.waitForTimeout(550);
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
  await page.waitForTimeout(750);

  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  const randyTile = page.locator('[data-profile="Randy"]');
  await page.locator("#capture-profile-portrait").click();
  const portraitView = page.locator('[data-launcher-view="portrait"]');
  await portraitView
    .getByRole("button", { name: "Start 3-second rehearsal" })
    .click();
  await expect(
    portraitView.getByRole("img", {
      name: "Synthetic portrait preview for Randy",
    }),
  ).toBeVisible({ timeout: 5_000 });
  await portraitView
    .getByRole("button", { name: "Use synthetic portrait" })
    .click();
  await expect(randyTile.locator(".synthetic-portrait")).toHaveCount(1);

  await page.getByRole("button", { name: "Manage selected profile" }).click();
  const management = page.locator(
    '[data-launcher-view="profile-management"]',
  );
  await expect(
    management.getByRole("heading", { name: "Manage Randy." }),
  ).toBeVisible();
  await expect(
    management.getByText(
      "No password · no administrator · synthetic state only",
    ),
  ).toBeVisible();
  await expect(management.locator('input[type="password"]')).toHaveCount(0);
  await expect(
    management.getByText("2 linked items"),
  ).toBeVisible();
  await expect(
    management.getByText("1 separate service"),
  ).toBeVisible();
  await page.screenshot({
    path: "../../test-results/console-lab/profile-management.png",
  });

  await management
    .getByRole("button", { name: /Reset local identity data/ })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Reset local identity data?",
  });
  await expect(dialog.getByRole("button", {
    name: "Keep profile",
  })).toBeFocused();
  await expect(dialog.getByRole("button", {
    name: "Reset identity data",
  })).toBeDisabled();
  await page.evaluate(() =>
    window.__vcgMotionSimulator?.setPose("hands-together")
  );
  await page.waitForTimeout(550);
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
  await expect(dialog).toHaveCount(0);
  await expect(
    management.getByText("Synthetic fixture present").first(),
  ).toBeVisible();

  await management
    .getByRole("button", { name: /Require recalibration/ })
    .click();
  dialog = page.getByRole("dialog", { name: "Require recalibration?" });
  await pressSyntheticGamepadButton(
    page,
    "__setProfileManagementGamepad",
    1,
  );
  await expect(dialog).toHaveCount(0);
  await expect(
    management.getByRole("heading", { name: "Manage Randy." }),
  ).toBeVisible();

  await management
    .getByRole("button", { name: /Reset local identity data/ })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Reset local identity data?",
  });
  await expect(
    dialog.getByText("Keep the profile name and all 2 linked progress items."),
  ).toBeVisible();
  await page.waitForTimeout(1_600);
  await expect(dialog.getByRole("button", {
    name: "Reset identity data",
  })).toBeEnabled();
  await pressSyntheticGamepadButton(
    page,
    "__setProfileManagementGamepad",
    15,
  );
  await pressSyntheticGamepadButton(
    page,
    "__setProfileManagementGamepad",
    0,
  );
  await expect(dialog).toHaveCount(0);
  await expect(
    management.getByText("None", { exact: true }),
  ).toBeVisible();
  await expect(
    management.getByText("Required", { exact: true }),
  ).toBeVisible();
  await expect(
    management.getByText("Not configured", { exact: true }),
  ).toBeVisible();

  await management
    .getByRole("button", { name: /Delete local profile/ })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Delete this local profile?",
  });
  await expect(
    dialog.getByText(
      "Preserve 2 qualified console-managed progress items as unassigned local data.",
    ),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      "1 hosted service remains separate and is not deleted by VCG.",
    ),
  ).toBeVisible();
  await page.screenshot({
    path: "../../test-results/console-lab/profile-management-delete-review.png",
  });
  await expect(dialog.getByRole("button", {
    name: "Delete profile",
  })).toBeDisabled();
  await page.evaluate(() =>
    window.__vcgMotionSimulator?.setPose("hands-together")
  );
  await page.waitForTimeout(550);
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
  await expect(dialog).toHaveCount(0);
  await expect(
    management.getByRole("heading", { name: "Manage Randy." }),
  ).toBeVisible();

  await management
    .getByRole("button", { name: /Delete local profile/ })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Delete this local profile?",
  });
  await page.waitForTimeout(1_600);
  await expect(dialog.getByRole("button", {
    name: "Delete profile",
  })).toBeEnabled();
  await pressSyntheticGamepadButton(
    page,
    "__setProfileManagementGamepad",
    15,
  );
  await page.evaluate(() =>
    window.__vcgMotionSimulator?.setPose("hands-together")
  );
  await page.waitForTimeout(550);
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
  await expect(
    page.getByRole("heading", { name: "Who is playing?" }),
  ).toBeVisible();
  await expect(page.locator('[data-profile="Randy"]')).toHaveCount(0);
  await expect(page.locator("#active-profile-name")).toHaveText("Guest");
  await expect(page.locator("#launcher-toast")).toContainText(
    "2 local progress items are now unassigned",
  );
  await expect(page.locator("#launcher-toast")).toContainText(
    "0 explicitly selected items were permanently deleted",
  );
  await expect(page.locator("#launcher-toast")).toContainText(
    "The separate Unassigned Progress sample list and hosted services were not changed",
  );

  await page.getByRole("button", {
    name: /Create profile New local player/,
  }).click();
  await page.locator("#managed-profile-name").fill("Randy");
  await page.getByRole("button", { name: "Create local profile" }).click();
  await expect(
    management.getByRole("heading", { name: "Manage Randy." }),
  ).toBeVisible();
  await expect(
    management.getByText("0 linked items"),
  ).toBeVisible();
  await expect(
    management.getByText("None", { exact: true }),
  ).toBeVisible();

  await management.getByRole("button", { name: /Profiles/ }).click();
  await page.locator('[data-profile="Guest"]').click();
  await page.getByRole("button", {
    name: "Manage selected profile",
  }).click();
  await expect(
    management.getByRole("heading", { name: "Manage Guest." }),
  ).toBeVisible();
  await expect(
    management.getByText(
      "Safe unlink is unavailable for this synthetic fixture.",
    ),
  ).toBeVisible();
  await expect(
    management.getByText(
      "Godot Motion Game / campaign (native)",
    ),
  ).toBeVisible();
  await expect(
    management.getByRole("button", {
      name: /Delete local profile/,
    }),
  ).toBeDisabled();
  const permanentDelete = management.getByRole("checkbox", {
    name: /Permanently delete Godot Motion Game \/ campaign \(native\)/,
  });
  await expect(permanentDelete).not.toBeChecked();
  await permanentDelete.check();
  await expect(
    management.getByText(
      "Every incompatible item is explicitly marked for permanent deletion.",
    ),
  ).toBeVisible();
  await expect(
    management.getByRole("button", {
      name: /Delete local profile/,
    }),
  ).toBeEnabled();
  await management
    .getByRole("button", { name: /Delete local profile/ })
    .click();
  const guestDeleteDialog = page.getByRole("dialog", {
    name: "Delete this local profile?",
  });
  await expect(
    guestDeleteDialog.getByText(
      /Permanently delete 1 explicitly selected console-managed progress item/,
    ),
  ).toBeVisible();
  await expect(
    guestDeleteDialog.getByText(
      "Godot Motion Game / campaign (native)",
    ),
  ).toBeVisible();
  await guestDeleteDialog.getByRole("button", {
    name: "Keep profile",
  }).click();
  await expect(
    management.getByRole("heading", { name: "Manage Guest." }),
  ).toBeVisible();
  await expect(permanentDelete).not.toBeChecked();
  await expect(permanentDelete).toBeFocused();
  await expect(
    management.getByRole("button", {
      name: /Delete local profile/,
    }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("session authority rehearsal contains synthetic household interference", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let gamepad: Gamepad | null = null;
    let cameraCalls = 0;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    });
    (
      window as unknown as Record<string, (buttons: number[]) => void>
    ).__setSessionAdversarialGamepad = (buttons) => {
      gamepad = {
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: buttons.includes(index),
          touched: buttons.includes(index),
          value: buttons.includes(index) ? 1 : 0,
        })),
        connected: true,
        hapticActuators: [],
        id: "Playwright session-authority controller",
        index: 0,
        mapping: "standard",
        timestamp: performance.now(),
        vibrationActuator: null,
      } as unknown as Gamepad;
    };
    const originalGetUserMedia =
      navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: (...constraints: Parameters<typeof originalGetUserMedia>) => {
        cameraCalls += 1;
        return originalGetUserMedia(...constraints);
      },
    });
    (
      window as unknown as Record<string, () => number>
    ).__sessionAdversarialCameraCalls = () => cameraCalls;
  });
  await page.setViewportSize({ width: 520, height: 900 });
  await page.goto("/?skipBoot=1");
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: /Session authority/ }).click();

  const view = page.locator(
    '[data-launcher-view="session-adversarial"]',
  );
  await expect(
    view.getByRole("heading", { name: "Detection is not control." }),
  ).toBeVisible();
  await expect(view.getByText("Five interference classes.")).toBeVisible();
  const interferenceMark = view.locator(".session-adversarial-notice > span");
  await expect(interferenceMark).toHaveText("");
  await expect(interferenceMark).toHaveAttribute("aria-hidden", "true");
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as Record<string, () => number>
        ).__sessionAdversarialCameraCalls!(),
    ),
  ).toBe(0);

  await view
    .getByRole("button", { name: "Run five synthetic scenarios" })
    .click();
  await expect(view.getByText("SYNTHETIC PASS")).toBeVisible();
  await expect(
    view.getByText("5 / 5 interference classes covered"),
  ).toBeVisible();
  await expect(
    view.getByRole("navigation", {
      name: "Synthetic authority scenarios",
    }).getByRole("button"),
  ).toHaveCount(5);
  await expect(
    view.locator(".session-report-metrics").getByText("FALSE JOINS"),
  ).toBeVisible();
  await expect(
    view.locator(".session-report-metrics").getByText("UNINTENDED TAKEOVERS"),
  ).toBeVisible();
  await expect(
    view.getByText("Synthetic state-machine evidence only"),
  ).toBeVisible();
  const passedCheckMark = view.locator(
    '.session-scenario-detail li[data-state="passed"] > span',
  ).first();
  await expect(passedCheckMark).toHaveText("");
  await expect(passedCheckMark).toHaveAttribute("aria-hidden", "true");

  await view
    .getByRole("button", {
      name: /A passerby cannot silently recover/,
    })
    .click();
  await expect(
    view.getByText(
      "A different visible track cannot satisfy silent reacquisition.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../../test-results/console-lab/session-authority-report.png",
    fullPage: true,
  });

  const runAgain = view.getByRole("button", { name: "Run again" });
  await runAgain.focus();
  await pressSyntheticGamepadButton(
    page,
    "__setSessionAdversarialGamepad",
    0,
  );
  await expect(view.getByText("SYNTHETIC PASS")).toBeVisible();
  await pressSyntheticGamepadButton(
    page,
    "__setSessionAdversarialGamepad",
    1,
  );
  await expect(
    page.getByRole("heading", { name: "Move to play." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as Record<string, () => number>
        ).__sessionAdversarialCameraCalls!(),
    ),
  ).toBe(0);
});

test("synthetic calibration guides failed dimensions and invalidates changed rooms", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let gamepad: Gamepad | null = null;
    let cameraCalls = 0;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    });
    (
      window as unknown as Record<string, (buttons: number[]) => void>
    ).__setCalibrationGamepad = (buttons) => {
      gamepad = {
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: buttons.includes(index),
          touched: buttons.includes(index),
          value: buttons.includes(index) ? 1 : 0,
        })),
        connected: true,
        hapticActuators: [],
        id: "Playwright calibration controller",
        index: 0,
        mapping: "standard",
        timestamp: performance.now(),
        vibrationActuator: null,
      } as unknown as Gamepad;
    };
    const originalGetUserMedia =
      navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: (...constraints: Parameters<typeof originalGetUserMedia>) => {
        cameraCalls += 1;
        return originalGetUserMedia(...constraints);
      },
    });
    (
      window as unknown as Record<string, () => number>
    ).__calibrationCameraCalls = () => cameraCalls;
  });
  await page.goto("/?skipBoot=1&motionSimulatorTest=1");
  await page.waitForTimeout(850);
  await page.evaluate(() =>
    window.__vcgMotionSimulator?.setPose("hands-together")
  );
  await page.waitForTimeout(550);
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
  await page.waitForTimeout(750);

  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  await page.getByRole("button", { name: "Manage selected profile" }).click();
  let management = page.locator(
    '[data-launcher-view="profile-management"]',
  );
  await management
    .getByRole("button", { name: /Require recalibration/ })
    .click();
  let confirmation = page.getByRole("dialog", {
    name: "Require recalibration?",
  });
  await page.waitForTimeout(1_600);
  await confirmation
    .getByRole("button", { name: "Require recalibration" })
    .click();

  const calibration = page.locator('[data-launcher-view="calibration"]');
  await expect(
    calibration.getByRole("heading", {
      name: "Show what the console understood.",
    }),
  ).toBeVisible();
  await expect(
    calibration.getByText(
      "Camera off · closed synthetic confidence fixtures",
    ),
  ).toBeVisible();
  await expect(
    calibration.getByRole("button", { name: "Feet missing" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as Record<string, () => number>
        ).__calibrationCameraCalls!(),
    ),
  ).toBe(0);

  await calibration
    .getByRole("button", { name: "Start automatic rehearsal" })
    .click();
  await expect(
    calibration.getByRole("heading", {
      name: "One short correction is needed.",
    }),
  ).toBeVisible({ timeout: 3_000 });
  await expect(
    calibration.locator(
      '[data-calibration-status="needs-check"]',
    ).filter({ hasText: "Floor" }),
  ).toContainText("Needs guided check");
  await expect(
    calibration.locator(
      '[data-calibration-status="ready"]',
    ).filter({ hasText: "Play zone" }),
  ).toContainText("Understood");
  await expect(
    calibration.getByRole("button", {
      name: "Use conservative fallback",
    }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "../../test-results/console-lab/calibration-guided.png",
  });
  await pressSyntheticGamepadButton(
    page,
    "__setCalibrationGamepad",
    1,
  );
  await expect(
    management.getByRole("heading", { name: "Manage Randy." }),
  ).toBeVisible();
  await expect(
    management.getByText("Required", { exact: true }),
  ).toBeVisible();

  await management
    .getByRole("button", { name: /Require recalibration/ })
    .click();
  confirmation = page.getByRole("dialog", {
    name: "Require recalibration?",
  });
  await page.waitForTimeout(1_600);
  await confirmation
    .getByRole("button", { name: "Require recalibration" })
    .click();
  await calibration.getByRole("button", { name: "Unsafe zone" }).click();
  await calibration
    .getByRole("button", { name: "Start automatic rehearsal" })
    .click();
  await expect(
    calibration.getByRole("heading", {
      name: "Placement is unsafe or ambiguous.",
    }),
  ).toBeVisible({ timeout: 3_000 });
  await expect(
    calibration.getByText("unsafe zone", { exact: true }),
  ).toBeVisible();
  await expect(
    calibration.getByRole("button", {
      name: "Use conservative fallback",
    }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "../../test-results/console-lab/calibration-blocked.png",
  });

  await calibration
    .getByRole("button", {
      name: "Apply safe-room fixture and recheck",
    })
    .click();
  await expect(
    calibration.getByRole("heading", {
      name: "Ready for this synthetic session.",
    }),
  ).toBeVisible({ timeout: 3_000 });
  await expect(
    calibration.getByText("All required dimensions passed."),
  ).toBeVisible();
  await calibration
    .getByRole("button", { name: "Rehearse room change" })
    .click();
  await expect(
    calibration.getByRole("heading", {
      name: "Room or camera evidence changed.",
    }),
  ).toBeVisible();
  await calibration
    .getByRole("button", { name: "Recheck changed room" })
    .click();
  await expect(
    calibration.getByRole("heading", {
      name: "Ready for this synthetic session.",
    }),
  ).toBeVisible({ timeout: 3_000 });

  await page.setViewportSize({ width: 520, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    calibration.getByRole("button", {
      name: "Use synthetic calibration",
    }),
  ).toBeFocused();
  await page.evaluate(() =>
    window.__vcgMotionSimulator?.setPose("hands-together")
  );
  await page.waitForTimeout(550);
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
  management = page.locator('[data-launcher-view="profile-management"]');
  await expect(
    management.getByRole("heading", { name: "Manage Randy." }),
  ).toBeVisible();
  await expect(
    management.getByText("Synthetic revision 8"),
  ).toBeVisible();
  await expect(
    management.getByText("Not configured", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as Record<string, () => number>
        ).__calibrationCameraCalls!(),
    ),
  ).toBe(0);
});

test("accessibility preferences apply, persist, disclose gaps, and reset", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let gamepad: Gamepad | null = null;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    });
    (
      window as unknown as Record<string, (buttons: number[]) => void>
    ).__setAccessibilityGamepad = (buttons) => {
      gamepad = {
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: buttons.includes(index),
          touched: buttons.includes(index),
          value: buttons.includes(index) ? 1 : 0,
        })),
        connected: true,
        hapticActuators: [],
        id: "Playwright accessibility controller",
        index: 0,
        mapping: "standard",
        timestamp: performance.now(),
        vibrationActuator: null,
      } as unknown as Gamepad;
    };
  });
  await page.goto("/?skipBoot=1");
  const root = page.locator("html");
  const standardFontSize = await root.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  await expect(root).toHaveAttribute("data-vcg-text-scale", "standard");
  await expect(root).toHaveAttribute("data-vcg-contrast", "standard");
  await expect(root).toHaveAttribute("data-vcg-motion", "system");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Access", exact: true }).click();
  const accessibilityPanel = page.locator(
    '[data-settings-panel="accessibility"]',
  );
  await expect(
    accessibilityPanel.getByText("Using defaults · nothing stored yet"),
  ).toBeVisible();
  await expect(
    accessibilityPanel.getByText(
      /Seated play and confirm-button\s+remapping are saved demonstrations/,
    ),
  ).toBeVisible();
  await expect(
    accessibilityPanel.getByText(/browser input router still uses its canonical mapping/),
  ).toBeVisible();

  await accessibilityPanel.getByRole("button", { name: "Large" }).focus();
  await pressSyntheticGamepadButton(page, "__setAccessibilityGamepad", 0);
  await expect(root).toHaveAttribute("data-vcg-text-scale", "large");
  expect(
    await root.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    ),
  ).toBeGreaterThan(standardFontSize);

  await accessibilityPanel.getByRole("button", { name: "High" }).click();
  await expect(root).toHaveAttribute("data-vcg-contrast", "high");
  await accessibilityPanel.getByRole("button", { name: "Reduced" }).click();
  await expect(root).toHaveAttribute("data-vcg-motion", "reduced");
  expect(
    await page.locator(".launcher").evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).transitionDuration),
    ),
  ).toBeLessThanOrEqual(0.00002);

  await accessibilityPanel.getByRole("button", { name: "Seated preferred" }).click();
  await expect(root).toHaveAttribute("data-vcg-seated-play", "preferred");
  await accessibilityPanel.getByRole("button", { name: "West / X" }).click();
  await expect(root).toHaveAttribute("data-vcg-confirm-button", "west");
  await accessibilityPanel.getByRole("button", { name: "Off" }).click();
  await expect(root).toHaveAttribute("data-vcg-audio-cues", "off");
  await accessibilityPanel.getByRole("button", { name: "Play cue" }).click();
  await expect(page.locator("#launcher-toast")).toHaveText("Audio cues are off.");

  await accessibilityPanel.getByRole("button", { name: "On" }).click();
  await accessibilityPanel.getByRole("button", { name: "Play cue" }).click();
  await expect(page.locator("#launcher-toast")).toHaveText("Audio cue played locally.");
  await expect(
    accessibilityPanel.getByText("Saved locally on this console"),
  ).toBeVisible();
  await page.screenshot({
    path: "../../test-results/console-lab/accessibility-settings.png",
  });

  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("vcg.accessibility.v1") ?? "null"),
    ),
  ).toEqual({
    schemaVersion: 1,
    textScale: "large",
    contrast: "high",
    motion: "reduced",
    seatedPlay: "preferred",
    confirmButton: "west",
    audioCues: "on",
  });

  await page.reload();
  await expect(root).toHaveAttribute("data-vcg-text-scale", "large");
  await expect(root).toHaveAttribute("data-vcg-contrast", "high");
  await expect(root).toHaveAttribute("data-vcg-motion", "reduced");
  await expect(root).toHaveAttribute("data-vcg-seated-play", "preferred");
  await expect(root).toHaveAttribute("data-vcg-confirm-button", "west");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Access", exact: true }).click();
  await accessibilityPanel
    .getByRole("button", { name: "Reset accessibility settings" })
    .focus();
  await pressSyntheticGamepadButton(page, "__setAccessibilityGamepad", 0);
  await expect(root).toHaveAttribute("data-vcg-text-scale", "standard");
  await expect(root).toHaveAttribute("data-vcg-contrast", "standard");
  await expect(root).toHaveAttribute("data-vcg-motion", "system");
  await expect(root).toHaveAttribute("data-vcg-seated-play", "standard");
  await expect(root).toHaveAttribute("data-vcg-confirm-button", "south");
  await expect(
    accessibilityPanel.getByText("Using defaults · nothing stored yet"),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("vcg.accessibility.v1")),
  ).toBeNull();
  await pressSyntheticGamepadButton(page, "__setAccessibilityGamepad", 1);
  await expect(page.getByRole("heading", { name: /Good evening/ })).toBeVisible();
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
  await expect(
    remoteLaunch.getByRole("button", { name: "Open unsupervised preview" }),
  ).toBeVisible();
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

test("controller can confirm or cancel every operating-mode transition", async ({ page }) => {
  await page.addInitScript(() => {
    let gamepad: Gamepad | null = null;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    });
    (window as unknown as Record<string, (buttons: number[]) => void>).__setModeGamepad = (
      buttons,
    ) => {
      gamepad = {
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: buttons.includes(index),
          touched: buttons.includes(index),
          value: buttons.includes(index) ? 1 : 0,
        })),
        connected: true,
        hapticActuators: [],
        id: "Playwright mode controller",
        index: 0,
        mapping: "standard",
        timestamp: performance.now(),
        vibrationActuator: null,
      } as unknown as Gamepad;
    };
  });
  await page.goto("/?skipBoot=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Developer", exact: true }).click();
  const operatingMode = page.locator(".operating-mode");
  await operatingMode.getByRole("button", { name: "Request admin access" }).focus();

  await pressSyntheticGamepadButton(page, "__setModeGamepad", 0);
  const confirmAdmin = operatingMode.getByRole("button", { name: "Confirm admin access" });
  await expect(confirmAdmin).toBeFocused();
  await pressSyntheticGamepadButton(page, "__setModeGamepad", 1);
  await expect(operatingMode).toHaveAttribute("data-operating-mode", "family");

  await pressSyntheticGamepadButton(page, "__setModeGamepad", 0);
  await expect(confirmAdmin).toBeFocused();
  await pressSyntheticGamepadButton(page, "__setModeGamepad", 0);
  const enableDeveloper = operatingMode.getByRole("button", { name: "Enable developer mode" });
  await expect(enableDeveloper).toBeFocused();

  await pressSyntheticGamepadButton(page, "__setModeGamepad", 0);
  const confirmDeveloper = operatingMode.getByRole("button", {
    name: "Confirm developer mode",
  });
  await expect(confirmDeveloper).toBeFocused();
  await pressSyntheticGamepadButton(page, "__setModeGamepad", 1);
  await expect(operatingMode).toHaveAttribute("data-operating-mode", "admin");

  await pressSyntheticGamepadButton(page, "__setModeGamepad", 0);
  await expect(confirmDeveloper).toBeFocused();
  await pressSyntheticGamepadButton(page, "__setModeGamepad", 0);
  await expect(operatingMode).toHaveAttribute("data-operating-mode", "developer");
  await expect(
    operatingMode.getByRole("button", { name: "End developer mode" }),
  ).toBeFocused();
});

test("diagnostic export is reviewed, admin-gated, bounded, and identity-free", async ({
  page,
}) => {
  let exportStarted = false;
  const exportRequests: string[] = [];
  page.on("request", (request) => {
    if (exportStarted) exportRequests.push(request.url());
  });
  await page.goto("/?skipBoot=1#support-secret-must-not-export");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Developer", exact: true }).click();

  const diagnostics = page.locator(".diagnostic-review");
  await diagnostics.getByRole("button", { name: "Review local diagnostics" }).click();
  await expect(diagnostics.getByText("Admin confirmation is required")).toBeVisible();
  await expect(
    diagnostics.getByRole("button", { name: "Prepare diagnostics export" }),
  ).toHaveCount(0);
  await diagnostics.getByRole("button", { name: "Close review" }).click();

  const operatingMode = page.locator(".operating-mode");
  await operatingMode.getByRole("button", { name: "Request admin access" }).click();
  await operatingMode.getByRole("button", { name: "Confirm admin access" }).click();
  await diagnostics.getByRole("button", { name: "Review local diagnostics" }).click();
  await expect(diagnostics.getByText("Raw frames / skeletons")).toBeVisible();
  await expect(diagnostics.getByText("Excluded / Excluded").first()).toBeVisible();
  await expect(diagnostics.getByText("Complete in-memory window")).toBeVisible();
  await expect(diagnostics.getByText("Warnings retained")).toBeVisible();
  const subsystemCounts = diagnostics
    .locator("dl > div")
    .filter({ hasText: "Subsystem counts" })
    .locator("dd");
  await expect(subsystemCounts).toContainText(/Launcher \d+/);
  await expect(subsystemCounts).toContainText(/Packages \d+/);
  await expect(subsystemCounts).toContainText(/Access \d+/);
  await expect(diagnostics.getByText("mode.admin.entered")).toBeVisible();
  await page.screenshot({ path: "../../test-results/console-lab/diagnostic-review.png" });

  await diagnostics.getByRole("button", { name: "Prepare diagnostics export" }).click();
  await expect(diagnostics.getByText(/Export only these reviewed stable codes/)).toBeVisible();
  await operatingMode.getByRole("button", { name: "Lock to family mode" }).click();
  await expect(
    diagnostics.getByRole("button", { name: "Review local diagnostics" }),
  ).toBeVisible();
  await expect(
    diagnostics.getByRole("button", { name: "Confirm diagnostics export" }),
  ).toHaveCount(0);

  await operatingMode.getByRole("button", { name: "Request admin access" }).click();
  await operatingMode.getByRole("button", { name: "Confirm admin access" }).click();
  await diagnostics.getByRole("button", { name: "Review local diagnostics" }).click();
  await diagnostics.getByRole("button", { name: "Prepare diagnostics export" }).click();
  const downloadPromise = page.waitForEvent("download");
  exportStarted = true;
  await diagnostics.getByRole("button", { name: "Confirm diagnostics export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("vcg-console-diagnostics-v1.json");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const serialized = await readFile(downloadPath!, "utf8");
  const bundle = JSON.parse(serialized) as {
    schemaVersion: number;
    privacy: Record<string, boolean>;
    retention: { storage: string; maximumEvents: number };
    events: Array<Record<string, unknown>>;
  };
  expect(bundle).toMatchObject({
    schemaVersion: 1,
    privacy: {
      containsRawFrames: false,
      containsSkeletons: false,
      containsProfiles: false,
      containsPersonalIdentifiers: false,
      containsCredentials: false,
      containsFreeText: false,
    },
    retention: { storage: "memory-only", maximumEvents: 256 },
  });
  expect(bundle.events.length).toBeGreaterThan(0);
  expect(serialized).not.toContain("Randy");
  expect(serialized).not.toContain("profile-randy");
  expect(serialized).not.toContain("support-secret-must-not-export");
  expect(exportRequests).toEqual([]);

  await diagnostics.getByRole("button", { name: "Clear volatile diagnostics" }).click();
  await expect(diagnostics.getByText("0 / 256")).toBeVisible();
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
  await page.addInitScript(() => {
    const calls: Array<{
      entrypoint: string;
      target: string;
      features: string;
    }> = [];
    (
      window as unknown as {
        __hostedBrowserPreviewCalls: typeof calls;
      }
    ).__hostedBrowserPreviewCalls = calls;
    window.open = (entrypoint, target, features) => {
      calls.push({
        entrypoint: String(entrypoint),
        target: target ?? "",
        features: features ?? "",
      });
      if (calls.length === 1) return null;
      return { opener: window } as unknown as Window;
    };
  });
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
  await launch
    .getByRole("button", { name: "Open unsupervised preview" })
    .click();
  await expect(launch).toBeVisible();
  await expect(
    page.getByText("The browser blocked the separate preview tab. Try again."),
  ).toBeVisible();
  await launch
    .getByRole("button", { name: "Open unsupervised preview" })
    .click();
  await expect(launch).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __hostedBrowserPreviewCalls: unknown;
          }
        ).__hostedBrowserPreviewCalls,
    ),
  ).toEqual([
    {
      entrypoint: "https://vibecoded.games",
      target: "_blank",
      features: "noopener,noreferrer",
    },
    {
      entrypoint: "https://vibecoded.games",
      target: "_blank",
      features: "noopener,noreferrer",
    },
  ]);
});

test("universal search traps focus, scrolls, activates, and restores its opener", async ({
  page,
}) => {
  await installSyntheticStandardGamepad(
    page,
    "__setSearchGamepad",
    "Playwright Search controller",
  );
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

  await trigger.click();
  await expect(input).toHaveValue("");
  const allResults = page.locator("#search-results button");
  await expect(allResults).toHaveCount(20);
  const resultList = page.locator("#search-results");
  expect(
    await resultList.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await allResults.last().focus();
  await expect(allResults.last()).toBeFocused();
  expect(await resultList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await input.fill("profiles");
  const profilesResult = page.getByRole("button", {
    name: /Profiles Players on this console/,
  });
  await pressSyntheticGamepadButton(page, "__setSearchGamepad", 13);
  await expect(profilesResult).toBeFocused();
  await pressSyntheticGamepadButton(page, "__setSearchGamepad", 0);
  await expect(page.locator("#search-overlay")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
});

test("Search no-result recovery clears locally and opens stable category results", async ({
  page,
}) => {
  await page.goto("/?skipBoot=1");
  const trigger = page.getByRole("button", { name: /Search games/ });
  await trigger.focus();
  await trigger.click();
  const input = page.locator("#universal-search");
  await input.fill("no-such-vcg-destination");
  await expect(page.locator("#search-results button")).toHaveCount(0);
  await expect(page.locator("#search-empty")).toContainText(
    "Clear the query or browse a local category",
  );
  const clear = page.getByRole("button", { name: "Clear search", exact: true });
  await page.keyboard.press("ArrowDown");
  await expect(clear).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(page.locator("#search-results button")).toHaveCount(20);

  await input.fill("no-such-vcg-destination");
  await page.keyboard.press("ArrowDown");
  await expect(clear).toBeFocused();
  await page.keyboard.press("Tab");
  const motion = page
    .getByLabel("Search recovery")
    .getByRole("button", { name: "Motion", exact: true });
  await expect(motion).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("motion");
  await expect(page.locator("#search-results button")).toHaveCount(5);
  await expect(page.locator("#search-results button").first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator("#search-overlay")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Search restores its opener before offline package launch and Back recovery", async ({
  page,
}) => {
  await page.clock.install({
    time: new Date("2026-07-24T19:00:00-07:00"),
  });
  await page.goto("/?skipBoot=1");
  const trigger = page.getByRole("button", { name: /Search games/ });
  await trigger.focus();
  await trigger.click();
  const input = page.locator("#universal-search");
  await input.fill("obstacle");
  const result = page.getByRole("button", {
    name: /Motion Obstacle Motion game/,
  });
  await result.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator("#search-overlay")).toBeHidden();
  const launch = page.getByRole("dialog", { name: "Obstacle" });
  await expect(launch).toBeVisible();
  await expect(launch).toContainText("LOCAL WEB");

  await page.keyboard.press("Escape");
  await expect(launch).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Search remote-web launch contains denial and offline failure before restoring focus", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.clock.install({
    time: new Date("2026-07-24T19:00:00-07:00"),
  });
  await page.goto("/?skipBoot=1");
  const trigger = page.getByRole("button", { name: /Search games/ });
  const openMuseumFromSearch = async () => {
    await trigger.focus();
    await trigger.click();
    await page.locator("#universal-search").fill("vibecoded.games");
    const result = page.getByRole("button", {
      name: /Online VibeCoded Museum vibecoded\.games/,
    });
    await result.focus();
    await page.keyboard.press("Enter");
    return page.getByRole("dialog", { name: "VibeCoded Museum" });
  };

  const readyLaunch = await openMuseumFromSearch();
  await expect(readyLaunch).toHaveAttribute("data-launch-adapter", "remote-web");
  await expect(readyLaunch.getByText("READY", { exact: true })).toBeVisible();
  await expect(readyLaunch).toContainText("VIBECODED.GAMES / ONLINE");
  await readyLaunch
    .getByRole("button", { name: "Open unsupervised preview" })
    .click();
  await expect(readyLaunch).toBeVisible();
  await expect(
    page.getByText("The browser blocked the separate preview tab. Try again."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(readyLaunch).toBeHidden();
  await expect(trigger).toBeFocused();

  const offlineActivation = openMuseumFromSearch();
  await context.setOffline(true);
  const offlineLaunch = await offlineActivation;
  await expect(offlineLaunch.getByText("OFFLINE", { exact: true })).toBeVisible();
  await expect(offlineLaunch.getByText("No network connection")).toBeVisible();
  await expect(
    offlineLaunch.getByRole("button", { name: "Retry" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(offlineLaunch).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Search unavailable package denial retains diagnostics and restores focus", async ({
  page,
}) => {
  await page.clock.install({
    time: new Date("2026-07-24T19:00:00-07:00"),
  });
  await page.goto("/?skipBoot=1");
  const trigger = page.getByRole("button", { name: /Search games/ });
  await trigger.focus();
  await trigger.click();
  await page.locator("#universal-search").fill("2048");
  const result = page.getByRole("button", {
    name: /Retro 2048 Retro qualification candidate/,
  });
  await result.focus();
  await page.keyboard.press("Enter");

  const launch = page.getByRole("dialog", { name: "2048" });
  await expect(launch).toHaveAttribute("data-launch-adapter", "retro");
  await expect(launch.getByText("NOT AVAILABLE", { exact: true })).toBeVisible();
  await expect(launch).toContainText(
    "The selected release is not present in the current signed package inventory",
  );
  await launch.getByRole("button", { name: "Details" }).click();
  await expect(launch.getByText("PACKAGE_RELEASE_MISMATCH")).toBeVisible();
  await expect(launch.getByRole("button", { name: "Retry" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(launch).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Search destructive progress route defaults to denial and preserves the entry", async ({
  page,
}) => {
  await page.goto("/?skipBoot=1");
  const trigger = page.getByRole("button", { name: /Search games/ });
  await trigger.focus();
  await trigger.click();
  await page.locator("#universal-search").fill("delete local progress");
  const result = page.getByRole("button", {
    name: /System Unassigned progress Device-only saves without a profile/,
  });
  await expect(page.locator("#search-results button")).toHaveCount(1);
  await result.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator("#search-overlay")).toBeHidden();
  const view = page.locator('[data-launcher-view="unassigned"]');
  await expect(
    view.getByRole("heading", { name: "Progress without a profile." }),
  ).toBeVisible();
  const obstacle = view.getByRole("button", { name: /Obstacle/ });
  await expect(obstacle).toBeFocused();
  const deleteAction = view.getByRole("button", {
    name: "Delete permanently",
  });
  await deleteAction.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", {
    name: /Delete Obstacle .* Checkpoint 12/,
  });
  await expect(dialog).toContainText(
    "This permanently removes the selected console-managed save. There is no backup, export, cloud copy, migration, or undo.",
  );
  await expect(dialog).toContainText("Prototype only");
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(obstacle).toBeVisible();
  await expect(deleteAction).toBeFocused();
  await expect(page.locator("#launcher-toast")).not.toContainText(
    "Prototype deletion completed",
  );

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Who is playing?" }),
  ).toBeVisible();
  await expect(
    page.locator('.launcher-nav [data-view-target="profiles"]'),
  ).toBeFocused();
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

test("console lab preserves navigation and safe overlay focus contracts", async ({ page }) => {
  await openMotionLab(page);
  await expect(page.getByRole("heading", { name: "YOUR BODY IS THE SIGNAL." })).toBeVisible();
  await expect(page.getByText("RAW VIDEO", { exact: false })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Gesture hold progress" })).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await expect(page.getByText("Hold progress, acceptance, cancellation, and release appear here.")).toBeVisible();

  await page.getByRole("button", { name: /02 OBSTACLE/ }).click();
  await expect(page.getByRole("heading", { name: "MOVE BEFORE IT HITS." })).toBeVisible();
  await expect(page.locator("#obstacle-canvas")).toBeVisible();

  await page.getByRole("button", { name: /03 SHELL LAB/ }).click();
  await expect(page.getByRole("heading", { name: "EVERY PATH LEADS BACK." })).toBeVisible();
  await page.getByRole("button", { name: "TEST MANUAL PAUSE" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "RESUME" })).toHaveClass(/focused/);
  await expect(page.getByRole("button", { name: "RESUME" })).toBeFocused();
  await page.getByRole("button", { name: "EXIT TO CONSOLE" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();

  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: /Motion Lab Skeleton/ }).click();
  await page.getByRole("button", { name: /03 SHELL LAB/ }).click();
  await page.getByRole("button", { name: "TEST TRACKING LOSS" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_500 });
  await expect(page.getByRole("button", { name: "RESUME" })).toHaveClass(/focused/);
  await expect(page.getByRole("button", { name: "RESUME" })).toBeFocused();
});

test("Escape returns an active game to the console", async ({ page }) => {
  await openMotionLab(page);
  await page.getByRole("button", { name: /02 OBSTACLE/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
});

test("captures the reviewed tracker surface", async ({ page }) => {
  await openMotionLab(page);
  await expect(page.getByRole("heading", { name: "YOUR BODY IS THE SIGNAL." })).toBeVisible();
  await expect(page.locator("#metric-source-timing-label")).toHaveText(
    "REPLAY TO FRAME P95",
  );
  await expect(page.locator("#metric-source-timing-p95")).toHaveText("1.0 MS");
  await expect(page.locator("#measurement-note")).toContainText(
    "camera-free diagnostic timing",
  );
  await expect(page.locator("#measurement-note")).toContainText(
    "not live camera or exposure-to-action latency",
  );
  await page.waitForTimeout(220);
  await page.screenshot({ path: "../../test-results/console-lab/tracker-surface.png", fullPage: true });
});

test("shows deterministic tracker health and degraded-control fixtures", async ({ page }) => {
  await openMotionLab(page);

  await page.getByRole("button", { name: "LOW CONF" }).click();
  await expect(page.locator("#health-badge")).toHaveText("LOW CONF");
  await expect(page.locator("#tracker-health-title")).toHaveText("Tracking confidence is low");
  await expect(page.locator("#tracker-control")).toHaveText("LANDMARKS ONLY");
  await expect(page.locator("#player-control-state")).toHaveText("UNAVAILABLE");
  await expect(page.locator("#player-control-title")).toHaveText(
    "Tracker health blocks motion control",
  );

  await page.getByRole("button", { name: "OVERLOAD" }).click();
  await expect(page.locator("#health-badge")).toHaveText("OVERLOAD");
  await expect(page.locator("#tracker-health-detail")).toContainText("Frames may be dropped");

  await page.getByRole("button", { name: "RESTART" }).click();
  await expect(page.locator("#health-badge")).toHaveText("RESTARTING");
  await expect(page.locator("#tracker-control")).toHaveText("CONTROLLER ONLY");

  await page.getByRole("button", { name: "DISCONNECT" }).click();
  await expect(page.locator("#health-badge")).toHaveText("CAMERA LOST");
  await expect(page.locator("#tracker-health-detail")).toContainText("controller and keyboard");

  await page.getByRole("button", { name: "READY" }).click();
  await expect(page.locator("#health-badge")).toHaveText("READY");
  await expect(page.locator("#tracker-control")).toHaveText("FULL");
  await expect(page.locator("#player-control-state")).toHaveText("FULL");

  await page.getByRole("button", { name: "LEGS" }).click();
  await expect(page.locator("#player-control-state")).toHaveText("PARTIAL");
  await expect(page.locator("#player-unavailable-controls")).toHaveText("UNAVAILABLE JUMP");
  await expect(page.locator('[data-player-region="leftLeg"]')).toHaveAttribute(
    "data-state",
    "partial",
  );
  await expect(page.locator('[data-player-region="rightLeg"]')).toHaveAttribute(
    "data-state",
    "partial",
  );

  await page.getByRole("button", { name: "LEFT ARM" }).click();
  await expect(page.locator("#player-control-state")).toHaveText("PARTIAL");
  await expect(page.locator("#player-unavailable-controls")).toContainText(
    "SELECT · BACK / PAUSE · SWIPE",
  );
  await expect(page.locator("#player-unavailable-controls")).not.toContainText("DODGE");

  await page.getByRole("button", { name: "HALF BODY" }).click();
  await expect(page.locator("#player-control-state")).toHaveText("UNAVAILABLE");
  await expect(page.locator('[data-player-region="leftArm"]')).toHaveAttribute(
    "data-state",
    "missing",
  );

  await page.getByRole("button", { name: "FULL", exact: true }).click();
  await expect(page.locator("#player-control-state")).toHaveText("FULL");
  await expect(page.locator("#player-unavailable-controls")).toHaveText("UNAVAILABLE NONE");
});

test("completes the two-player body-game journey and returns to the console", async ({ page }) => {
  await installSyntheticStandardGamepad(
    page,
    "__setObstacleJourneyGamepad",
    "Playwright obstacle recovery controller",
  );
  await page.goto("/?skipBoot=1&obstacleTest=fast");
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: /Motion Lab Skeleton/ }).click();

  await page.evaluate(() => window.__vcgObstacleJourney?.joinTwoPlayers());
  await expect(page.getByRole("button", { name: "LEAVE PLAYER 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "LEAVE PLAYER 2" })).toBeVisible();
  await page.getByRole("button", { name: /02 OBSTACLE/ }).click();
  await expect(page.locator("#game-status")).toHaveText("PLAY", { timeout: 2_000 });

  await page.evaluate(() => window.__vcgObstacleJourney?.action(1, "dodge_right"));
  await expect.poll(() => page.evaluate(() => window.__vcgObstacleJourney?.snapshot().players)).toEqual([
    expect.objectContaining({ slot: 1, lane: 2 }),
    expect.objectContaining({ slot: 2, lane: 1 }),
  ]);

  await pressSyntheticGamepadButton(page, "__setObstacleJourneyGamepad", 9);
  await expect(page.getByRole("dialog", { name: "GAME PAUSED" })).toBeVisible();
  await expect(page.getByRole("button", { name: "RESUME" })).toBeFocused();
  const pausedRemainingMs = await page.evaluate(
    () => window.__vcgObstacleJourney?.snapshot().roundRemainingMs,
  );
  expect(pausedRemainingMs).toBeDefined();
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__vcgObstacleJourney?.snapshot().roundRemainingMs))
    .toBe(pausedRemainingMs);
  await pressSyntheticGamepadButton(page, "__setObstacleJourneyGamepad", 0);
  await expect(page.getByRole("dialog", { name: "GAME PAUSED" })).toBeHidden();

  await expect(page.locator("#game-status")).toHaveText("ROUND ENDED", { timeout: 8_000 });
  await expect(page.getByRole("heading", { name: /PLAYER [12] WINS|DRAW/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "BACK TO CONSOLE" })).toBeFocused();
  await pressSyntheticGamepadButton(page, "__setObstacleJourneyGamepad", 0);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
});

test("keeps obstacle scores local, unverified, persistent, and deliberately resettable", async ({ page }) => {
  await page.goto("/?skipBoot=1&obstacleTest=fast");
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: /Motion Lab Skeleton/ }).click();
  await page.getByRole("button", { name: /02 OBSTACLE/ }).click();

  const board = page.getByRole("region", { name: "UNVERIFIED RUNS" });
  await expect(board.getByText("NO UPLOAD")).toBeVisible();
  await expect(board.getByText(/not anti-cheat protected or comparable across households/)).toBeVisible();
  await expect(board.getByText("NO COMPLETED RUNS")).toBeVisible();
  await expect(board.getByText(/SCORES CAN BE MODIFIED/)).toBeVisible();

  await page.evaluate(() => window.__vcgObstacleJourney?.joinTwoPlayers());
  await expect(page.locator("#game-status")).toHaveText("ROUND ENDED", { timeout: 6_000 });
  await expect(board.getByText(/\d{6} · UNASSIGNED/)).toBeVisible();
  await expect(board.getByText(/REPLAY · P0 · DROP 0/)).toBeVisible();
  await expect(board.getByText("1 OF 20 LOCAL RUNS RETAINED.")).toBeVisible();
  await page.screenshot({ path: "../../test-results/console-lab/local-leaderboard.png", fullPage: true });
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("vcg.console.obstacle-leaderboard.v2")),
    )
    .not.toBeNull();

  await page.reload();
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: /Motion Lab Skeleton/ }).click();
  await page.getByRole("button", { name: /02 OBSTACLE/ }).click();
  await expect(page.getByRole("region", { name: "UNVERIFIED RUNS" }).getByText(/\d{6} · UNASSIGNED/)).toBeVisible();

  await page.getByRole("button", { name: "RESET LOCAL BOARD" }).click();
  await expect(board.getByText(/\d{6} · UNASSIGNED/)).toBeVisible();
  await board.getByRole("button", { name: "CONFIRM RESET" }).click();
  await expect(board.getByText("NO COMPLETED RUNS")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("vcg.console.obstacle-leaderboard.v2"))).toBeNull();
});

test("drives the camera-free pose simulator through UI, keyboard, controller, and test hooks", async ({ page }) => {
  await page.addInitScript(() => {
    let gamepad: Gamepad | null = null;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    });
    (window as unknown as {
      __setSimulatorGamepad(buttons: number[], axes?: number[]): void;
    }).__setSimulatorGamepad = (buttons, axes = [0, 0]) => {
      gamepad = {
        axes,
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: buttons.includes(index),
          touched: buttons.includes(index),
          value: buttons.includes(index) ? 1 : 0,
        })),
        connected: true,
        hapticActuators: [],
        id: "Playwright standard controller",
        index: 0,
        mapping: "standard",
        timestamp: performance.now(),
        vibrationActuator: null,
      } as unknown as Gamepad;
    };
  });
  await openMotionLab(page, true);
  expect(await page.evaluate(() => window.__vcgMotionSimulator?.snapshot())).toEqual({
    enabled: false,
    playerVisible: true,
    pose: "neutral",
  });

  const playerAssignment = page.locator("#join-button");
  await expect(page.locator("#motion-lab")).toBeVisible();
  await expect(page.locator("#metric-player")).not.toHaveText("NOT FOUND");
  await pressSyntheticGamepadButton(page, "__setSimulatorGamepad", 0);
  await expect(playerAssignment).toHaveText("LEAVE PLAYER 1");
  await pressSyntheticGamepadButton(page, "__setSimulatorGamepad", 13);
  await expect(playerAssignment).toBeFocused();
  await pressSyntheticGamepadButton(page, "__setSimulatorGamepad", 0);
  await expect(playerAssignment).toHaveText("JOIN PLAYER 1");
  await expect(page.locator("#status-detail")).toContainText(
    "left deliberately",
  );
  await pressSyntheticGamepadButton(page, "__setSimulatorGamepad", 0);
  await expect(playerAssignment).toHaveText("LEAVE PLAYER 1");

  await page.getByRole("button", { name: "ENABLE POSE SIMULATOR" }).click();
  await expect(page.locator("#simulator-state")).toHaveText("NEUTRAL / VISIBLE");
  await expect(page.locator("#source-badge")).toHaveText("POSE SIMULATOR / NEUTRAL");

  await page.keyboard.down("w");
  await expect(page.locator("#simulator-state")).toHaveText("JUMP / VISIBLE");
  await page.keyboard.up("w");
  await expect(page.locator("#simulator-state")).toHaveText("NEUTRAL / VISIBLE");

  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("dodge-left"));
  await expect(page.locator("#simulator-state")).toHaveText("DODGE LEFT / VISIBLE");
  await page.evaluate(() => window.__vcgMotionSimulator?.setPlayerVisible(false));
  await expect(page.locator("#simulator-state")).toHaveText("DODGE LEFT / HIDDEN");
  await expect(page.locator("#metric-player")).toHaveText("NOT FOUND");
  await page.evaluate(() => {
    window.__vcgMotionSimulator?.setPlayerVisible(true);
    window.__vcgMotionSimulator?.setPose("neutral");
  });

  await page.evaluate(() => {
    (window as unknown as {
      __setSimulatorGamepad(buttons: number[], axes?: number[]): void;
    }).__setSimulatorGamepad([0]);
  });
  await expect(page.locator("#simulator-state")).toHaveText("HANDS TOGETHER / VISIBLE");
  await page.evaluate(() => {
    (window as unknown as {
      __setSimulatorGamepad(buttons: number[], axes?: number[]): void;
    }).__setSimulatorGamepad([]);
  });
  await expect(page.locator("#simulator-state")).toHaveText("NEUTRAL / VISIBLE");

  await page.evaluate(() => {
    (window as unknown as {
      __setSimulatorGamepad(buttons: number[], axes?: number[]): void;
    }).__setSimulatorGamepad([16]);
  });
  await expect(page.getByRole("heading", { name: /Good evening/ })).toBeVisible();
});

test("exports a bounded pseudonymized v2 skeleton trace", async ({ page }) => {
  await openMotionLab(page, true);
  await expect(page.locator("#metric-trace")).not.toHaveText("0");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT SKELETON TRACE" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
  const trace = JSON.parse(bytes.toString("utf8")) as {
    format: string;
    formatVersion: number;
    containsRawFrames: boolean;
    privacy: Record<string, boolean>;
    retention: Record<string, unknown>;
    provenance: {
      motionSchemaVersion: string;
      frameSources: string[];
      timestampQualities: string[];
      exportedProfiles: string[];
    };
    healthEvents: Array<{ reason: string }>;
    frames: Array<{
      players: Array<{
        id: string;
        coreLandmarks: Array<Record<string, unknown>>;
        richLandmarks?: unknown;
      }>;
    }>;
  };
  expect(trace).toMatchObject({
    format: "vcg-motion-trace",
    formatVersion: 2,
    containsRawFrames: false,
    privacy: {
      containsRawFrames: false,
      containsAudio: false,
      containsPortraits: false,
      containsProfileIdentifiers: false,
      containsFreeText: false,
      containsDerivedSkeletons: true,
      containsTraceLocalTrackIds: true,
      containsExactExportTime: true,
    },
    retention: {
      volatileFrameLimit: 600,
      volatileHealthEventLimit: 128,
      volatileTrackLimit: 64,
      droppedFrames: 0,
      droppedHealthEvents: 0,
      trackLimitReached: false,
      playerLimitExceeded: false,
      persistentBeforeExport: false,
      exportPersistence: "user-managed-file",
    },
    provenance: {
      motionSchemaVersion: "0.4.0",
      frameSources: ["synthetic"],
      timestampQualities: ["replay"],
      exportedProfiles: ["actions.obstacle.v1", "actions.shell.v1", "body.core17"],
    },
  });
  expect(trace.frames.length).toBeGreaterThan(0);
  expect(trace.frames.length).toBeLessThanOrEqual(600);
  expect(trace.healthEvents.some((event) => event.reason === "healthy")).toBe(true);
  expect(
    trace.frames.every((frame) =>
      frame.players.every(
        (player) =>
          /^trace-player-(?:[1-9]|[1-5][0-9]|6[0-4])$/.test(player.id) &&
          player.richLandmarks === undefined &&
          player.coreLandmarks.every(
            (landmark) =>
              !("z" in (landmark.position as Record<string, unknown>)) &&
              !("worldPosition" in landmark) &&
              !("presence" in landmark),
          ),
      ),
    ),
  ).toBe(true);
  expect(bytes.toString("utf8")).not.toContain("synthetic-1");
  expect(bytes.toString("utf8")).not.toMatch(/rawFrame|imageData|videoFrame/);
});

test("loads the pinned local model and starts a camera pipeline", async ({ page }) => {
  await openMotionLab(page);
  await expect(page.locator("#camera-state-badge")).toHaveText("DISABLED");
  await expect(page.locator("#camera-access-state")).toHaveText("RELEASED");
  await expect(page.locator("#camera-activity-state")).toHaveText("NO STREAM");
  await expect(page.locator("#camera-shutter-state")).toHaveText("NOT SENSED");
  await expect(page.locator("#camera-shutter-detail")).toContainText(
    "Check the shutter directly",
  );
  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.locator("#health-badge")).toHaveText("READY", { timeout: 15_000 });
  await expect(page.locator("#source-badge")).toHaveText("MEDIAPIPE / LOCAL");
  await expect(page.locator("#camera-state-badge")).toHaveText("ACTIVE");
  await expect(page.locator("#camera-access-state")).toHaveText("ENABLED");
  await expect(page.locator("#camera-activity-state")).toHaveText("STREAM ACTIVE");
  await expect(page.locator("#camera-shutter-state")).toHaveText("NOT SENSED");
  await expect
    .poll(async () => `${await page.locator("#metric-tracker").textContent()} / ${await page.locator("#status-detail").textContent()}`, { timeout: 15_000 })
    .toContain("WORKER");

  await page.getByRole("button", { name: "STOP CAMERA" }).click();
  await expect(page.locator("#camera-state-badge")).toHaveText("DISABLED");
  await expect(page.locator("#camera-activity-state")).toHaveText("NO STREAM");
  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.locator("#health-badge")).toHaveText("READY", { timeout: 15_000 });
  await expect(page.locator("#metric-tracker")).toContainText("WORKER", { timeout: 15_000 });
});

test("bounds permission-denied camera copy and keeps fallback controls available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException("private provider detail", "NotAllowedError");
      },
    });
  });
  await openMotionLab(page);
  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.locator("#camera-state-badge")).toHaveText("PERMISSION DENIED", {
    timeout: 15_000,
  });
  await expect(page.locator("#camera-access-state")).toHaveText("BLOCKED");
  await expect(page.locator("#camera-activity-state")).toHaveText("NO STREAM");
  await expect(page.locator("#camera-shutter-state")).toHaveText("NOT SENSED");
  await expect(page.locator("#status-detail")).toContainText("synthetic fallback is active");
  await expect(page.locator("#status-detail")).not.toContainText("private provider detail");
  await expect(page.getByRole("button", { name: "START CAMERA" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "USE REPLAY" })).toBeDisabled();
});

test("reports an ended camera stream as disconnected without inferring shutter state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        const stream = await getUserMedia(constraints);
        const track = stream.getVideoTracks()[0];
        (
          window as unknown as { __disconnectCameraForTest: () => void }
        ).__disconnectCameraForTest = () => track?.dispatchEvent(new Event("ended"));
        return stream;
      },
    });
  });
  await openMotionLab(page);
  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.locator("#camera-state-badge")).toHaveText("ACTIVE", {
    timeout: 15_000,
  });
  await page.evaluate(() =>
    (
      window as unknown as { __disconnectCameraForTest: () => void }
    ).__disconnectCameraForTest(),
  );
  await expect(page.locator("#health-badge")).toHaveText("CAMERA LOST");
  await expect(page.locator("#camera-state-badge")).toHaveText("DISCONNECTED");
  await expect(page.locator("#camera-access-state")).toHaveText("LOST");
  await expect(page.locator("#camera-activity-state")).toHaveText("NO STREAM");
  await expect(page.locator("#camera-shutter-state")).toHaveText("NOT SENSED");
  await expect(page.getByRole("button", { name: "START CAMERA" })).toBeEnabled();
});

test("normal camera mode stores and transmits no raw frames", async ({ page }) => {
  const requests: Array<{ method: string; url: string; postData: string | null }> = [];
  page.on("request", (request) => {
    requests.push({ method: request.method(), url: request.url(), postData: request.postData() });
  });

  await openMotionLab(page);
  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.locator("#health-badge")).toHaveText("READY", { timeout: 15_000 });
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
  await expect(page.locator("#health-badge")).toHaveText("FALLBACK", { timeout: 15_000 });
  await expect(page.locator("#metric-tracker")).toContainText("MAIN", { timeout: 15_000 });
  await expect(page.locator("#status-detail")).toContainText("Worker initialization failed");
});

test("fails closed on a worker crash and retries with a fresh backend", async ({ page }) => {
  await page.addInitScript(() => {
    const originalCreateImageBitmap = window.createImageBitmap.bind(window);
    const originalClose = ImageBitmap.prototype.close;
    let heldBitmap: ImageBitmap | undefined;
    let releaseHeldBitmap: (() => void) | undefined;
    let heldBitmapClosed = false;

    Object.defineProperty(ImageBitmap.prototype, "close", {
      configurable: true,
      value(this: ImageBitmap) {
        if (this === heldBitmap) heldBitmapClosed = true;
        originalClose.call(this);
      },
    });
    Object.defineProperty(window, "createImageBitmap", {
      configurable: true,
      value: async (...args: unknown[]) => {
        const bitmap = await (originalCreateImageBitmap as (...callArgs: unknown[]) => Promise<ImageBitmap>)(...args);
        if (!heldBitmap) {
          heldBitmap = bitmap;
          await new Promise<void>((resolve) => {
            releaseHeldBitmap = resolve;
          });
        }
        return bitmap;
      },
    });
    (
      window as unknown as {
        __trackerTransferHarness: {
          hasHeldBitmap: () => boolean;
          releaseHeldBitmap: () => void;
          heldBitmapWasClosed: () => boolean;
        };
      }
    ).__trackerTransferHarness = {
      hasHeldBitmap: () => heldBitmap !== undefined,
      releaseHeldBitmap: () => releaseHeldBitmap?.(),
      heldBitmapWasClosed: () => heldBitmapClosed,
    };
  });
  await openMotionLab(page);
  const firstWorkerPromise = page.waitForEvent("worker");
  await page.getByRole("button", { name: "START CAMERA" }).click();
  const firstWorker = await firstWorkerPromise;
  await expect(page.locator("#health-badge")).toHaveText("READY", { timeout: 15_000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __trackerTransferHarness: { hasHeldBitmap: () => boolean };
            }
          ).__trackerTransferHarness.hasHeldBitmap(),
      ),
    )
    .toBe(true);
  await firstWorker.evaluate(() => {
    setTimeout(() => {
      throw new Error("forced tracker worker runtime crash");
    }, 0);
  });
  await expect(page.locator("#health-badge")).toHaveText("FAULT", { timeout: 15_000 });
  await expect(page.locator("#camera-state-badge")).toHaveText("FAILED");
  await expect(page.locator("#camera-activity-state")).toHaveText("NO STREAM");
  await expect(page.locator("#camera-shutter-state")).toHaveText("NOT SENSED");
  await expect(page.locator("#status-detail")).toContainText("Worker runtime failed");
  await expect(page.getByRole("button", { name: "START CAMERA" })).toBeEnabled();

  const secondWorkerPromise = page.waitForEvent("worker");
  await page.getByRole("button", { name: "START CAMERA" }).click();
  const secondWorker = await secondWorkerPromise;
  expect(secondWorker).not.toBe(firstWorker);
  await expect(page.locator("#health-badge")).toHaveText("READY", { timeout: 15_000 });
  await expect(page.locator("#metric-tracker")).toContainText("WORKER", { timeout: 15_000 });
  await page.evaluate(() =>
    (
      window as unknown as {
        __trackerTransferHarness: { releaseHeldBitmap: () => void };
      }
    ).__trackerTransferHarness.releaseHeldBitmap(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __trackerTransferHarness: { heldBitmapWasClosed: () => boolean };
            }
          ).__trackerTransferHarness.heldBitmapWasClosed(),
      ),
    )
    .toBe(true);
});

test("cooperative web game negotiates, receives a frame, and reconnects after reload", async ({ page }) => {
  await page.goto("/bridge-host.html");
  const game = page.frameLocator("#game");
  await expect(game.locator("#client-status")).toHaveText("CONNECTED");
  await expect(game.locator("#health-state")).toHaveText("HEALTH HEALTHY / FULL");
  await expect(page.locator("#host-status")).toHaveText("CONNECTED");
  await page.getByRole("button", { name: "PUBLISH DEGRADED HEALTH" }).click();
  await expect(game.locator("#health-state")).toHaveText("HEALTH OVERLOAD / LANDMARKS-ONLY");
  await page.getByRole("button", { name: "PUBLISH READY HEALTH" }).click();
  await expect(game.locator("#health-state")).toHaveText("HEALTH HEALTHY / FULL");
  await page.getByRole("button", { name: "PUBLISH FRAME" }).click();
  await expect(game.locator("#frame-sequence")).toHaveText("FRAME 0");

  await page.locator("#game").evaluate((element: HTMLIFrameElement) => element.contentWindow?.location.reload());
  await expect(game.locator("#client-status")).toHaveText("CONNECTED");
  await page.waitForTimeout(20);
  await page.getByRole("button", { name: "PUBLISH FRAME" }).click();
  await expect(game.locator("#frame-sequence")).toHaveText("FRAME 1");
});

test("stalled browser game is bounded, collected, and replaced by a healthy client", async ({ page }) => {
  await page.goto("/bridge-host.html");
  const game = page.frameLocator("#game");
  await expect(game.locator("#client-status")).toHaveText("CONNECTED");

  await page.locator("#game").evaluate((element: HTMLIFrameElement) => {
    element.src = "/bridge-stalled-client.html";
  });
  await expect(game.locator("#stalled-status")).toHaveText("CONNECTED / ACKS DISABLED");
  await page.getByRole("button", { name: "PUBLISH FRAME" }).click();
  await expect(game.locator("#stalled-frame")).toHaveText("FRAME 0 / ACK WITHHELD");
  await page.getByRole("button", { name: "PUBLISH FRAME" }).click();
  await expect(page.locator("#host-status")).toHaveText("PUBLISHED 1 TO 0");

  await page.waitForTimeout(1_100);
  await page.getByRole("button", { name: "COLLECT STALLED SESSION" }).click();
  await expect(page.locator("#host-status")).toHaveText("COLLECTED 1; ACTIVE 0; PENDING 0");

  await page.locator("#game").evaluate((element: HTMLIFrameElement) => {
    element.src = "/bridge-client.html";
  });
  await expect(game.locator("#client-status")).toHaveText("CONNECTED");
  await page.getByRole("button", { name: "PUBLISH FRAME" }).click();
  await expect(game.locator("#frame-sequence")).toHaveText("FRAME 2");
});

test("cross-origin motion bridge survives sandboxing and rejects navigation origin drift", async ({ page }) => {
  await page.goto("/bridge-cross-origin-host.html");
  const game = page.frameLocator("#game");
  await expect(game.locator("#client-status")).toHaveText("CONNECTED");
  await expect(game.locator("#health-state")).toHaveText("HEALTH HEALTHY / FULL");
  await expect(game.locator("#client-origin")).toHaveText("http://localhost:4173");
  await expect(page.locator("#host-status")).toHaveText("CONNECTED");
  await expect(game.locator("#readiness-state")).toHaveText("READY");
  await expect(page.locator("#readiness-state")).toHaveText("READY / NONE / 1");

  await game.getByRole("button", { name: "DEGRADE READINESS" }).click();
  await expect(page.locator("#readiness-state")).toHaveText(
    "DEGRADED / RECOVERING / 2",
  );
  await game.getByRole("button", { name: "RECOVER READINESS" }).click();
  await expect(page.locator("#readiness-state")).toHaveText("READY / NONE / 3");

  await page.getByRole("button", { name: "PUBLISH DEGRADED HEALTH" }).click();
  await expect(game.locator("#health-state")).toHaveText("HEALTH OVERLOAD / LANDMARKS-ONLY");
  await page.getByRole("button", { name: "PUBLISH READY HEALTH" }).click();
  await expect(game.locator("#health-state")).toHaveText("HEALTH HEALTHY / FULL");
  await page.getByRole("button", { name: "PUBLISH FRAME" }).click();
  await expect(game.locator("#frame-sequence")).toHaveText("FRAME 0");

  await page.locator("#game").evaluate((element: HTMLIFrameElement) => {
    element.src = "/bridge-hostile-client.html";
  });
  await expect(game.locator("#hostile-status")).toHaveText("NO RESPONSE");
  await expect(page.locator("#hostile-count")).toHaveText("1");
  await expect(page.locator("#readiness-state")).toContainText("WAITING");
  await page.getByRole("button", { name: "PUBLISH FRAME" }).click();
  await expect(page.locator("#host-status")).toHaveText("PUBLISHED 1 TO 1");
  await expect(game.locator("#hostile-status")).toHaveText("NO RESPONSE");

  await page.locator("#game").evaluate((element: HTMLIFrameElement) => {
    element.src = "http://localhost:4173/bridge-cross-origin-client.html";
  });
  await expect(game.locator("#client-status")).toHaveText("CONNECTED");
  await expect(game.locator("#health-state")).toHaveText("HEALTH HEALTHY / FULL");
  await expect(game.locator("#readiness-state")).toHaveText("READY");
  await expect(page.locator("#readiness-state")).toHaveText("READY / NONE / 1");
  await expect
    .poll(async () =>
      Number(await page.locator("#readiness-generation").textContent()),
    )
    .toBeGreaterThanOrEqual(3);
  await page.getByRole("button", { name: "PUBLISH FRAME" }).click();
  await expect(game.locator("#frame-sequence")).toHaveText("FRAME 2");
});

test("browser policy denies hostile cross-origin capabilities and escape", async ({
  context,
  page,
}) => {
  await context.setGeolocation({ latitude: 47.6062, longitude: -122.3321 });
  await context.grantPermissions(
    ["camera", "microphone", "geolocation"],
    { origin: "http://localhost:4173" },
  );

  const launcherResponse = await page.goto("/");
  expect(launcherResponse).not.toBeNull();
  const launcherHeaders = launcherResponse?.headers() ?? {};
  expect(launcherHeaders["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(launcherHeaders["content-security-policy"]).toContain("frame-src 'none'");
  expect(launcherHeaders["content-security-policy"]).toContain(
    "connect-src 'self' http://127.0.0.1:*",
  );
  expect(launcherHeaders["permissions-policy"]).toContain("camera=(self)");
  expect(launcherHeaders["permissions-policy"]).toContain("microphone=()");
  expect(launcherHeaders["permissions-policy"]).toContain("geolocation=()");
  expect(launcherHeaders["permissions-policy"]).toContain("fullscreen=()");
  expect(launcherHeaders["referrer-policy"]).toBe("no-referrer");
  expect(launcherHeaders["x-content-type-options"]).toBe("nosniff");
  expect(launcherHeaders["cross-origin-embedder-policy"]).toBe("require-corp");
  expect(launcherHeaders["cross-origin-opener-policy"]).toBe("same-origin");
  expect(launcherHeaders["origin-agent-cluster"]).toBe("?1");
  expect(launcherHeaders["cross-origin-resource-policy"]).toBe("same-origin");

  const fallbackResponse = await page.goto("/launcher-history-fallback");
  expect(fallbackResponse?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );

  const hostileResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/browser-policy-hostile.html"),
  );
  const hostResponse = await page.goto("/browser-policy-host.html");
  const hostileResponse = await hostileResponsePromise;
  expect(hostResponse?.headers()["content-security-policy"]).toContain(
    "frame-src http://localhost:4173",
  );
  expect(hostileResponse.headers()["content-security-policy"]).toContain(
    "connect-src 'none'",
  );
  expect(hostileResponse.headers()["content-security-policy"]).toContain(
    "form-action 'none'",
  );
  expect(hostileResponse.headers()["cross-origin-resource-policy"]).toBe("cross-origin");

  const escapeRequests: string[] = [];
  let popupCount = 0;
  let downloadCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("policyEscape=1")) escapeRequests.push(request.url());
  });
  page.on("popup", (popup) => {
    popupCount += 1;
    void popup.close();
  });
  page.on("download", () => {
    downloadCount += 1;
  });

  const hostile = page.frameLocator("#hostile-game");
  await expect(hostile.locator("#frame-origin")).toHaveText("http://localhost:4173");
  await expect(hostile.locator("#camera-policy")).toHaveText("DENIED");
  await expect(hostile.locator("#microphone-policy")).toHaveText("DENIED");
  await expect(hostile.locator("#geolocation-policy")).toHaveText("DENIED");
  await expect(hostile.locator("#fullscreen-policy")).toHaveText("DENIED");

  await hostile.getByRole("button", { name: "TRY PARENT DOCUMENT" }).click();
  await expect(hostile.locator("#parent-document")).toContainText("BLOCKED:");

  await hostile.getByRole("button", { name: "TRY CAMERA" }).click();
  await expect(hostile.locator("#camera-request")).toContainText("BLOCKED:");
  await hostile.getByRole("button", { name: "TRY MICROPHONE" }).click();
  await expect(hostile.locator("#microphone-request")).toContainText("BLOCKED:");
  await hostile.getByRole("button", { name: "TRY GEOLOCATION" }).click();
  await expect(hostile.locator("#geolocation-request")).toContainText("BLOCKED:");

  await hostile.getByRole("button", { name: "TRY NETWORK" }).click();
  await expect(hostile.locator("#network-request")).toContainText("BLOCKED:");
  await hostile.getByRole("button", { name: "TRY POPUP" }).click();
  await expect(hostile.locator("#popup-request")).toHaveText("BLOCKED");
  await hostile.getByRole("button", { name: "TRY TOP NAVIGATION" }).click();
  await expect(hostile.locator("#navigation-request")).toContainText("BLOCKED:");
  await hostile.getByRole("button", { name: "TRY DOWNLOAD" }).click();
  await expect(hostile.locator("#download-request")).toHaveText("ATTEMPTED");
  await hostile.getByRole("button", { name: "TRY FORM SUBMISSION" }).click();
  await expect(hostile.locator("#form-request")).toHaveText("ATTEMPTED");
  await hostile.getByRole("button", { name: "TRY FULLSCREEN" }).click();
  await expect(hostile.locator("#fullscreen-request")).toContainText("BLOCKED:");
  await hostile.getByRole("button", { name: "TRY POINTER LOCK" }).click();
  await expect(hostile.locator("#pointer-lock-request")).toContainText("BLOCKED");

  await page.waitForTimeout(250);
  expect(page.url()).toBe("http://127.0.0.1:4173/browser-policy-host.html");
  expect(escapeRequests).toEqual([]);
  expect(popupCount).toBe(0);
  expect(downloadCount).toBe(0);
});
