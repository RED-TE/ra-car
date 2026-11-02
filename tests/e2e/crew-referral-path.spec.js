const { test, expect } = require("@playwright/test");
const { legacyHomeFixture } = require("./helpers/legacy-home.cjs");

const code = "RC-QA1234";

test("retired legacy homepage preserves referral and entry in the official inquiry without alternate writes", async ({ page, baseURL }) => {
  await legacyHomeFixture(page);
  const posts = [];
  const blocked = [];
  const errors = [];
  const origin = new URL(baseURL).origin;
  const vehicle = { id: "synthetic-crew-car", brand: "기아", model_name: "합성 크루 차량", available_product_types: ["LEASE"] };
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
    if (url.origin === "https://api.recarplan.com") {
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (request.method() === "GET" && url.pathname === "/api/v1/friends/track") return route.fulfill({ headers, json: { recorded: true } });
      if (request.method() === "GET" && url.pathname === "/api/v1/vehicles/discovery") return route.fulfill({ headers, json: {
        contract_version: "discovery_v1", complete: true, total: 1, revision: "b".repeat(64), items: [vehicle],
      } });
      if (request.method() === "GET" && url.pathname === `/api/v1/vehicles/${vehicle.id}`) return route.fulfill({ headers, json: {
        id: vehicle.id, trims: [{ id: "synthetic-crew-trim", name: "합성 선택 트림", is_available: true, colors: [] }],
        trim_selection: { mode: "FLAT", flat_grades: [{ vehicle_trim_id: "synthetic-crew-trim", is_active: true }] },
      } });
      if (request.method() === "POST" && url.pathname === "/api/v1/support/quote-inquiries") {
        posts.push(request.postDataJSON());
        return route.fulfill({ status: 201, headers, json: { id: "synthetic-official-receipt", status: "NEW" } });
      }
    }
    if (url.origin === origin && request.method() === "GET" && url.pathname === "/api/recar/vehicles") {
      return route.fulfill({ json: { ok: true, items: [] } });
    }
    if (url.origin === origin && ["GET", "HEAD"].includes(request.method()) && !url.pathname.startsWith("/api/")) return route.fallback();
    blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });

  await page.goto(`/?ref=${code}&utm_source=synthetic-crew&utm_campaign=retired-query`);
  await expect(page.locator("[data-referral-notice]")).toBeVisible();
  await expect(page.locator("[data-referral-code]")).toHaveText(code);
  await expect(page.locator("#vehicleWish")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("recar_referral_code"))).toBe(code);

  await page.locator("#vehicleWish").fill("쏘렌토 하이브리드");
  await page.locator("#contactPhone").fill("010-0000-0000");
  await page.locator("#customerName").fill("합성 문의 고객");
  await page.locator("#privacyConsent").check();
  await page.locator("#termsConsent").check();
  await page.getByRole("button", { name: "조건 확인하기", exact: true }).click();

  await expect(page.locator(".form-status")).toContainText("이 접수 방식은 종료되었습니다");
  await expect(page.locator(".form-status")).not.toContainText("문의가 접수되었습니다");
  expect(posts).toHaveLength(0);
  const link = page.getByRole("link", { name: "공식 문의 화면으로 이동" });
  const target = new URL(await link.getAttribute("href"), baseURL);
  expect(Object.fromEntries(target.searchParams)).toEqual({
    utm_source: "synthetic-crew", utm_campaign: "retired-query", ref: code, entry_path: "/",
  });
  await link.click();
  await expect(page).toHaveURL(/\/inquiry\/\?.*#step1$/);
  await expect(page.locator('[data-brand="기아"]')).toBeVisible();
  await page.locator('[data-brand="기아"]').click();
  await page.locator("#nextButton").click();
  await page.locator(`[data-vehicle="${vehicle.id}"]`).click();
  await page.locator("#nextButton").click();
  await page.locator('[data-trim="synthetic-crew-trim"]').click();
  await page.locator("#nextButton").click();
  await page.locator("#nextButton").click();
  await expect(page.locator("#customerName")).toHaveValue("");
  await expect(page.locator("#customerPhone")).toHaveValue("");
  await page.locator("#customerName").fill("합성 문의 고객");
  await page.locator("#customerPhone").fill("010-0000-0000");
  await page.locator("#nextButton").click();
  await expect(page.locator("#privacyAgree")).not.toBeChecked();
  await expect(page.locator("#nextButton")).toBeDisabled();
  expect(posts).toHaveLength(0);
  await page.locator("#agreeAll").check();
  await page.locator("#nextButton").click();
  await expect(page.locator("#successTitle")).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    name: "합성 문의 고객", phone: "01000000000", referral_code: code, privacy_agreed: true,
    vehicle_name: "기아 합성 크루 차량", trim_name: "합성 선택 트림", product_type: "LEASE",
    term_months: 60, mileage_per_year: 20000, quoted_monthly_payment: null,
  });
  // The API has no entry-path/UTM fields: retain them in the URL, never invent a server field.
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(Object.fromEntries(target.searchParams));
  expect(posts[0]).not.toHaveProperty("entry_path");
  expect(posts[0]).not.toHaveProperty("referral_entry_path");
  expect(blocked).toEqual([]);
  expect(errors).toEqual([]);
});

test("a later different referral cannot inherit an earlier crew entry path", async ({ page }) => {
  await legacyHomeFixture(page);
  await page.route("https://api.recarplan.com/api/v1/friends/track**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"recorded":true}' }),
  );
  await page.goto(`/?ref=${code}`);
  await page.goto("/?ref=RC-OTHER1");
  expect(await page.evaluate(() => ({
    code: localStorage.getItem("recar_referral_code"),
    path: sessionStorage.getItem("recar_referral_entry_path"),
  }))).toEqual({ code: "RC-OTHER1", path: null });
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
  await expect(page.locator("#crewShareLink")).toHaveValue(`https://recarplan.com/app/?ref=${code}`);
  await expect(page.locator("#crewShareVisits")).toHaveText("8");
  await expect(page.locator("#crewShareReferrals")).toHaveText("3");
  await page.locator("#crewShareCopy").click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`https://recarplan.com/app/?ref=${code}`);
  expect(copied).toContain("크루 활동의 일환");
  expect(copied).toContain("RE:CAR로부터 수수료를 지급받습니다");
  expect(copied).toContain("계약·차량 인도 완료 등 유효 실적");
  expect(copied).toContain("크루 추천 수수료를 별도로 청구하지 않습니다");
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
  await expect(page.locator("#crewShareLink")).toHaveValue(`https://recarplan.com/app/?ref=${code}`);
});
