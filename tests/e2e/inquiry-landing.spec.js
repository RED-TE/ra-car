const { test: base, expect } = require("@playwright/test");

const API = "https://api.recarplan.com";
const PUBLIC = "https://recarplan.com";
const REF = "RC-QA1234";
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#c8d3e3"/><path d="M70 140h260l-35-65H120z" fill="#3461a0"/></svg>';
const vehicles = [
  { id: "local-k5", brand: "Kia", model_name: "K5", available_product_types: ["RENTAL", "LEASE"], representative_monthly_price: 300000, displayed_product_type: "RENTAL", segment: "sedan", fuel: "gasoline", image_url: `${API}/assets/local-k5.svg` },
  { id: "local-sorento", brand: "Kia", model_name: "쏘렌토", available_product_types: ["RENTAL"], representative_monthly_price: 390000, displayed_product_type: "RENTAL", segment: "suv", fuel: "hybrid", image_url: `${API}/assets/local-sorento.svg` },
  { id: "local-lease", brand: "BMW", model_name: "리스 전용 테스트", available_product_types: ["LEASE"], representative_monthly_price: 123456, displayed_product_type: "LEASE", segment: "sedan", fuel: "gasoline", image_url: `${API}/assets/local-lease.svg` },
];

// Public-origin behavior is served from this checkout, never from the live site.
// Every external request is fulfilled or aborted before it reaches the network.
const test = base.extend({
  api: async ({ context, baseURL }, use) => {
    const local = new URL(baseURL);
    expect(["127.0.0.1", "localhost", "[::1]"]).toContain(local.hostname);
    const api = { posts: [], unexpected: [], errors: [], assetFailures: [], receipt: { id: "mock-local-receipt", status: "NEW" }, status: 201, gate: null };
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "cache-control": "no-store" };
      if (url.origin === API) {
        if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
        if (method === "GET" && url.pathname.startsWith("/assets/")) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: image, headers });
        if (method === "GET" && url.pathname === "/api/v1/vehicles/discovery") return route.fulfill({ status: 404, headers, json: { detail: "Not Found" } });
        if (method === "GET" && url.pathname === "/api/v1/vehicles/") {
          const items = url.searchParams.get("product_type") === "RENTAL" ? vehicles.filter(vehicle => vehicle.available_product_types.includes("RENTAL")) : vehicles;
          return route.fulfill({ status: 200, headers, json: { items, page: 1, pages: 1, total: items.length } });
        }
        if (method === "POST" && url.pathname === "/api/v1/support/quote-inquiries") {
          api.posts.push(request.postDataJSON());
          if (api.gate) await api.gate;
          return route.fulfill({ status: api.status, headers, json: api.receipt });
        }
      }
      if (url.origin === PUBLIC && ["GET", "HEAD"].includes(method)) {
        const response = await route.fetch({ url: `${local.origin}${url.pathname}${url.search}` });
        return route.fulfill({ response });
      }
      if (url.origin === local.origin && ["GET", "HEAD"].includes(method) && !url.pathname.startsWith("/api/")) return route.continue();
      api.unexpected.push(`${method} ${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    });
    await use(api);
    expect(api.unexpected, "unknown or write traffic was blocked").toEqual([]);
    expect(api.errors, "browser runtime errors").toEqual([]);
    expect(api.assetFailures, "local assets load successfully").toEqual([]);
  },
});

test.use({ serviceWorkers: "block", reducedMotion: "reduce" });
test.beforeEach(async ({ page, api }) => {
  page.on("pageerror", error => api.errors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400 && ["script", "stylesheet", "font", "image"].includes(response.request().resourceType())) api.assetFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
});

async function open(page, { production = false } = {}) {
  const response = await page.goto(`${production ? PUBLIC : ""}/inquiry/?ref=${REF}&utm_source=landing-test`);
  expect(response.status()).toBe(200);
  await expect(page.locator("#lpCarInput")).toBeVisible();
  await expect(page.locator("#lpCars button")).toHaveCount(2);
  await expect(page.locator(".lp-slide.is-on")).toBeVisible();
}

async function contactDetails(page) {
  await expect(page.locator("#lpName")).toBeVisible();
  await page.locator("#lpName").fill("로컬 검증");
  await page.locator("#lpNext").click();
  await page.locator("#lpPhone").fill("010-0000-0000");
  await page.locator("#lpNext").click();
  await expect(page.locator('#lpFunnel [name="agree"]')).toBeVisible();
}

async function answerQuiz(page, answers = [0, 0, 0, 0, 0, 0, 1, 2, 3, 2, 3, 2]) {
  await page.locator("[data-test-open]").first().click();
  for (let index = 0; index < 12; index++) {
    await expect(page.locator(".lp-test__count")).toHaveText(`${index + 1} / 12`);
    await page.locator(`[data-a="${answers[index]}"]`).click();
  }
  await expect(page.locator(".lp-r__tname")).toBeVisible();
}

for (const width of [375, 1440]) {
  test(`free-text inquiry preserves consent and completes preview without sending at ${width}px`, async ({ page, api }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("unrelated-saved-quote", "preserve-me"));
    await open(page);
    await expect(page.locator("#lpNext")).toBeDisabled();
    await page.locator("#lpCarInput").fill("쏘렌토 하이브리드 / 원하는 등급 상담");
    await page.locator("#lpNext").click();
    await contactDetails(page);
    await expect(page.locator("#lpNext")).toBeDisabled();
    await page.locator('#lpFunnel [name="agree"]').check();
    await expect(page.locator("#lpNext")).toBeDisabled();
    await page.locator('#lpFunnel [name="agree3"]').check();
    await page.locator("#lpNext").click();
    await expect(page.locator("#lpDone")).toContainText("입력 내용을 확인했어요");
    await expect(page.locator("#lpDone")).toContainText("상담 신청이 전송되지 않았어요");
    await expect(page.locator("#lpDone")).not.toContainText("미리보기");
    await expect(page.locator("#lpDone")).not.toContainText("상담 신청을 받았어요");
    await expect(page.locator("#lpDone .lp-done__no")).toHaveCount(0);
    expect(api.posts).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem("unrelated-saved-quote"))).toBe("preserve-me");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/inquiry-landing-${width}-preview.png`, fullPage: true });
  });
}

