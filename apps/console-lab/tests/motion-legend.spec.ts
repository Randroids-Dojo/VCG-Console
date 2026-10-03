import { expect, test } from "@playwright/test";

test("Home starts on Obstacle and uses live feedback without a gesture guide", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?skipBoot=1&input=controller&motionSimulatorTest=1");
  const obstacle = page.locator(".home-destinations button").first();
  await expect(obstacle).toBeFocused();
  await page.evaluate(() => {
    window.__vcgMotionSimulator?.enable(true);
    window.__vcgMotionSimulator?.setPose("hands-together");
  });
  await expect(page.locator("#motion-readout-last")).toContainText("Player 1 paired");
  await expect(page.locator("#motion-legend")).toHaveCount(0);
  await page.evaluate(() => window.__vcgMotionSimulator?.setPose("both-hands-out"));
  await expect(page.locator("#motion-readout")).toBeVisible();
  await expect(page.locator("#motion-legend")).toHaveCount(0);
  await page.getByRole("button", { name: "Retro", exact: true }).click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(obstacle).toBeFocused();
});
