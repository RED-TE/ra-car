const { test, expect } = require("@playwright/test");

async function syntheticApi(page, baseURL) {
  const origin = new URL(baseURL).origin;
  expect(["127.0.0.1", "localhost"]).toContain(new URL(origin).hostname);
  const posts = [], unexpected = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "*" };
    if (url.origin === "https://api.recarplan.com") {
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (request.method() === "GET" && url.pathname === "/api/v1/vehicles/discovery") {
        return route.fulfill({ headers, json: { contract_version: "discovery_v1", complete: true, revision: "a".repeat(64), total: 2, items: [
          { id: "synthetic-rental", brand: "현대", model_name: "합성 렌트 차량", available_product_types: ["RENTAL"] },
          { id: "synthetic-lease", brand: "기아", model_name: "미지원 리스 차량", available_product_types: ["LEASE"] },
        ] } });
      }
      if (request.method() === "GET" && url.pathname === "/api/v1/vehicles/synthetic-rental") {
        return route.fulfill({ headers, json: { id: "synthetic-rental", trims: [{ id: "synthetic-trim", name: "합성 트림", is_available: true, colors: [] }], trim_selection: { mode: "FLAT", flat_grades: [{ vehicle_trim_id: "synthetic-trim", is_active: true }] } } });
      }
      if (request.method() === "POST" && url.pathname === "/api/v1/support/quote-inquiries") {
        posts.push(request.postDataJSON());
        return route.fulfill({ status: 201, headers, json: { id: "synthetic-receipt", status: "NEW" } });
      }
    }
    if (url.origin === origin && ["GET", "HEAD"].includes(request.method()) && !url.pathname.startsWith("/api/")) return route.continue();
    unexpected.push(request.method() + " " + url.origin + url.pathname);
    return route.abort("blockedbyclient");
  });
  return { posts, unexpected, errors };
}

test("published steps URL uses the current rental form with fresh contact and consent", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const api = await syntheticApi(page, baseURL);
  const response = await page.goto("/inquiry/steps.html?ref=RC-LOCAL123&name=DO_NOT_COPY&phone=01000000000&product=LEASE&term=24&prepayment=30&privacy_agreed=true");
  expect(response.status()).toBe(200);
  await page.locator('[data-brand="현대"]').click();
  await expect(page.locator('[data-brand="기아"]')).toHaveCount(0);
  await page.locator("#nextButton").click();
  await page.locator('[data-vehicle="synthetic-rental"]').click();
  await page.locator("#nextButton").click();
  await page.locator('[data-trim="synthetic-trim"]').click();
  await page.locator("#nextButton").click();
  await expect(page.locator('[data-product="RENTAL"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-product="LEASE"]')).toHaveCount(0);
  await page.locator("#nextButton").click();
  await expect(page.locator("#customerName")).toHaveValue("");
  await expect(page.locator("#customerPhone")).toHaveValue("");
  await page.locator("#customerName").fill("합성 문의");
  await page.locator("#customerPhone").fill("010-0000-0000");
  await page.locator("#nextButton").click();
  await expect(page.locator("#privacyAgree")).not.toBeChecked();
  await expect(page.locator("#noticeAgree")).not.toBeChecked();
  await expect(page.locator("#nextButton")).toBeDisabled();
  expect(api.posts).toEqual([]);
  await page.locator("#agreeAll").check();
  await page.locator("#nextButton").click();
  await expect(page.locator("#successTitle")).toBeVisible();
  expect(api.posts).toHaveLength(1);
  expect(api.posts[0]).toMatchObject({ product_type: "RENTAL", quoted_monthly_payment: null, term_months: 60, referral_code: "RC-LOCAL123", name: "합성 문의", privacy_agreed: true });
  expect(api.unexpected).toEqual([]);
  expect(api.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const [name, entry, module] of [
  ["runtime", "/inquiry/landing-runtime.mjs", true],
  ["recommendation script", "/inquiry/landing-assets/js/car-match.js", false],
  ["landing script", "/inquiry/landing-assets/js/landing.js", false],
]) {
  test("cached " + name + " hands off attribution without old prices or automatic submission", async ({ page, baseURL }) => {
    const api = await syntheticApi(page, baseURL);
    await page.route("**/inquiry/cached-document.html?*", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><script ' + (module ? 'type="module" ' : '') + 'src="' + entry + '"></script></body></html>' }));
    await page.goto("/inquiry/cached-document.html?ref=rc-local123&utm_source=cached&product=LEASE&monthly=1&name=PRIVATE&phone=01000000000&privacy_agreed=true");
    await expect(page).toHaveURL(/\/inquiry\/steps\.html\?ref=RC-LOCAL123&utm_source=cached#step1$/);
    await expect(page.locator('[data-brand="현대"]')).toBeVisible();
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ ref: "RC-LOCAL123", utm_source: "cached" });
    expect(api.posts).toEqual([]);
    expect(api.unexpected).toEqual([]);
    expect(api.errors).toEqual([]);
  });
}
