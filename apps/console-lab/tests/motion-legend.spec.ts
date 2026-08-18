import { expect, test } from "@playwright/test";

const TV = { width: 1920, height: 1080 } as const;
const SAFE = {
  left: TV.width * 0.05,
  top: TV.height * 0.05,
  right: TV.width * 0.95,
  bottom: TV.height * 0.95,
};

test("the motion legend appears only while someone is playing by motion", async ({ page }) => {
  await page.setViewportSize(TV);
  await page.goto("/?skipBoot=1&input=controller");
  const legend = page.locator("#motion-legend");

  // Nobody has joined, so the gestures do not apply to anyone yet.
  await expect(legend).toBeHidden();

  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: /Motion Lab Skeleton/ }).click();
  await expect(page.locator("#motion-lab")).toBeVisible();
  await expect(legend).toBeHidden();

  await page.locator("#join-button").click();
  await expect(page.locator("#join-button")).toHaveText("LEAVE PLAYER 1");
  await expect(legend).toBeVisible();
  await expect(legend).toContainText("Hold your right hand out");
  await expect(legend).toContainText("Move focus");
  await expect(legend).toContainText("Bring both hands together");
  await expect(legend).toContainText("Select");
  await expect(page.locator("#motion-legend-back")).toHaveText("Back");

  // Marked as critical text, so it owes the same floors as the rest of the
  // shell: inside the safe area, and legible from a couch.
  const box = (await legend.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(SAFE.left - 0.5);
  expect(box.y).toBeGreaterThanOrEqual(SAFE.top - 0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(SAFE.right + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(SAFE.bottom + 0.5);
  for (const entry of await legend.locator("[data-tv-critical-text]").all()) {
    const size = await entry.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(24);
  }

  // The section rail owns the bottom of the lab, so the legend clears it.
  const rail = (await page.locator(".command-rail").boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(rail.y + 0.5);

  await page.locator("#join-button").click();
  await expect(legend).toBeHidden();
});

test("the motion legend names what crossed arms do in a running game", async ({ page }) => {
  await page.setViewportSize(TV);
  await page.goto("/?skipBoot=1&input=controller&obstacleTest=fast");
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: /Motion Lab Skeleton/ }).click();
  await page.locator("#join-button").click();
  await expect(page.locator("#motion-legend-back")).toHaveText("Back");

  await page.getByRole("button", { name: /02 OBSTACLE/ }).click();
  // Once the round is under way the focus gestures are inert, so the legend
  // offers only the one that still does something.
  await expect(page.locator("#motion-legend-back")).toHaveText("Pause", { timeout: 5_000 });
  await expect(page.locator("#motion-legend")).toHaveAttribute("data-context", "game");
  await expect(page.locator(".motion-legend-shell").first()).toBeHidden();
});

test("the gesture guide fades once read, and both hands out brings it back", async ({ page }) => {
  await page.setViewportSize(TV);
  await page.clock.install();
  await page.goto("/?skipBoot=1&input=controller&motionSimulatorTest=1");
  const legend = page.locator("#motion-legend");

  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await page.getByRole("button", { name: /Motion Lab Skeleton/ }).click();
  // Enabling the simulator restarts synthetic replay, which clears the
  // session, so the player joins after it is running.
  await page.evaluate(() => window.__vcgMotionSimulator?.enable(true));
  for (let step = 0; step < 10; step += 1) await page.clock.runFor(50);
  await page.locator("#join-button").click();
  await expect(legend).toBeVisible();

  // It is a reminder, so it leaves once it has been read. The wait is a
  // jump rather than a step: only the fade timer has to fire, and stepping
  // ten seconds of render frames costs more than the test is worth.
  await page.clock.fastForward("00:11");
  await expect(legend).toBeHidden();

  // Holding both hands out asks for it again: the one gesture a player can
  // find without the guide.
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("both-hands-out"));
  // The render loop runs on the installed clock, so it is stepped rather than
  // jumped: the posture has to be read on a frame.
  for (let step = 0; step < 20; step += 1) await page.clock.runFor(50);
  await expect(legend).toBeVisible({ timeout: 4_000 });

  // And it fades again, rather than staying put once summoned.
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("neutral"));
  for (let step = 0; step < 10; step += 1) await page.clock.runFor(50);
  await page.clock.fastForward("00:11");
  await expect(legend).toBeHidden();
});