test("quick consent immediately follows master clicks, keyboard and required-only selection", async ({ page, api }) => {
  await open(page);
  await page.locator("#lpCarInput").fill("동의 동작 검증 차량");
  await page.locator("#lpNext").click();
  await contactDetails(page);
  // Only this isolated fixture adds the optional field used by the original
  // local landing. The public page retains its existing two required consents.
  await page.locator("#lpFunnel .consent").evaluate(consent => {
    const label = document.createElement("label");
    label.innerHTML = '<input type="checkbox" name="marketing" data-agree><span>선택 항목 (격리 검사)</span>';
    consent.append(label);
  });
  const all = page.locator("#lpFunnel [data-agree-all]");
  const privacy = page.locator('#lpFunnel [name="agree"]');
  const notice = page.locator('#lpFunnel [name="agree3"]');
  const optional = page.locator('#lpFunnel [name="marketing"]');
  const next = page.locator("#lpNext");
  await expect(next).toBeDisabled();
  await all.focus();
  await page.keyboard.press("Space");
  for (const checkbox of [all, privacy, notice, optional]) await expect(checkbox).toBeChecked();
  await expect(all).toHaveJSProperty("indeterminate", false);
  await expect(next).toBeEnabled();
  await page.keyboard.press("Space");
  for (const checkbox of [all, privacy, notice, optional]) await expect(checkbox).not.toBeChecked();
  await expect(next).toBeDisabled();
  await all.click();
  await expect(next).toBeEnabled();
  await all.click();
  await expect(next).toBeDisabled();
  await privacy.check();
  await expect(next).toBeDisabled();
  await notice.check();
  await expect(optional).not.toBeChecked();
  await expect(next).toBeEnabled();
  await expect(all).not.toBeChecked();
  await expect(all).toHaveJSProperty("indeterminate", true);
  await notice.uncheck();
  await expect(next).toBeDisabled();
  await notice.check();
  await expect(next).toBeEnabled();
  await optional.check();
  await expect(all).toBeChecked();
  await expect(all).toHaveJSProperty("indeterminate", false);
  await optional.uncheck();
  await expect(next).toBeEnabled();
  expect(api.posts).toHaveLength(0);
});

