import { expect, test } from "@playwright/test";

test("same-server hostile content receives an opaque fail-closed sandbox", async ({
  context,
  page,
}) => {
  await context.setGeolocation({ latitude: 47.6062, longitude: -122.3321 });
  await context.grantPermissions(
    ["camera", "microphone", "geolocation"],
    { origin: "http://127.0.0.1:4173" },
  );

  const childResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/browser-policy-opaque-child.html"),
  );
  const fixtureScriptResponsePromise = page.waitForResponse((response) =>
    /\/assets\/browser-policy-hostile-fixture-[A-Za-z0-9_-]+\.js$/u.test(
      new URL(response.url()).pathname,
    ),
  );
  const preloadScriptResponsePromise = page.waitForResponse((response) =>
    /\/assets\/modulepreload-polyfill-[A-Za-z0-9_-]+\.js$/u.test(
      new URL(response.url()).pathname,
    ),
  );
  const hostResponse = await page.goto("/browser-policy-opaque-host.html");
  const [childResponse, fixtureScriptResponse, preloadScriptResponse] =
    await Promise.all([
      childResponsePromise,
      fixtureScriptResponsePromise,
      preloadScriptResponsePromise,
    ]);
  expect(hostResponse?.headers()["content-security-policy"]).toContain(
    "frame-src 'self'",
  );
  expect(childResponse.headers()["content-security-policy"]).toContain(
    "connect-src 'none'",
  );
  expect(childResponse.headers()["content-security-policy"]).toContain(
    "script-src http://127.0.0.1:4173",
  );
  expect(childResponse.headers()["cross-origin-resource-policy"]).toBe(
    "cross-origin",
  );
  for (const response of [fixtureScriptResponse, preloadScriptResponse]) {
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    expect(response.headers()["cross-origin-resource-policy"]).toBe(
      "cross-origin",
    );
  }
  await expect(page.locator("#hostile-game")).toHaveAttribute(
    "sandbox",
    "allow-scripts",
  );

  const escapeRequests: string[] = [];
  let popupCount = 0;
  let downloadCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("policyEscape=1")) {
      escapeRequests.push(request.url());
    }
  });
  page.on("popup", (popup) => {
    popupCount += 1;
    void popup.close();
  });
  page.on("download", () => {
    downloadCount += 1;
  });

  const hostile = page.frameLocator("#hostile-game");
  await expect(hostile.locator("#frame-origin")).toHaveText(
    "http://127.0.0.1:4173",
  );
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
  await expect(hostile.locator("#geolocation-request")).toContainText(
    "BLOCKED:",
  );

  await hostile.getByRole("button", { name: "TRY NETWORK" }).click();
  await expect(hostile.locator("#network-request")).toContainText("BLOCKED:");
  await hostile.getByRole("button", { name: "TRY POPUP" }).click();
  await expect(hostile.locator("#popup-request")).toHaveText("BLOCKED");
  await hostile.getByRole("button", { name: "TRY TOP NAVIGATION" }).click();
  await expect(hostile.locator("#navigation-request")).toContainText(
    "BLOCKED:",
  );
  await hostile.getByRole("button", { name: "TRY DOWNLOAD" }).click();
  await expect(hostile.locator("#download-request")).toHaveText("ATTEMPTED");
  await hostile.getByRole("button", { name: "TRY FORM SUBMISSION" }).click();
  await expect(hostile.locator("#form-request")).toHaveText("ATTEMPTED");
  await hostile.getByRole("button", { name: "TRY FULLSCREEN" }).click();
  await expect(hostile.locator("#fullscreen-request")).toContainText(
    "BLOCKED:",
  );
  await hostile.getByRole("button", { name: "TRY POINTER LOCK" }).click();
  await expect(hostile.locator("#pointer-lock-request")).toContainText(
    "BLOCKED",
  );

  await page.waitForTimeout(250);
  expect(page.url()).toBe(
    "http://127.0.0.1:4173/browser-policy-opaque-host.html",
  );
  expect(escapeRequests).toEqual([]);
  expect(popupCount).toBe(0);
  expect(downloadCount).toBe(0);
});
