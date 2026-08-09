const { AxeBuilder } = require("@axe-core/playwright");
const { expect, test } = require("@playwright/test");

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`axe has no accessibility violations on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/crew/guide/preview/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.length,
      })),
    ).toEqual([]);
  });
}

test("keyboard focus, dialogs, and reduced motion remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/crew/guide/preview/");

  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();

  await page.getByRole("button", { name: "가이드 검색", exact: true }).click();
  await expect(page.getByPlaceholder("예: 중도해지, 재테크, 크루 부업")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#searchDialog")).not.toHaveAttribute("open", "");

  const scrollBehavior = await page.locator("html").evaluate((element) => getComputedStyle(element).scrollBehavior);
  expect(scrollBehavior).toBe("auto");
});
