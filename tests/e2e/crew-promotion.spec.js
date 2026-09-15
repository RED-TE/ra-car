const { test, expect } = require("@playwright/test");

test("crew login shows the 100-contract vehicle promotion and remembers dismissal per tab", async ({ page }) => {
  await page.goto("/crew/login.html");
  const notice = page.locator("#crewPromotionNotice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Tesla Model Y");
  await expect(notice).toContainText("100대");
  await expect(notice).toContainText("취소·보상 제외 건은 집계되지 않습니다");
  const benefitLink = notice.getByRole("link", { name: /혜택 기준 보기/ });
  await expect(benefitLink).toHaveAttribute("href", "./guide/#rewards");
  await benefitLink.click();
  await expect(page).toHaveURL(/\/crew\/guide\/#rewards$/);
  await page.goBack();
  await expect(notice).toBeVisible();

  await page.getByRole("button", { name: "프로모션 알림 닫기" }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await expect(notice).toBeHidden();
  await expect(page.locator("#crewId")).toBeVisible();
});

test("mobile promotion stays in the page flow without covering the login controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/crew/login.html");
  await expect(page.locator("#crewPromotionNotice")).toBeVisible();
  await expect(page.locator("#crewId")).toBeVisible();
  await expect(page.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
  expect(await page.evaluate(() => {
    const promotion = document.querySelector("#crewPromotionNotice").getBoundingClientRect();
    const login = document.querySelector("#crewId").getBoundingClientRect();
    return promotion.bottom <= login.top && document.documentElement.scrollWidth <= innerWidth + 1;
  })).toBe(true);
});
