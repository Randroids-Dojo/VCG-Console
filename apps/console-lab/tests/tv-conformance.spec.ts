import { expect, test, type Page } from "@playwright/test";

const RESOLUTIONS = [
  { id: "720p", width: 1280, height: 720 },
  { id: "1080p", width: 1920, height: 1080 },
  { id: "4k", width: 3840, height: 2160 },
] as const;

interface ElementMeasurement {
  readonly label: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
}

async function measurements(
  page: Page,
  selector: string,
  clipSelector?: string,
): Promise<ElementMeasurement[]> {
  return page.locator(selector).evaluateAll((elements, clip) => {
    const clipElement = clip ? document.querySelector(clip) : null;
    if (clip && !(clipElement instanceof HTMLElement)) {
      throw new Error(`Missing measurement clip ${clip}`);
    }
    const clipBounds = clipElement?.getBoundingClientRect();
    return elements
      .filter((element) => {
        if (!clipElement || !clipBounds || !clipElement.contains(element)) {
          return true;
        }
        const bounds = element.getBoundingClientRect();
        return (
          bounds.top >= clipBounds.top - 0.5
          && bounds.bottom <= clipBounds.bottom + 0.5
        );
      })
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          label:
            element.getAttribute("aria-label")
            ?? element.textContent?.trim().replace(/\s+/gu, " ")
            ?? element.tagName,
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        };
      });
  }, clipSelector);
}

async function assertTvGeometry(
  page: Page,
  resolution: (typeof RESOLUTIONS)[number],
  rootSelector: string,
  expectedCriticalText: number,
  expectedActions: number,
  criticalTextClipSelector?: string,
): Promise<void> {
  const safeArea = {
    left: resolution.width * 0.05,
    top: resolution.height * 0.05,
    right: resolution.width * 0.95,
    bottom: resolution.height * 0.95,
  };
  const criticalText = await measurements(
    page,
    `${rootSelector} [data-tv-critical-text]:visible`,
    criticalTextClipSelector,
  );
  const actions = await measurements(
    page,
    `${rootSelector} [data-tv-action]:visible`,
  );

  expect(criticalText.length).toBe(expectedCriticalText);
  expect(actions.length).toBe(expectedActions);
  for (const item of criticalText) {
    expect(
      item.left,
      `${resolution.id} ${item.label} left edge`,
    ).toBeGreaterThanOrEqual(safeArea.left - 0.5);
    expect(
      item.top,
      `${resolution.id} ${item.label} top edge`,
    ).toBeGreaterThanOrEqual(safeArea.top - 0.5);
    expect(
      item.right,
      `${resolution.id} ${item.label} right edge`,
    ).toBeLessThanOrEqual(safeArea.right + 0.5);
    expect(
      item.bottom,
      `${resolution.id} ${item.label} bottom edge`,
    ).toBeLessThanOrEqual(safeArea.bottom + 0.5);
    expect(
      item.fontSize,
      `${resolution.id} ${item.label} font size`,
    ).toBeGreaterThanOrEqual(24);
  }
  for (let leftIndex = 0; leftIndex < criticalText.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < criticalText.length;
      rightIndex += 1
    ) {
      const left = criticalText[leftIndex]!;
      const right = criticalText[rightIndex]!;
      const overlapWidth =
        Math.min(left.right, right.right)
        - Math.max(left.left, right.left);
      const overlapHeight =
        Math.min(left.bottom, right.bottom)
        - Math.max(left.top, right.top);
      expect(
        overlapWidth > 0.5 && overlapHeight > 0.5,
        `${resolution.id} critical text overlap: ${left.label} / ${right.label}`,
      ).toBe(false);
    }
  }
  for (const item of actions) {
    expect(
      item.width,
      `${resolution.id} ${item.label} target width`,
    ).toBeGreaterThanOrEqual(47.999);
    expect(
      item.height,
      `${resolution.id} ${item.label} target height`,
    ).toBeGreaterThanOrEqual(47.999);
  }

  const overflow = await page.locator(rootSelector).evaluate((element) => ({
    horizontal: element.scrollWidth - element.clientWidth,
    vertical: element.scrollHeight - element.clientHeight,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
  }));
  expect(
    overflow.horizontal,
    `${resolution.id} ${rootSelector} horizontal overflow`,
  ).toBeLessThanOrEqual(1);
  expect(
    overflow.vertical,
    `${resolution.id} ${rootSelector} vertical overflow: ${JSON.stringify(overflow)}`,
  ).toBeLessThanOrEqual(1);
}

