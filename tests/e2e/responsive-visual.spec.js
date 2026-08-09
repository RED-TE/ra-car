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
    await page.goto("/crew/guide/preview/");

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
  await page.goto("/crew/guide/preview/");
  await page.locator("html").evaluate((root) => {
    root.style.zoom = "2";
  });

  const metrics = await page.locator("html").evaluate((root) => ({
    clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  await expect(page.getByRole("heading", { name: "RE:CAR 크루 안내서" })).toBeVisible();
});

test("mobile menu and section search stay available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/crew/guide/preview/");

  await expect(page.getByRole("button", { name: "가이드 검색", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await expect(page.locator("#mobileMenu")).toBeVisible();
  await expect(page.locator("[data-mobile-menu-links] a")).toHaveCount(16);
  const lastMenuLink = page.locator("[data-mobile-menu-links] a").last();
  await lastMenuLink.scrollIntoViewIfNeeded();
  await expect(lastMenuLink).toBeVisible();
  await page.getByRole("button", { name: "메뉴 닫기", exact: true }).click();
  await expect(page.locator("#mobileMenu")).toBeHidden();
});

test("core sections and mobile full page are captured", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/crew/guide/preview/");

  const captures = [
    ["01-hero", "#top"],
    ["02-recar-advantage", "#recar"],
    ["03-four-ways", "#ways"],
    ["04-rental-guide", "#rent"],
    ["05-lease-guide", "#lease"],
    ["06-monthly-payment", "#payment"],
    ["07-deposit-prepayment", "#money"],
    ["08-insurance-guide", "#insurance"],
    ["09-contract-ending", "#ending"],
    ["10-economy-lens", "#economy"],
    ["11-crew-side-work", "#crew-work"],
    ["12-crew-rewards", "#rewards"],
    ["13-glossary", "#terms"],
    ["14-customer-types", "#customers"],
    ["15-fact-library", "#facts"],
    ["16-safe-expression", "#phrases"],
    ["17-official-sources", "#sources"],
  ];

  for (const [name, selector] of captures) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await page.locator(selector).screenshot({
      animations: "disabled",
      path: path.join(artifactDir, `${name}-1440x900.png`),
    });
  }

  await page.locator("[data-recar-mode='old']").click();
  await page.locator("#recar").screenshot({
    animations: "disabled",
    path: path.join(artifactDir, "02b-existing-five-step-1440x900.png"),
  });
  await page.locator("[data-recar-mode='recar']").click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/crew/guide/preview/");
  for (const image of await page.locator('img[loading="lazy"]').all()) {
    await image.scrollIntoViewIfNeeded();
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(200);
  await page.locator("#top").screenshot({
    animations: "disabled",
    path: path.join(artifactDir, "17-mobile-hero-390x844.png"),
  });
  await page.locator("[data-route-panel='recar']").evaluate((panel) => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, panel.getBoundingClientRect().top + window.scrollY - 90);
  });
  await page.screenshot({
    animations: "disabled",
    path: path.join(artifactDir, "18a-mobile-recar-direct-390x844.png"),
  });
  await page.locator("[data-recar-mode='old']").click();
  await page.screenshot({
    animations: "disabled",
    path: path.join(artifactDir, "18b-mobile-existing-five-step-390x844.png"),
  });
  await page.locator("[data-recar-mode='recar']").click();
  await page.locator("#rewards").evaluate((section) => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, section.offsetTop - 80);
  });
  await page.screenshot({
    animations: "disabled",
    path: path.join(artifactDir, "18c-mobile-crew-rewards-390x844.png"),
  });
  await page.locator("#payment").evaluate((section) => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, section.offsetTop - 80);
  });
  await page.waitForTimeout(100);
  await page.screenshot({
    animations: "disabled",
    path: path.join(artifactDir, "18-mobile-payment-390x844.png"),
  });
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: path.join(artifactDir, "19-mobile-full-390x844.png"),
  });
});
