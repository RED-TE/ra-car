const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const fixture = require("../../web_app/test/fixtures/new3_catalog_20261015.json");

const root = path.resolve(__dirname, "../..");
const code = "RC-QA1234";

async function mockReadOnlyApi(page) {
  const tracked = [];
  await page.route("https://api.recarplan.com/**", route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "*",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() !== "GET") return route.abort();
    if (url.pathname.startsWith("/assets/")) return route.continue();
    let json = [];
    if (url.pathname === "/api/v1/friends/track") {
      tracked.push(url.href);
      json = { recorded: true };
    } else if (/\/vehicles\/?$/.test(url.pathname)) {
      json = { items: fixture.catalog, total: 3, page: 1, size: 100, pages: 1 };
    } else if (/\/vehicles\//.test(url.pathname)) {
      json = fixture.details.find(item => url.pathname.endsWith(item.id)) || {};
    } else if (url.pathname === "/api/v1/home-pick") {
      json = { enabled: false, items: [] };
    }
    return route.fulfill({ status: 200, headers, json });
  });
  await page.route("https://www.gstatic.com/flutter-canvaskit/**", route => {
    const suffix = new URL(route.request().url()).pathname.split("/").slice(3).join("/");
    const file = path.join(root, "app/canvaskit", suffix);
    if (!file.startsWith(path.join(root, "app/canvaskit") + path.sep) || !fs.existsSync(file)) return route.abort();
    return route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      contentType: file.endsWith(".wasm") ? "application/wasm" : "text/javascript",
      body: fs.readFileSync(file),
    });
  });
  await page.route("**/firestore.googleapis.com/**", route => route.abort());
  return tracked;
}

async function appReady(page, url) {
  await page.goto(url);
  await page.waitForSelector("flt-semantics-placeholder", { state: "attached" });
  await page.evaluate(() => document.querySelector("flt-semantics-placeholder").click());
  await expect(page.getByRole("heading", { name: "RE:CAR", exact: true })).toBeAttached({ timeout: 30000 });
  await expect(page.getByRole("button", { name: "전체 차량", exact: true })).toBeAttached();
}

for (const entry of ["/", "/inquiry/", "/app/"]) {
  for (const width of [360, 390, 768, 1440]) {
    test(`${entry} runs the same real app at ${width}px without redirect or overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockReadOnlyApi(page);
      const loadedScripts = [];
      page.on("request", request => {
        if (request.resourceType() === "script") loadedScripts.push(new URL(request.url()).pathname);
      });
      await appReady(page, `${entry}?utm_source=entry-test`);
      expect(new URL(page.url()).pathname).toBe(entry);
      expect(new URL(page.url()).searchParams.get("utm_source")).toBe("entry-test");
      await expect(page.locator("base")).toHaveAttribute("href", "/app/");
      expect(loadedScripts).toContain("/app/main.dart.js");
      expect(loadedScripts).not.toContain("/home.js");
      expect(loadedScripts).not.toContain("/script.js");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `test-results/app-entry-${entry.replaceAll("/", "-")}-${width}.png` });
      await page.getByRole("button", { name: "전체 차량", exact: true }).click();
      await expect(page.getByRole("button", { name: /^제네시스 GV80 Hybrid, 월/ })).toBeAttached({ timeout: 15000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  }
}

test("main and inquiry retain explicit referral attribution in the actual app", async ({ page }) => {
  const tracked = await mockReadOnlyApi(page);
  for (const entry of ["/", "/inquiry/"]) {
    await appReady(page, `${entry}?ref=${code}&utm_campaign=preserved#quote`);
    expect(new URL(page.url()).hash).not.toBe("#quote");
    expect(new URL(page.url()).searchParams.get("ref")).toBe(code);
    expect(new URL(page.url()).searchParams.get("utm_campaign")).toBe("preserved");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("flutter.recar_referral_code"))).toBe(JSON.stringify(code));
  }
  expect(tracked.length).toBeGreaterThanOrEqual(2);
  for (const url of tracked) expect(new URL(url).searchParams.get("code")).toBe(code);
});

test("legacy stored referral reaches the app without overwriting saved records", async ({ page }) => {
  await mockReadOnlyApi(page);
  await page.addInitScript(() => {
    localStorage.setItem("recar_referral_code", "RC-OLD123");
    localStorage.setItem("unrelated-saved-quote", "preserve-me");
  });
  await appReady(page, "/?utm_source=legacy");
  expect(new URL(page.url()).searchParams.get("ref")).toBe("RC-OLD123");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("flutter.recar_referral_code"))).toBe('"RC-OLD123"');
  expect(await page.evaluate(() => localStorage.getItem("unrelated-saved-quote"))).toBe("preserve-me");
});
