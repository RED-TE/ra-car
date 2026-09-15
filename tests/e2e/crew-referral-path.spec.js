const { test, expect } = require("@playwright/test");

const code = "RC-QA1234";

test("individual crew link serves the homepage and attributes an inquiry", async ({ page }) => {
  let lead = null;
  await page.route("https://api.recarplan.com/api/v1/friends/track**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"recorded":true}' }),
  );
  await page.route("**/api/leads", async route => {
    lead = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: '{"ok":true,"stored":"firebase","firebase":{"stored":true}}' });
  });

  await page.goto(`/r/${code}`);
  await expect(page).toHaveURL(new RegExp(`/r/${code}$`));
  await expect(page.locator("[data-referral-notice]")).toBeVisible();
  await expect(page.locator("[data-referral-code]")).toHaveText(code);
  await expect(page.locator("#vehicleWish")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("recar_referral_code"))).toBe(code);

  await page.locator("#vehicleWish").fill("쏘렌토 하이브리드");
  await page.locator("#contactPhone").fill("010-1234-5678");
  await page.locator("#customerName").fill("홍길동");
  await page.locator("#privacyConsent").check();
  await page.locator("#termsConsent").check();
  await page.getByRole("button", { name: "조건 확인하기", exact: true }).click();

  await expect(page.locator(".form-status")).toContainText("문의가 접수되었습니다");
  expect(lead).toMatchObject({ referralCode: code, referralEntryPath: `/r/${code}`, entryPoint: "크루 전용 링크" });
});

test("crew login has a usable first visit at mobile and desktop", async ({ page }) => {
  await page.goto("/crew/login.html");
  await expect(page.locator("#crewId")).toBeVisible();
  await expect(page.getByRole("link", { name: /크루 신청/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("#crewId")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("crew dashboard copies the disclosure and uses an individual link", async ({ context, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => localStorage.setItem("recar_friends_access_token", "qa-token"));
  await page.route("**/api/v1/friends/status", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"applied":true,"status":"APPROVED","name":"QA 크루","login_id":"qa"}' }));
  await page.route("**/api/v1/friends/dashboard", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ referral_code: code, referral_link: `https://recarplan.com/app/?ref=${code}`, click_count: 8, total_referrals: 3, settlement: { pending_month_amount: 350000 }, recent_events: [] }) }));

  await page.goto("/crew/index.html");
  await expect(page.locator("#crewShareLink")).toHaveValue(`https://recarplan.com/r/${code}`);
  await expect(page.locator("#crewShareVisits")).toHaveText("8");
  await expect(page.locator("#crewShareReferrals")).toHaveText("3");
  await page.locator("#crewShareCopy").click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`https://recarplan.com/r/${code}`);
  expect(copied).toContain("크루 활동의 일환");
  expect(copied).toContain("수수료가 지급될 수 있습니다");
  await page.screenshot({ path: "test-results/crew-dashboard-after-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#crewShareCopy")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "test-results/crew-dashboard-after-mobile.png" });
});

test("transient crew API failure leaves the session intact and offers retry", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("recar_friends_access_token", "qa-token"));
  let requests = 0;
  await page.route("**/api/v1/friends/status", route => {
    requests += 1;
    return route.fulfill(requests === 1
      ? { status: 503, contentType: "application/json", body: '{"detail":"Temporarily unavailable"}' }
      : { status: 200, contentType: "application/json", body: '{"applied":true,"status":"APPROVED","name":"QA 크루"}' });
  });
  await page.route("**/api/v1/friends/dashboard", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ referral_code: code, click_count: 0, total_referrals: 0, settlement: { pending_month_amount: 0 }, recent_events: [] }) }));

  await page.goto("/crew/index.html");
  await expect(page.locator("#crewLoadError")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("recar_friends_access_token"))).toBe("qa-token");
  await page.locator("#crewLoadRetry").click();
  await expect(page.locator("#crewLoadError")).toBeHidden();
  await expect(page.locator("#crewShareLink")).toHaveValue(`https://recarplan.com/r/${code}`);
});
