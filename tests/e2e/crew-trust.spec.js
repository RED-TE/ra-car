const { test, expect } = require("@playwright/test");
const { AxeBuilder } = require("@axe-core/playwright");

test("public entry separates introduction, application and approved dashboard", async ({ page }) => {
  let apiCalls = 0;
  await page.route("https://api.recarplan.com/**", route => { apiCalls += 1; return route.abort(); });
  await page.goto("/crew/");
  await expect(page).toHaveURL(/\/crew\/welcome\.html$/);
  await expect(page.locator("h1")).toContainText("RE:CAR 크루");
  await expect(page.locator("body")).not.toContainText("8,400,000");
  await expect(page.locator("body")).not.toContainText("2026.08.10");
  await expect(page.getByRole("link", { name: "크루 신청", exact: true }).first()).toHaveAttribute("href", "./login.html?action=apply");
  expect(apiCalls).toBe(0);
  await page.getByRole("link", { name: "크루 신청", exact: true }).first().click();
  await expect(page.locator("#crewApplyForm")).toBeVisible();
  await expect(page.locator("#crewLoginForm")).toBeHidden();
});

test("old public root referrals still open the app with the code intact", async ({ page }) => {
  await page.goto("/crew/?ref=rc-qa1234");
  await expect(page).toHaveURL(/\/app\/\?ref=RC-QA1234$/);
});

test("policies identify the Crew operator and distinguish eligibility from payment", async ({ page }) => {
  await page.goto("/crew/policy.html");
  for (const text of ["조홍철", "20만원", "35만원", "45만원", "최소 30만원", "다음 달 25일", "자기 추천", "세전", "BMW·Tesla·벤츠·제네시스", "소유하게 되는 혜택이 아닙니다", "기존 동의 기록"]) {
    await expect(page.locator("main")).toContainText(text);
  }
  await expect(page.locator("main")).not.toContainText("조용철");
  await expect(page.locator("main")).not.toContainText("325-60-00844");
});

test("guide detail and application promotion use the same choice policy", async ({ page }) => {
  await page.goto("/crew/guide/#rewards");
  await expect(page.locator(".milestone-benefit")).toContainText("BMW·Tesla·벤츠·제네시스");
  await page.locator("[data-open-reward-detail]").click();
  await expect(page.locator("#detailDialog")).toBeVisible();
  await expect(page.locator("#detailDialog")).toContainText("BMW·Tesla·벤츠·제네시스");
  await expect(page.locator("#detailDialog")).toContainText("취소·보상 제외 건 제외");
});

for (const width of [360, 390, 768, 1440]) {
  for (const path of ["/crew/welcome.html", "/crew/policy.html", "/crew/login.html?action=apply", "/crew/njob/", "/crew/guide/#rewards"]) {
    test(`${path} stays readable and accessible at ${width}px`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.locator(".crew-operator-footer")).toContainText("조홍철");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations;
      expect(violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
      if (path.includes("login")) {
        expect(await page.locator(".crew-consent-group .crew-checkbox").first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
      }
    });
  }
}

test("normal-motion Njob explanation becomes fully readable when scrolled into view", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/crew/njob/");
  await page.locator(".overview-copy").scrollIntoViewIfNeeded();
  await expect(page.locator(".overview-copy")).toHaveClass(/is-visible/);
  await expect(page.locator(".overview-copy")).toHaveCSS("opacity", "1");
  await expect(page.locator(".overview-download-link")).toBeVisible();
});
