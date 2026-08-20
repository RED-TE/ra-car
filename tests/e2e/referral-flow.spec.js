const { expect, test } = require("@playwright/test");

const referralCode = "RC-QA1234";
const trackPattern = "https://api.recarplan.com/api/v1/friends/track**";

test("referral link stores, displays, tracks, and copies the code", async ({ context, page }) => {
  const trackedUrls = [];
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route(trackPattern, async (route) => {
    trackedUrls.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"recorded":true}' });
  });

  await page.goto(`/?ref=${referralCode.toLowerCase()}`);

  await expect(page.locator("[data-referral-notice]")).toBeVisible();
  await expect(page.locator("[data-referral-details]")).toBeHidden();
  await page.getByRole("button", { name: "추천 코드 확인", exact: true }).click();
  await expect(page.locator("[data-referral-details]")).toBeVisible();
  await expect(page.locator("[data-referral-code]")).toHaveText(referralCode);
  expect(await page.evaluate(() => localStorage.getItem("recar_referral_code"))).toBe(referralCode);
  expect(trackedUrls).toHaveLength(1);
  expect(new URL(trackedUrls[0]).searchParams.get("code")).toBe(referralCode);

  await page.getByRole("button", { name: "추천 코드 복사", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(referralCode);
  await expect(page.getByRole("button", { name: "추천 코드 복사됨", exact: true })).toBeVisible();
});

test("stored referral code is attached to a quote request", async ({ page }) => {
  let leadPayload = null;
  await page.route(trackPattern, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"recorded":true}' }),
  );
  await page.route("**/api/leads", async (route) => {
    leadPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: '{"ok":true,"stored":"firebase","firebase":{"stored":true}}',
    });
  });

  await page.goto(`/?ref=${referralCode}`);
  await page.locator("#vehicleWish").fill("쏘렌토 하이브리드");
  await page.locator("#contactPhone").fill("010-1234-5678");
  await page.locator("#customerName").fill("홍길동");
  await page.locator("#privacyConsent").check();
  await page.locator("#termsConsent").check();
  await page.getByRole("button", { name: "조건 확인하기", exact: true }).click();

  await expect(page.locator(".form-status")).toContainText("문의가 접수되었습니다");
  expect(leadPayload).toMatchObject({
    referralCode,
    vehicle: "쏘렌토 하이브리드",
    phone: "010-1234-5678",
    customerName: "홍길동",
  });
});

test("invalid referral text is ignored", async ({ page }) => {
  await page.goto("/?ref=%3Cscript%3Ealert(1)%3C%2Fscript%3E");

  await expect(page.locator("[data-referral-notice]")).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("recar_referral_code"))).toBeNull();
});

test("legacy download referral link reaches the working referral page", async ({ page }) => {
  await page.route(trackPattern, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"recorded":true}' }),
  );

  await page.goto(`/download?ref=${referralCode}`);

  await expect(page).toHaveURL(new RegExp(`\\/\\?ref=${referralCode}$`));
  await expect(page.locator("[data-referral-notice]")).toBeVisible();
  await page.getByRole("button", { name: "추천 코드 확인", exact: true }).click();
  await expect(page.locator("[data-referral-code]")).toHaveText(referralCode);
});

test("legacy crew referral link reaches the homepage with its code", async ({ page }) => {
  await page.route(trackPattern, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"recorded":true}' }),
  );

  await page.goto(`/crew?ref=${referralCode}`);

  await expect(page).toHaveURL(new RegExp(`\\/\\?ref=${referralCode}$`));
  await expect(page.locator("[data-referral-notice]")).toBeVisible();
  await page.getByRole("button", { name: "추천 코드 확인", exact: true }).click();
  await expect(page.locator("[data-referral-code]")).toHaveText(referralCode);
});