test("quick-pick remains optional and manual editing clears the prior selection", async ({ page }) => {
  await open(page);
  await page.locator('#lpCars button[data-id="local-k5"]').click();
  await expect(page.locator("#lpPicked")).toContainText("K5");
  await page.locator("#lpBack").click();
  await expect(page.locator("#lpCarInput")).toHaveValue("기아 K5");
  await page.locator("#lpCarInput").fill("아직 카탈로그에 없는 희망 차량");
  await expect(page.locator('#lpCars button[aria-pressed="true"]')).toHaveCount(0);
  await page.locator("#lpNext").click();
  await expect(page.locator("#lpPicked")).toContainText("아직 카탈로그에 없는 희망 차량");
  await expect(page.locator("#lpPicked")).not.toContainText("K5");
});

test("quiz preserves all six requirements, individual editing and nested privacy Escape", async ({ page, api }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await answerQuiz(page);
  const answers = page.locator(".lp-r__answers [data-edit]");
  await expect(answers).toHaveCount(6);
  for (const text of ["월 60만원까지", "최대 1,000만원", "6명 이상", "3만km 이하", "충전 환경 미확인", "기계식"]) await expect(page.locator(".lp-r__answers")).toContainText(text);
  const originalType = await page.locator(".lp-r__tname").textContent();
  await page.locator('[data-edit="7"]').click();
  await expect(page.locator(".lp-test__count")).toHaveText("8 / 12");
  await page.locator('[data-a="0"]').click();
  await expect(page.locator(".lp-r__tname")).toHaveText(originalType);
  await expect(page.locator(".lp-r__answers")).toContainText("초기 예산 0원");
  await page.locator('[data-t="ask"]').click();
  await page.locator("#tNameIn").fill("로컬 테스트");
  await page.locator('#tName button[type="submit"]').click();
  await page.locator("#tPhoneIn").fill("010-0000-0000");
  await page.locator('#tPhone [data-open-privacy="collect"]').click();
  await expect(page.locator(".modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal")).toHaveCount(0);
  await expect(page.locator("#lpTest")).toBeVisible();
  await page.locator('#tPhone button[type="submit"]').click();
  await expect(page.locator("#tPhone .lp-err")).toContainText("필수 동의");
  await page.locator('#tPhone [data-agree-all]').check();
  await expect(page.locator('#tPhone [name="agree"]')).toBeChecked();
  await expect(page.locator('#tPhone [name="agree3"]')).toBeChecked();
  await page.locator('#lpTest [data-t="back"]').click();
  await expect(page.locator("#tNameIn")).toHaveValue("로컬 테스트");
  await page.locator('#tName button[type="submit"]').click();
  await expect(page.locator("#tPhoneIn")).toHaveValue("010-0000-0000");
  await expect(page.locator('#tPhone [data-agree-all]')).toBeChecked();
  await expect(page.locator('#tPhone [data-agree-all]')).toHaveJSProperty("indeterminate", false);
  await page.locator('#tPhone [name="agree3"]').uncheck();
  await expect(page.locator('#tPhone [data-agree-all]')).not.toBeChecked();
  await expect(page.locator('#tPhone [data-agree-all]')).toHaveJSProperty("indeterminate", true);
  await page.locator('#lpTest [data-t="back"]').click();
  await page.locator('#tName button[type="submit"]').click();
  await expect(page.locator('#tPhone [name="agree"]')).toBeChecked();
  await expect(page.locator('#tPhone [name="agree3"]')).not.toBeChecked();
  await expect(page.locator('#tPhone [data-agree-all]')).not.toBeChecked();
  await expect(page.locator('#tPhone [data-agree-all]')).toHaveJSProperty("indeterminate", true);
  await page.locator('#tPhone button[type="submit"]').click();
  await expect(page.locator("#tPhone .lp-err")).toContainText("필수 동의");
  expect(api.posts).toHaveLength(0);
  await page.locator('#tPhone [name="agree3"]').check();
  await expect(page.locator('#tPhone [data-agree-all]')).toBeChecked();
  await page.locator('#tPhone button[type="submit"]').click();
  await expect(page.locator("#lpTest .lp-test__count")).toHaveText("입력 확인");
  await expect(page.locator("#lpTest")).toContainText("입력 내용을 확인했어요");
  await expect(page.locator("#lpTest")).toContainText("상담 신청이 전송되지 않았어요");
  await expect(page.locator("#lpTest")).not.toContainText("미리보기");
  await expect(page.locator("#lpTest")).not.toContainText("상담 신청을 받았어요");
  await expect(page.locator("#lpTest .lp-done__no")).toHaveCount(0);
  expect(api.posts).toHaveLength(0);
  expect(await page.locator("#lpTest").evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});

test("public-origin mock submits once with canonical referral and no copied catalog amount", async ({ page, api }) => {
  await open(page, { production: true });
  await page.locator('#lpCars button[data-id="local-k5"]').click();
  await contactDetails(page);
  await page.locator('#lpFunnel [data-agree-all]').check();
  let release;
  api.gate = new Promise(resolve => { release = resolve; });
  try {
    await page.locator("#lpNext").evaluate(button => { button.click(); button.click(); });
    await expect.poll(() => api.posts.length).toBe(1);
    await expect(page.locator("#lpNext")).toBeDisabled();
    release();
    await expect(page.locator("#lpDone")).toContainText("mock-local-receipt");
    await expect(page.locator("#lpDone")).toContainText("상담 신청을 받았어요");
    await expect(page.locator("#lpDone")).not.toContainText("상담 신청이 전송되지 않았어요");
    await expect(page.locator("#lpDone")).not.toContainText("미리보기");
  } finally { release(); }
  expect(api.posts).toHaveLength(1);
  expect(api.posts[0]).toMatchObject({ name: "로컬 검증", phone: "01000000000", privacy_agreed: true, vehicle_name: "기아 K5", referral_code: REF, quoted_monthly_payment: null });
  const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  expect(stored).not.toContain("로컬 검증");
  expect(stored).not.toContain("01000000000");
});

test("public-origin mock quiz transmits every requirement while retaining null quoted amount", async ({ page, api }) => {
  await open(page, { production: true });
  await answerQuiz(page);
  await page.locator('[data-t="ask"]').click();
  await page.locator("#tNameIn").fill("로컬 테스트");
  await page.locator('#tName button[type="submit"]').click();
  await page.locator("#tPhoneIn").fill("010-0000-0000");
  await page.locator('#tPhone [data-agree-all]').check();
  await page.locator('#tPhone button[type="submit"]').click();
  await expect(page.locator("#lpTest")).toContainText("mock-local-receipt");
  expect(api.posts).toHaveLength(1);
  expect(api.posts[0].quoted_monthly_payment).toBeNull();
  for (const label of ["월 예산", "초기 예산", "탑승 인원", "연간 거리", "충전 환경", "주차 환경"]) expect(api.posts[0].condition_summary).toContain(label);
});

for (const receipt of [{}, { id: "mock-local", status: "ACCEPTED" }]) {
  test(`public mock ${JSON.stringify(receipt)} blocks uncertain duplicate submissions`, async ({ page, api }) => {
    api.receipt = receipt;
    await open(page, { production: true });
    await page.locator("#lpCarInput").fill("수동 입력 차량");
    await page.locator("#lpNext").click();
    await contactDetails(page);
    await page.locator('#lpFunnel [data-agree-all]').check();
    await page.locator("#lpNext").click();
    await expect(page.locator("#lpErr")).toContainText("자동 재전송하지 않습니다");
    await expect(page.locator("#lpDone")).toBeHidden();
    await expect(page.locator("#lpNext")).toBeDisabled();
    expect(api.posts).toHaveLength(1);
  });
}

test("new-car menu opens the retained vehicle selection flow and app link keeps referral attribution", async ({ page }) => {
  await open(page, { production: true });
  for (const label of ["셀프견적", "렌트 · 리스", "즉시출고"]) {
    const link = page.locator(".lp-menu a").filter({ hasText: label });
    const destination = new URL(await link.getAttribute("href"));
    expect(destination.origin).toBe(PUBLIC);
    expect(destination.pathname).toBe("/inquiry/steps.html");
    expect(destination.searchParams.get("ref")).toBe(REF);
  }
  const app = new URL(await page.getByRole("link", { name: "더 많은 차량 앱에서 보기" }).getAttribute("href"));
  expect(app.origin).toBe(PUBLIC);
  expect(app.pathname).toBe("/");
  expect(app.searchParams.get("ref")).toBe(REF);
  await expect(page.locator("#lpHeroStage")).not.toContainText("123,456");
  await page.locator(".lp-menu a").filter({ hasText: "셀프견적" }).click();
  await expect(page).toHaveURL(/\/inquiry\/steps\.html\?ref=RC-QA1234#step1$/);
  await expect(page.locator('[data-brand="Kia"]')).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
});

test("legacy landing model and requested conditions prefill only the car step and retain inquiry context", async ({ page, api }) => {
  const query = new URLSearchParams({ brand: "기아", model: "모닝", product: "LEASE", term: "60", mileage: "10000", deposit: "20", prepayment: "10", ref: REF, name: "must-not-prefill", phone: "01011112222" });
  await page.goto(`${PUBLIC}/inquiry/?${query}`);
  await expect(page.locator("#lpCarInput")).toHaveValue("기아 모닝");
  await expect(page.locator("#lpName")).toBeVisible();
  await expect(page.locator("#lpName")).toHaveValue("");
  await expect(page.locator("#lpPhone")).toHaveValue("");
  expect(api.posts).toHaveLength(0);
  await contactDetails(page);
  await page.locator('#lpFunnel [data-agree-all]').check();
  await page.locator("#lpNext").click();
  await expect(page.locator("#lpDone")).toContainText("mock-local-receipt");
  expect(api.posts).toHaveLength(1);
  expect(api.posts[0]).toMatchObject({ vehicle_name: "기아 모닝", product_type: "LEASE", quoted_monthly_payment: null, referral_code: REF });
  for (const condition of ["60개월", "10,000km", "20%", "10%"]) expect(api.posts[0].condition_summary).toContain(condition);
});

test("an explicit product reset clears both the visible badge and legacy URL fallback before submitting", async ({ page, api }) => {
  await page.goto(`${PUBLIC}/inquiry/?brand=기아&model=모닝&product=LEASE&ref=${REF}`);
  await expect(page.locator("#lpName")).toBeVisible();
  await expect(page.locator("#landingProductSelection")).toContainText("리스 전문 상담");
  await page.locator('#lpFunnel [data-reset-product]').click();
  await expect(page.locator("#landingProductSelection")).toContainText("미정");
  await expect(page.locator('#lpFunnel [data-reset-product]')).toHaveCount(0);
  await contactDetails(page);
  await page.locator('#lpFunnel [data-agree-all]').check();
  await page.locator("#lpNext").click();
  await expect(page.locator("#lpDone")).toContainText("mock-local-receipt");
  expect(api.posts).toHaveLength(1);
  expect(Object.hasOwn(api.posts[0], "product_type")).toBe(false);
  expect(api.posts[0].condition_summary).toContain("현재 상담 방식: 미정");
});

test("quiz keyboard focus wraps inside the active test instead of reaching the page behind it", async ({ page }) => {
  await open(page);
  await page.locator("[data-test-open]").first().click();
  const first = page.locator(".lp-test__back"), last = page.locator(".lp-q__opts [data-a]").last();
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#lpTest")).toBeHidden();
  await expect(page.locator("[data-test-open]").first()).toBeFocused();
});

test("hero and quiz vehicle links retain the chosen model in the existing selection flow", async ({ page, api }) => {
  for (const surface of ["hero", "quiz"]) {
    await open(page, { production: true });
    if (surface === "quiz") await answerQuiz(page);
    const link = page.locator(surface === "hero" ? ".lp-slide.is-on" : ".lp-r__more");
    const destination = new URL(await link.getAttribute("href"));
    expect(destination.pathname).toBe("/inquiry/steps.html");
    expect(destination.searchParams.get("brand")).toBe("Kia");
    expect(destination.searchParams.get("ref")).toBe(REF);
    const selected = vehicles.find(vehicle => vehicle.model_name === destination.searchParams.get("model"));
    expect(selected).toBeTruthy();
    await link.click();
    await expect(page).toHaveURL(/#step2$/);
    await expect(page.locator(`[data-vehicle="${selected.id}"]`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(api.posts).toHaveLength(0);
  }
});