for (const resolution of RESOLUTIONS) {
  test(`launcher home satisfies the candidate TV contract at ${resolution.id}`, async ({
    page,
  }) => {
    await page.setViewportSize(resolution);
    await page.goto("/?skipBoot=1");
    await expect(
      page.getByRole("heading", { name: /Good evening/ }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const safeArea = {
      left: resolution.width * 0.05,
      top: resolution.height * 0.05,
      right: resolution.width * 0.95,
      bottom: resolution.height * 0.95,
    };
    const criticalText = await measurements(
      page,
      "[data-tv-critical-text]:visible",
    );
    const actions = await measurements(page, "[data-tv-action]:visible");

    expect(criticalText.length).toBe(24);
    expect(actions.length).toBe(12);
    const destinationIcons = page.locator(
      ".home-destinations .ui-icon-arrow-right",
    );
    await expect(destinationIcons).toHaveCount(3);
    expect(
      await destinationIcons.evaluateAll((icons) =>
        icons.map((icon) => icon.getAttribute("aria-hidden")),
      ),
    ).toEqual(["true", "true", "true"]);
    await expect(destinationIcons).toHaveText(["", "", ""]);
    for (const item of criticalText) {
      expect(
        item.left,
        `${resolution.id} ${item.label} left edge`,
      ).toBeGreaterThanOrEqual(safeArea.left - 0.5);
      expect(
        item.top,
        `${resolution.id} ${item.label} top edge`,
      ).toBeGreaterThanOrEqual(safeArea.top - 0.5);
      expect(
        item.right,
        `${resolution.id} ${item.label} right edge`,
      ).toBeLessThanOrEqual(safeArea.right + 0.5);
      expect(
        item.bottom,
        `${resolution.id} ${item.label} bottom edge`,
      ).toBeLessThanOrEqual(safeArea.bottom + 0.5);
      expect(
        item.fontSize,
        `${resolution.id} ${item.label} font size`,
      ).toBeGreaterThanOrEqual(24);
    }
    for (let leftIndex = 0; leftIndex < criticalText.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < criticalText.length;
        rightIndex += 1
      ) {
        const left = criticalText[leftIndex]!;
        const right = criticalText[rightIndex]!;
        const overlapWidth =
          Math.min(left.right, right.right)
          - Math.max(left.left, right.left);
        const overlapHeight =
          Math.min(left.bottom, right.bottom)
          - Math.max(left.top, right.top);
        expect(
          overlapWidth > 0.5 && overlapHeight > 0.5,
          `${resolution.id} critical text overlap: ${left.label} / ${right.label}`,
        ).toBe(false);
      }
    }
    for (const item of actions) {
      expect(
        item.width,
        `${resolution.id} ${item.label} target width`,
      ).toBeGreaterThanOrEqual(48);
      expect(
        item.height,
        `${resolution.id} ${item.label} target height`,
      ).toBeGreaterThanOrEqual(48);
    }

    const launcherOverflow = await page.locator("#launcher").evaluate(
      (element) => ({
        horizontal: element.scrollWidth - element.clientWidth,
        vertical: element.scrollHeight - element.clientHeight,
        dimensions: {
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
        },
        children: [...element.children].map((child) => {
          const bounds = child.getBoundingClientRect();
          return {
            className: child.className,
            hidden: (child as HTMLElement).hidden,
            top: bounds.top,
            bottom: bounds.bottom,
            height: bounds.height,
            scrollHeight: child.scrollHeight,
          };
        }),
      }),
    );
    expect(launcherOverflow.horizontal).toBeLessThanOrEqual(1);
    expect(
      launcherOverflow.vertical,
      JSON.stringify(launcherOverflow, null, 2),
    ).toBeLessThanOrEqual(1);

    const homeSections = await page
      .locator(".home-heading, .home-destinations, .home-status")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            className: element.className,
            top: bounds.top,
            bottom: bounds.bottom,
          };
        }),
      );
    expect(homeSections).toHaveLength(3);
    expect(
      homeSections[0]!.bottom,
      `${resolution.id} heading must not overlap destinations`,
    ).toBeLessThanOrEqual(homeSections[1]!.top + 0.5);
    expect(
      homeSections[1]!.bottom,
      `${resolution.id} destinations must not overlap status`,
    ).toBeLessThanOrEqual(homeSections[2]!.top + 0.5);

    await page.screenshot({
      path:
        `../../test-results/console-lab/launcher-tv-${resolution.id}.png`,
    });
    await page.locator("[data-launcher-home]").focus();
    await expect(page.locator("[data-launcher-home]")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#search-trigger")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Search everything" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Search everything" }),
    ).toBeHidden();
    await expect(
      page.getByRole("heading", { name: /Good evening/ }),
    ).toBeVisible();
  });

  test(`launcher motion catalog satisfies the candidate TV contract at ${resolution.id}`, async ({
    page,
  }) => {
    await page.setViewportSize(resolution);
    await page.goto("/?skipBoot=1");
    await page.locator('[data-view-target="motion"]').click();
    await expect(
      page.getByRole("heading", { name: "Move to play." }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await assertTvGeometry(page, resolution, "#launcher", 24, 13);

    const firstEntry = page
      .locator('[data-launcher-view="motion"] .library-list button')
      .first();
    await firstEntry.focus();
    await expect(firstEntry).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: /Good evening/ }),
    ).toBeVisible();
    await expect(page.locator('[data-view-target="home"]')).toBeFocused();
  });

  test(`launcher Wi-Fi offline state satisfies the candidate TV contract at ${resolution.id}`, async ({
    page,
  }) => {
    await page.setViewportSize(resolution);
    await page.goto("/?skipBoot=1");
    await page.locator('[data-view-target="settings"]').click();
    await page.locator('[data-settings-target="network"]').click();
    await expect(
      page.getByRole("heading", { name: "Wi-Fi." }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await assertTvGeometry(page, resolution, "#launcher", 21, 15);

    await page.locator("#scan-wifi").focus();
    await expect(page.locator("#scan-wifi")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: /Good evening/ }),
    ).toBeVisible();
    await expect(page.locator('[data-view-target="home"]')).toBeFocused();
  });

  test(`launcher offline recovery dialog satisfies the candidate TV contract at ${resolution.id}`, async ({
    page,
  }) => {
    await page.setViewportSize(resolution);
    await page.goto("/?skipBoot=1");
    await page.locator('[data-view-target="settings"]').click();
    await page.locator('[data-settings-target="developer"]').click();
    await page
      .getByRole("button", { name: "Offline", exact: true })
      .evaluate((button: HTMLButtonElement) => button.click());
    const dialog = page.getByRole("dialog", { name: "Obstacle" });
    await expect(dialog).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await assertTvGeometry(page, resolution, ".launch-screen", 21, 3);

    const exit = page.getByRole("button", { name: /Exit/ });
    const retry = page.getByRole("button", { name: /Retry/ });
    const retryIcon = retry.locator(".ui-icon-retry");
    await expect(retryIcon).toHaveAttribute("aria-hidden", "true");
    await expect(retryIcon).toHaveText("");
    await expect(exit).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(retry).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(exit).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Developer." }),
    ).toBeVisible();
  });

  test(`launcher Search motion results satisfy the candidate TV contract at ${resolution.id}`, async ({
    page,
  }) => {
    await page.setViewportSize(resolution);
    await page.goto("/?skipBoot=1");
    const trigger = page.locator("#search-trigger");
    await trigger.focus();
    await trigger.click();
    const input = page.locator("#universal-search");
    await expect(input).toBeFocused();
    const searchSymbol = page.locator(".search-symbol");
    await expect(searchSymbol).toHaveAttribute("aria-hidden", "true");
    await expect(searchSymbol).toHaveText("");
    await input.fill("motion");
    const results = page.locator("#search-results button");
    await expect(results).toHaveCount(5);
    const resultIcons = results.locator(".ui-icon-arrow-right");
    await expect(resultIcons).toHaveCount(5);
    expect(
      await resultIcons.evaluateAll((icons) =>
        icons.map((icon) => icon.getAttribute("aria-hidden")),
      ),
    ).toEqual(["true", "true", "true", "true", "true"]);
    await expect(resultIcons).toHaveText(["", "", "", "", ""]);
    await page.evaluate(() => document.fonts.ready);

    await assertTvGeometry(page, resolution, ".search-overlay", 13, 6);

    await page.keyboard.press("ArrowDown");
    await expect(results.first()).toBeFocused();
    await results.last().focus();
    await expect(results.last()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#search-overlay")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test(`launcher Search no-result state satisfies the candidate TV contract at ${resolution.id}`, async ({
    page,
  }) => {
    await page.setViewportSize(resolution);
    await page.goto("/?skipBoot=1");
    const trigger = page.locator("#search-trigger");
    await trigger.focus();
    await trigger.click();
    const input = page.locator("#universal-search");
    await input.fill("no-such-vcg-destination");
    await expect(page.locator("#search-results button")).toHaveCount(0);
    await expect(page.locator("#search-empty")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await assertTvGeometry(page, resolution, ".search-overlay", 4, 1);

    await page.keyboard.press("Tab");
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#search-overlay")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test(`launcher Search empty query scrolls and activates Profiles at ${resolution.id}`, async ({
    page,
  }) => {
    await page.setViewportSize(resolution);
    await page.goto("/?skipBoot=1");
    const trigger = page.locator("#search-trigger");
    await trigger.focus();
    await trigger.click();
    const input = page.locator("#universal-search");
    await expect(input).toBeFocused();
    const results = page.locator("#search-results button");
    await expect(results).toHaveCount(18);
    await expect(
      page.locator(".search-overlay [data-tv-critical-text]:visible"),
    ).toHaveCount(39);
    await expect(
      page.locator(".search-overlay [data-tv-action]:visible"),
    ).toHaveCount(19);
    const scroller = page.locator("#search-results");
    const initialScroll = await scroller.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }));
    expect(initialScroll.scrollTop).toBe(0);
    if (resolution.id === "4k") {
      expect(initialScroll.scrollHeight).toBe(initialScroll.clientHeight);
    } else {
      expect(initialScroll.scrollHeight).toBeGreaterThan(
        initialScroll.clientHeight,
      );
    }

    await results.last().focus();
    await expect(results.last()).toBeFocused();
    const scrolled = await scroller.evaluate((element) => ({
      scrollTop: element.scrollTop,
      maximumScrollTop: element.scrollHeight - element.clientHeight,
    }));
    if (resolution.id === "4k") {
      expect(scrolled.scrollTop).toBe(0);
    } else {
      expect(scrolled.scrollTop).toBeGreaterThan(0);
    }
    expect(scrolled.scrollTop).toBeLessThanOrEqual(scrolled.maximumScrollTop);
    const lastResultInsideScroller = await page.evaluate(() => {
      const resultsElement = document.querySelector("#search-results");
      const last = resultsElement?.querySelector("button:last-of-type");
      if (
        !(resultsElement instanceof HTMLElement)
        || !(last instanceof HTMLElement)
      ) {
        return false;
      }
      const clip = resultsElement.getBoundingClientRect();
      const bounds = last.getBoundingClientRect();
      return (
        bounds.top >= clip.top - 0.5
        && bounds.bottom <= clip.bottom + 0.5
      );
    });
    expect(lastResultInsideScroller).toBe(true);

    const measuredCriticalText = await measurements(
      page,
      ".search-overlay [data-tv-critical-text]:visible",
      "#search-results",
    );
    expect(measuredCriticalText.length).toBeGreaterThan(3);
    await assertTvGeometry(
      page,
      resolution,
      ".search-overlay",
      measuredCriticalText.length,
      19,
      "#search-results",
    );

    const profiles = page.getByRole("button", {
      name: /Profiles Players on this console/,
    });
    await profiles.focus();
    await expect(profiles).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#search-overlay")).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Who is playing?" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: /Good evening/ }),
    ).toBeVisible();
    await expect(
      page.locator('.launcher-nav [data-view-target="home"]'),
    ).toBeFocused();
  });

  test(`launcher Search activates the offline Obstacle package and recovers at ${resolution.id}`, async ({
    page,
  }) => {
    await page.setViewportSize(resolution);
    await page.clock.install({
      time: new Date("2026-07-24T19:00:00-07:00"),
    });
    await page.goto("/?skipBoot=1");
    const trigger = page.locator("#search-trigger");
    await trigger.focus();
    await trigger.click();
    const input = page.locator("#universal-search");
    await input.fill("obstacle");
    const result = page.getByRole("button", {
      name: /Motion Obstacle Motion game/,
    });
    await expect(result).toBeVisible();
    await expect(page.locator("#search-results button")).toHaveCount(1);
    await assertTvGeometry(page, resolution, ".search-overlay", 5, 2);

    await result.focus();
    await expect(result).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#search-overlay")).toBeHidden();
    const launch = page.getByRole("dialog", { name: "Obstacle" });
    await expect(launch).toBeVisible();
    await expect(launch).toHaveAttribute("data-launch-adapter", "local-web");

    await page.keyboard.press("Escape");
    await expect(launch).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test(`launcher Search contains a blocked remote-web preview and recovers at ${resolution.id}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.open = () => null;
    });
    await page.setViewportSize(resolution);
    await page.clock.install({
      time: new Date("2026-07-24T19:00:00-07:00"),
    });
    await page.goto("/?skipBoot=1");
    const trigger = page.locator("#search-trigger");
    await trigger.focus();
    await trigger.click();
    const input = page.locator("#universal-search");
    await input.fill("vibecoded.games");
    const result = page.getByRole("button", {
      name: /Online VibeCoded Museum vibecoded\.games/,
    });
    await expect(result).toBeVisible();
    await expect(page.locator("#search-results button")).toHaveCount(1);
    await assertTvGeometry(page, resolution, ".search-overlay", 5, 2);

    await result.focus();
    await page.keyboard.press("Enter");
    const launch = page.getByRole("dialog", { name: "VibeCoded Museum" });
    await expect(launch).toHaveAttribute("data-launch-adapter", "remote-web");
    await expect(launch.getByText("READY", { exact: true })).toBeVisible();
    await expect(launch).toContainText("VIBECODED.GAMES / ONLINE");
    await launch
      .getByRole("button", { name: "Open unsupervised preview" })
      .click();
    await expect(launch).toBeVisible();
    await expect(
      page.getByText("The browser blocked the separate preview tab. Try again."),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(launch).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test(`launcher Search exposes remote-web offline failure and recovers at ${resolution.id}`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(resolution);
    await page.clock.install({
      time: new Date("2026-07-24T19:00:00-07:00"),
    });
    await page.goto("/?skipBoot=1");
    const trigger = page.locator("#search-trigger");
    await trigger.focus();
    await trigger.click();
    const input = page.locator("#universal-search");
    await input.fill("vibecoded.games");
    const result = page.getByRole("button", {
      name: /Online VibeCoded Museum vibecoded\.games/,
    });
    await expect(result).toBeVisible();
    await expect(page.locator("#search-results button")).toHaveCount(1);
    await assertTvGeometry(page, resolution, ".search-overlay", 5, 2);
    await context.setOffline(true);

    await result.focus();
    await page.keyboard.press("Enter");
    const launch = page.getByRole("dialog", { name: "VibeCoded Museum" });
    await expect(launch).toHaveAttribute("data-launch-adapter", "remote-web");
    await expect(launch.getByText("OFFLINE", { exact: true })).toBeVisible();
    await expect(launch.getByText("No network connection")).toBeVisible();
    await expect(launch.getByRole("button", { name: "Retry" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(launch).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test(`launcher Search exposes unavailable package denial and recovers at ${resolution.id}`, async ({
    page,
  }) => {
    await page.setViewportSize(resolution);
    await page.clock.install({
      time: new Date("2026-07-24T19:00:00-07:00"),
    });
    await page.goto("/?skipBoot=1");
    const trigger = page.locator("#search-trigger");
    await trigger.focus();
    await trigger.click();
    const input = page.locator("#universal-search");
    await input.fill("2048");
    const result = page.getByRole("button", {
      name: /Retro 2048 Retro qualification candidate/,
    });
    await expect(result).toBeVisible();
    await expect(page.locator("#search-results button")).toHaveCount(1);
    await assertTvGeometry(page, resolution, ".search-overlay", 5, 2);

    await result.focus();
    await page.keyboard.press("Enter");
    const launch = page.getByRole("dialog", { name: "2048" });
    await expect(launch).toHaveAttribute("data-launch-adapter", "retro");
    await expect(
      launch.getByText("NOT AVAILABLE", { exact: true }),
    ).toBeVisible();
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

  test(`launcher Search denies destructive progress deletion and recovers at ${resolution.id}`, async ({
    page,
  }) => {
    await page.setViewportSize(resolution);
    await page.goto("/?skipBoot=1");
    const trigger = page.locator("#search-trigger");
    await trigger.focus();
    await trigger.click();
    const input = page.locator("#universal-search");
    await input.fill("delete local progress");
    const result = page.getByRole("button", {
      name: /System Unassigned progress Device-only saves without a profile/,
    });
    await expect(result).toBeVisible();
    await expect(page.locator("#search-results button")).toHaveCount(1);
    await assertTvGeometry(page, resolution, ".search-overlay", 5, 2);

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
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(obstacle).toBeVisible();
    await expect(deleteAction).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Who is playing?" }),
    ).toBeVisible();
    await expect(
      page.locator('.launcher-nav [data-view-target="profiles"]'),
    ).toBeFocused();
  });
}
