const fs = require("node:fs");
const path = require("node:path");
const { expect, test } = require("@playwright/test");

const artifactDir = path.resolve(__dirname, "../../artifacts/crew-knowledge");
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

test.beforeAll(() => {
  fs.mkdirSync(artifactDir, { recursive: true });
});

for (const viewport of viewports) {
  test(`layout has no horizontal page overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/crew/knowledge/preview/");

    const metrics = await page.locator("html").evaluate((root) => ({
      clientWidth: root.clientWidth,
      maxHeadingLines: Math.max(
        ...[...document.querySelectorAll("main h2")].map((heading) => {
          const styles = getComputedStyle(heading);
          return Math.round(heading.getBoundingClientRect().height / Number.parseFloat(styles.lineHeight));
        }),
      ),
      scrollWidth: root.scrollWidth,
      visibleRepeatedCounts: {
        customers: [...document.querySelectorAll("[data-customer-grid] .customer-card")].filter((node) => node.offsetParent !== null).length,
        facts: [...document.querySelectorAll("[data-fact-grid] .fact-card")].filter((node) => node.offsetParent !== null).length,
        faqs: [...document.querySelectorAll("[data-faq-list] details")].filter((node) => node.offsetParent !== null).length,
        sources: [...document.querySelectorAll("[data-source-list] .source-link")].filter((node) => node.offsetParent !== null).length,
        terms: [...document.querySelectorAll("[data-term-grid] .term-card")].filter((node) => node.offsetParent !== null).length,
      },
    }));

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.maxHeadingLines).toBeLessThanOrEqual(2);
    expect(Math.max(...Object.values(metrics.visibleRepeatedCounts))).toBeLessThanOrEqual(3);
  });
}

test("200 percent page zoom keeps content inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/crew/knowledge/preview/");
  await page.locator("html").evaluate((root) => {
    root.style.zoom = "2";
  });

  const metrics = await page.locator("html").evaluate((root) => ({
    clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  await expect(page.getByRole("heading", { name: "RE:CAR 크루 콘텐츠 가이드" })).toBeVisible();
});

test("mobile menu and section search stay available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/crew/knowledge/preview/");

  await expect(page.getByRole("button", { name: "가이드 검색", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await expect(page.locator("#mobileMenu")).toBeVisible();
  await expect(page.locator("[data-mobile-menu-links] a")).toHaveCount(15);
  const lastMenuLink = page.locator("[data-mobile-menu-links] a").last();
  await lastMenuLink.scrollIntoViewIfNeeded();
  await expect(lastMenuLink).toBeVisible();
  await page.getByRole("button", { name: "메뉴 닫기", exact: true }).click();
  await expect(page.locator("#mobileMenu")).toBeHidden();
});

test("core sections and mobile full page are captured", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/crew/knowledge/preview/");

  const captures = [
    ["01-hero", "#top"],
    ["02-recar-advantage", "#recar"],
    ["03-four-ways", "#ways"],
    ["04-rental-guide", "#rent"],
    ["05-lease-guide", "#lease"],
    ["06-monthly-payment", "#payment"],
    ["07-economy-lens", "#economy"],
    ["08-crew-side-work", "#crew-work"],
    ["09-glossary", "#terms"],
    ["10-customer-types", "#customers"],
    ["11-fact-library", "#facts"],
    ["12-safe-expression", "#phrases"],
  ];

  for (const [name, selector] of captures) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await page.locator(selector).screenshot({
      animations: "disabled",
      path: path.join(artifactDir, `${name}-1440x900.png`),
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/crew/knowledge/preview/");
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: path.join(artifactDir, "13-mobile-full-390x844.png"),
  });
});
