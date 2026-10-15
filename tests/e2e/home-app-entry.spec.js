const { test, expect } = require("@playwright/test");

for (const width of [360, 390, 768, 1440]) {
  test(`one homepage entry keeps consultation and self-service at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/friends/track**", route => route.fulfill({ status: 200, body: '{}' }));
    await page.goto("/?ref=RC-QA1234&utm_source=naver&utm_campaign=web-test&gclid=synthetic&token=do-not-forward&next=https://example.invalid");
    const entry = page.locator(".app-entry-actions [data-app-entry]");
    await expect(entry).toBeVisible();
    const target = new URL(await entry.getAttribute("href"), page.url());
    expect(target.pathname).toBe("/app/");
    expect(target.searchParams.get("ref")).toBe("RC-QA1234");
    expect(target.searchParams.get("utm_source")).toBe("naver");
    expect(target.searchParams.get("utm_campaign")).toBe("web-test");
    expect(target.searchParams.get("gclid")).toBe("synthetic");
    expect(target.searchParams.has("token")).toBe(false);
    expect(target.searchParams.has("next")).toBe(false);
    await expect(page.locator(".app-entry-actions .quote-focus-button")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
