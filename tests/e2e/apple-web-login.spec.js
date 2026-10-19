const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const fixture = require("../../web_app/test/fixtures/new3_catalog_20261015.json");

const root = path.resolve(__dirname, "../..");
const user = { id: "synthetic-apple-user", email: "synthetic@example.test", nickname: "검증 계정",
  role: "CUSTOMER", is_active: true, profile_onboarding_completed: true };

async function mockApple(page, { available = true, wrongState = false } = {}) {
  const completions = [];
  await page.route("https://api.recarplan.com/**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "*", "cache-control": "no-store" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let json = [];
    if (pathname === "/api/v1/auth/apple/start") {
      if (!available) return route.fulfill({ status: 503, headers, json: { detail: "Apple setup pending" } });
      json = { client_id: "synthetic.web", nonce: "synthetic-nonce", state: "synthetic-state", redirect_uri: request.postDataJSON().redirect_uri };
    } else if (pathname === "/api/v1/auth/apple") {
      completions.push(request.postDataJSON());
      json = { access_token: "synthetic-apple-recar-session", user };
    } else if (pathname === "/api/v1/users/me") {
      json = user;
    } else if (/\/vehicles\/?$/.test(pathname)) {
      json = { items: fixture.catalog, total: 3, page: 1, size: 100, pages: 1 };
    } else if (/\/vehicles\//.test(pathname)) {
      json = fixture.details.find(item => pathname.endsWith(item.id)) || {};
    } else if (pathname === "/api/v1/home-pick") {
      json = { enabled: false, items: [] };
    }
    return route.fulfill({ status: 200, headers, json });
  });
  await page.route("https://appleid.cdn-apple.com/**", route => route.fulfill({
    status: 200, contentType: "text/javascript", body: `window.AppleID={auth:{init(o){window.syntheticAppleOptions=o},async signIn(){return {authorization:{code:'synthetic-code',id_token:'synthetic-identity',state:${wrongState ? "'wrong-state'" : "window.syntheticAppleOptions.state"}}}}}};`,
  }));
  await page.route("https://www.gstatic.com/flutter-canvaskit/**", route => {
    const suffix = new URL(route.request().url()).pathname.split("/").slice(3).join("/");
    const file = path.join(root, "app/canvaskit", suffix);
    if (!file.startsWith(path.join(root, "app/canvaskit") + path.sep) || !fs.existsSync(file)) return route.abort();
    return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: file.endsWith(".wasm") ? "application/wasm" : "text/javascript", body: fs.readFileSync(file) });
  });
  await page.route("**/firestore.googleapis.com/**", route => route.abort());
  return completions;
}

async function openLogin(page, entry) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${entry}#/login`);
  await page.waitForSelector("flt-semantics-placeholder", { state: "attached" });
  await page.evaluate(() => document.querySelector("flt-semantics-placeholder").click());
}

for (const entry of ["/", "/app/"]) {
  test(`${entry} Apple returns to the normal account without a reload or native SDK`, async ({ page, baseURL }) => {
    const completions = await mockApple(page);
    await openLogin(page, entry);
    const apple = page.getByRole("button", { name: /Apple/ });
    await expect(apple).toBeEnabled();
    await apple.click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("flutter.auth_access_token"))).toBe('"synthetic-apple-recar-session"');
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({ identity_token: "synthetic-identity", state: "synthetic-state" });
    expect(completions[0].code_verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    const options = await page.evaluate(() => window.syntheticAppleOptions);
    expect(options).toMatchObject({ clientId: "synthetic.web", redirectURI: `${baseURL}${entry}`, nonce: "synthetic-nonce", state: "synthetic-state", usePopup: true });
  });
}

test("missing Apple configuration keeps email and Kakao available without a dead Apple button", async ({ page }) => {
  await mockApple(page, { available: false });
  await openLogin(page, "/app/");
  await expect(page.getByRole("button", { name: "카카오로 계속하기" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Apple/ })).toHaveCount(0);
});

test("wrong Apple response state does not submit identity or establish a session", async ({ page }) => {
  const completions = await mockApple(page, { wrongState: true });
  await openLogin(page, "/app/");
  await page.getByRole("button", { name: /Apple/ }).click();
  await expect(page.locator("flt-semantics").getByText("Apple 로그인 확인 정보가 만료됐습니다. 다시 시작해 주세요.", { exact: true })).toBeAttached();
  expect(completions).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem("flutter.auth_access_token"))).toBeNull();
});
