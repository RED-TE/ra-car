const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const fixture = require("../../web_app/test/fixtures/new3_catalog_20261015.json");

const root = path.resolve(__dirname, "../..");
const state = "synthetic-kakao-state";
const verifier = "v".repeat(64);
const user = {
  id: "synthetic-kakao-user", email: "synthetic@example.test",
  nickname: "검증 계정", role: "CUSTOMER", is_active: true,
  profile_onboarding_completed: true,
};

async function mockApi(page, { startStatus = 200 } = {}) {
  const requests = [];
  await page.route("https://api.recarplan.com/**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "*",
      "cache-control": "no-store",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let json = [];
    if (pathname.endsWith("/oauth/kakao/web/start")) {
      const body = request.postDataJSON();
      requests.push({ kind: "start", body });
      if (startStatus !== 200) return route.fulfill({ status: startStatus, headers, json: { detail: "카카오 웹 로그인 설정을 확인 중입니다. 이메일 로그인을 이용해 주세요." } });
      const url = new URL("https://kauth.kakao.com/oauth/authorize");
      url.search = new URLSearchParams({ client_id: "synthetic-public-id", state, redirect_uri: body.redirect_uri, code_challenge: body.code_challenge, code_challenge_method: "S256" });
      json = { authorization_url: url.href, state };
    } else if (pathname.endsWith("/oauth/kakao/web/complete")) {
      requests.push({ kind: "complete", body: request.postDataJSON() });
      json = { access_token: "synthetic-recar-session", token_type: "bearer", user, is_new_user: false };
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
  await page.route("https://kauth.kakao.com/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Synthetic provider</title>" }));
  await page.route("https://www.gstatic.com/flutter-canvaskit/**", route => {
    const suffix = new URL(route.request().url()).pathname.split("/").slice(3).join("/");
    const file = path.join(root, "app/canvaskit", suffix);
    if (!file.startsWith(path.join(root, "app/canvaskit") + path.sep) || !fs.existsSync(file)) return route.abort();
    return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: file.endsWith(".wasm") ? "application/wasm" : "text/javascript", body: fs.readFileSync(file) });
  });
  await page.route("**/firestore.googleapis.com/**", route => route.abort());
  return requests;
}

async function semantics(page) {
  await page.waitForSelector("flt-semantics-placeholder", { state: "attached" });
  await page.evaluate(() => document.querySelector("flt-semantics-placeholder").click());
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

for (const entry of ["/", "/app/"]) {
  test(`${entry} Kakao button uses web OAuth, not the native SDK`, async ({ page, baseURL }) => {
    const requests = await mockApi(page);
    await page.goto(`${entry}#/login`);
    await semantics(page);
    await page.getByRole("button", { name: "카카오로 계속하기" }).click();
    await expect(page).toHaveURL(/^https:\/\/kauth\.kakao\.com\/oauth\/authorize\?/);
    expect(requests).toHaveLength(1);
    expect(requests[0].body.redirect_uri).toBe(`${baseURL}${entry}`);
    expect(requests[0].body.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(requests[0].body).not.toHaveProperty("code_verifier");
    expect(page.url()).not.toContain("client_secret");
  });

  test(`${entry} callback restores the normal account and removes provider parameters`, async ({ page }) => {
    const requests = await mockApi(page);
    await page.addInitScript(({ state, verifier }) => {
      sessionStorage.setItem("recar_kakao_login_pending", JSON.stringify({ state, verifier, expires_at: Date.now() + 600000 }));
      localStorage.setItem("preserved-saved-quote", "unchanged");
    }, { state, verifier });
    await page.goto(`${entry}?code=synthetic-code&state=${state}&utm_source=preserve`);
    await semantics(page);
    await expect(page.getByRole("heading", { name: "RE:CAR", exact: true })).toBeAttached({ timeout: 30000 });
    expect(requests.filter(item => item.kind === "complete")).toEqual([{ kind: "complete", body: { code: "synthetic-code", state, code_verifier: verifier } }]);
    const url = new URL(page.url());
    expect(url.searchParams.has("code")).toBe(false);
    expect(url.searchParams.has("state")).toBe(false);
    expect(url.searchParams.get("utm_source")).toBe("preserve");
    expect(await page.evaluate(() => sessionStorage.getItem("recar_kakao_login_pending"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("preserved-saved-quote"))).toBe("unchanged");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("flutter.auth_access_token"))).toBe('"synthetic-recar-session"');
  });
}

test("callback without browser proof stops without an exchange or refresh loop", async ({ page }) => {
  const requests = await mockApi(page);
  let documentLoads = 0;
  page.on("request", request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame() && request.resourceType() === "document") documentLoads++;
  });
  await page.goto(`/app/?code=synthetic-code&state=${state}`);
  await semantics(page);
  await expect(page.locator("flt-semantics").getByText("로그인 확인 정보가 없습니다. 카카오 로그인을 다시 시작해 주세요.", { exact: true })).toBeAttached();
  expect(requests).toEqual([]);
  expect(new URL(page.url()).searchParams.has("code")).toBe(false);
  expect(documentLoads).toBe(1);
  await expect(page.getByRole("button", { name: "카카오로 계속하기" })).toBeEnabled();
});

test("missing API configuration shows the actionable error without navigation", async ({ page }) => {
  const requests = await mockApi(page, { startStatus: 503 });
  await page.goto("/app/#/login");
  await semantics(page);
  await page.getByRole("button", { name: "카카오로 계속하기" }).click();
  await expect(page.locator("flt-semantics").getByText("카카오 웹 로그인 설정을 확인 중입니다. 이메일 로그인을 이용해 주세요.", { exact: true })).toBeAttached();
  expect(requests).toHaveLength(1);
  expect(new URL(page.url()).pathname).toBe("/app/");
  expect(await page.evaluate(() => sessionStorage.getItem("recar_kakao_login_pending"))).toBeNull();
});
