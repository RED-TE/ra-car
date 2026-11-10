const { test: base, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const API = "https://api.recarplan.com";
const referral = "RC-LOCAL123";
const name = "로컬 문의 검증";
const phone = "010-0000-0000";
const row = (id, model, products = ["RENTAL"]) => ({
  id, brand: "현대", model_name: model, available_product_types: products,
  monthly_payment: 987654, image_url: "",
});

function detail(id, { zero = false, unavailable = false } = {}) {
  const colors = zero ? [] : [
    { id: `${id}-white`, name: "화이트", type: "exterior", hex: "#ffffff" },
    { id: `${id}-black`, name: "블랙", type: "interior", hex: "#111111" },
  ];
  return {
    id,
    trims: [
      { id: `${id}-active`, name: "선택 가능한 트림", is_available: true, colors },
      { id: `${id}-alternative`, name: "색상 없는 다른 트림", is_available: true, colors: [] },
      { id: `${id}-inactive`, name: "비활성 등급", colors: [] },
      { id: `${id}-disabled`, name: "판매 중지 트림", is_available: false, colors: [] },
    ],
    trim_selection: unavailable ? { mode: "UNAVAILABLE" } : {
      mode: "GROUPED", groups: [{ grades: [
        { vehicle_trim_id: `${id}-active`, is_active: true },
        { vehicle_trim_id: `${id}-alternative`, is_active: true },
        { vehicle_trim_id: `${id}-inactive`, is_active: false },
        { vehicle_trim_id: `${id}-disabled`, is_active: true },
        { vehicle_trim_id: "foreign-vehicle-trim", is_active: true },
      ] }],
    },
  };
}

// All API responses are fulfilled in-process. Only GET/HEAD to this test server can reach the network.
const test = base.extend({
  api: async ({ context, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    expect(["127.0.0.1", "localhost", "[::1]"]).toContain(new URL(origin).hostname);
    const api = {
      posts: [], reads: [], unexpected: [], errors: [], assetFailures: [],
      offlineCatalog: false, offlineDetail: false, detailGate: null, submitGate: null,
      discovery: false, discoveryReads: 0, discoveryOverride: null,
      receipt: { id: "local-only-receipt", status: "NEW" }, submitStatus: 201,
      pages: [
        { items: [row("local-rental", "로컬 렌트 차량"), row("local-zero", "로컬 무색상 차량")], total: 3, page: 1, size: 100, pages: 2 },
        { items: [row("local-blocked", "로컬 미제공 차량")], total: 3, page: 2, size: 100, pages: 2 },
      ],
      details: {
        "local-rental": detail("local-rental"),
        "local-zero": detail("local-zero", { zero: true }),
        "local-blocked": detail("local-blocked", { unavailable: true }),
      },
    };
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const headers = {
        "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "*", "cache-control": "no-store",
      };
      if (url.origin === API) {
        if (method === "GET" && url.pathname === "/showroom-fixture.svg") {
          return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="#385470"/></svg>' });
        }
        if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
        if (method === "GET" && url.pathname === "/api/v1/vehicles/discovery") {
          api.discoveryReads++;
          if (!api.discovery) return route.fulfill({ status: 404, headers, json: { detail: "Not Found" } });
          if (api.offlineCatalog) return route.abort("internetdisconnected");
          const items = api.pages.flatMap(part => part.items).map(({ id, brand, model_name, available_product_types }) => ({ id, brand, model_name, available_product_types }));
          return route.fulfill({ status: 200, headers, json: api.discoveryOverride || {
            contract_version: "discovery_v1", complete: true, total: items.length, revision: "a".repeat(64), items,
          } });
        }
        if (method === "GET" && url.pathname === "/api/v1/vehicles/") {
          api.reads.push(url.href);
          if (api.offlineCatalog) return route.abort("internetdisconnected");
          expect(url.searchParams.get("size")).toBe("100");
          expect(url.searchParams.get("sort")).toBe("display_order");
          const json = api.pages[Number(url.searchParams.get("page")) - 1];
          if (json) return route.fulfill({ status: 200, headers, json });
        }
        if (method === "GET" && url.pathname.startsWith("/api/v1/vehicles/")) {
          api.reads.push(url.href);
          if (api.offlineDetail) return route.abort("internetdisconnected");
          if (api.detailGate) await api.detailGate;
          const json = api.details[decodeURIComponent(url.pathname.split("/").pop())];
          if (json) return route.fulfill({ status: 200, headers, json });
        }
        if (method === "GET" && url.pathname === "/api/v1/friends/track") {
          return route.fulfill({ status: 200, headers, json: { recorded: true } });
        }
        if (method === "POST" && url.pathname === "/api/v1/support/quote-inquiries") {
          api.posts.push(request.postDataJSON());
          if (api.submitGate) await api.submitGate;
          return route.fulfill({ status: api.submitStatus, headers, json: api.receipt });
        }
      }
      if (url.origin === origin && ["GET", "HEAD"].includes(method) && !url.pathname.startsWith("/api/")) {
        return route.continue();
      }
      api.unexpected.push(`${method} ${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    });
    await use(api);
    expect(api.unexpected, "unexpected requests were blocked, never sent to production").toEqual([]);
    expect(api.errors, "browser runtime errors").toEqual([]);
    expect(api.assetFailures, "local script/style/font/image failures").toEqual([]);
  },
});

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page, api }) => {
  page.on("pageerror", error => api.errors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400 && ["script", "stylesheet", "font", "image"].includes(response.request().resourceType())) {
      api.assetFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
});

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function step(page, number, capture = false) {
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(number));
  await expect(page).toHaveURL(new RegExp(`#step${number}$`));
  await noOverflow(page);
  await page.waitForFunction(() => document.querySelector("#stepContent").getAnimations().every(animation => animation.playState !== "running"));
  if (capture) {
    await page.screenshot({ path: test.info().outputPath(`inquiry-${page.viewportSize().width}-step${number}.png`), fullPage: true });
  }
}

async function openInquiry(page) {
  const response = await page.goto(`/inquiry/steps.html?ref=${referral}&utm_source=local-test`);
  expect(response.status()).toBe(200);
  await expect(page.locator('[data-brand="현대"]')).toBeVisible();
  await step(page, 1);
  await expect(page.locator('script[src*="flutter"], base[href="/app/"]')).toHaveCount(0);
}

for (const width of [320, 375, 1440]) {
  test(`showroom keeps the wheels at floor level and supports the form at ${width}px`, async ({ page, api }) => {
    await page.setViewportSize({ width, height: 920 });
    const candidate = api.pages[0].items[0];
    Object.assign(candidate, { image_url: "/showroom-fixture.svg", displayed_product_type: "RENTAL", monthly_payment_product_type: "RENTAL", representative_monthly_price: 350000 });
    await page.goto(`/inquiry/?ref=${referral}&utm_source=local-test`);
    await expect(page.getByText("빠르게 고르기", { exact: true })).toHaveCount(0);
    await expect(page.locator(".lp-slide.is-on")).toContainText("350,000");
    await expect(page.locator(".lp-slide.is-on")).toHaveAttribute("href", /\/inquiry\/steps\.html\?.*utm_source=local-test/);
    expect(new URL(await page.locator(".lp-slide.is-on").getAttribute("href")).searchParams.get("ref")).toBe(referral);
    const backdrop = page.locator(".lp-hero__backdrop img");
    await expect.poll(() => backdrop.evaluate(img => img.complete && img.naturalWidth > 0 && img.currentSrc.endsWith("showroom-floor.jpg"))).toBe(true);
    const stage = await page.locator(".lp-hero__stage").boundingBox();
    const car = await page.locator(".lp-slide.is-on img").boundingBox();
    const brand = await page.locator(".lp-slide.is-on .lp-slide__brand").boundingBox();
    expect(car.y + car.height - stage.y).toBeGreaterThan(203);
    expect(brand.y - (car.y + car.height)).toBeGreaterThanOrEqual(6);
    await page.getByRole("button", { name: "배경 다시 재생" }).click();
    await expect.poll(() => backdrop.evaluate(img => img.getAnimations().some(a => a.playState === "running"))).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`showroom-${width}.png`) });
    await noOverflow(page);
    await page.locator("#lpHeroCta").click();
    await expect(page.locator("#lpName")).toBeFocused();
    await expect(page.locator("#lpPicked")).toContainText(candidate.model_name);
    await page.locator("#lpName").fill(name);
    await page.locator("#lpNext").click();
    await page.locator("#lpPhone").fill(phone);
    await page.locator("#lpNext").click();
    await expect(page.locator("#lpNext")).toBeDisabled();
    await page.locator("#lpFunnel [data-agree-all]").check();
    await expect(page.locator("#lpFunnel [data-agree]:checked")).toHaveCount(2);
    await page.locator("#lpNext").click();
    await expect(page.locator("#lpDone")).toContainText("전송되지 않았어요");
    expect(api.posts).toHaveLength(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => backdrop.evaluate(img => img.getAnimations().length)).toBe(0);
    await expect(page.getByRole("button", { name: "배경 다시 재생" })).toBeHidden();
  });
}

async function chooseVehicle(page, id = "local-rental", capture = false) {
  await step(page, 1, capture);
  await expect(page.locator("#nextButton")).toBeDisabled();
  await page.locator('[data-brand="현대"]').click();
  await page.locator("#nextButton").click();
  await step(page, 2, capture);
  await expect(page.locator(".vehicle-choice")).toHaveCount(3);
  await expect(page.locator("#stepContent")).not.toContainText("987,654");
  await page.locator(`[data-vehicle="${id}"]`).click();
  await page.locator("#nextButton").click();
  await expect(page.locator(`[data-trim="${id}-active"]`)).toBeVisible();
  await expect(page.locator("#nextButton")).toBeDisabled();
  await expect(page.locator(`[data-trim="${id}-inactive"], [data-trim="${id}-disabled"], [data-trim="foreign-vehicle-trim"]`)).toHaveCount(0);
  await page.locator(`[data-trim="${id}-active"]`).click();
  if (id === "local-zero") {
    await expect(page.locator("[data-color]")).toHaveCount(0);
    await expect(page.locator("#stepContent")).toContainText("별도 색상 정보가 제공되지 않는 트림");
  } else {
    await expect(page.locator("#nextButton")).toBeDisabled();
    await page.locator(`[data-color="${id}-white"]`).click();
    await expect(page.locator("#nextButton")).toBeDisabled();
    await page.locator(`[data-color="${id}-black"]`).click();
  }
  await step(page, 3, capture);
  await page.locator("#nextButton").click();
  await step(page, 4);
  await expect(page.locator("[data-product]")).toHaveCount(1);
  await expect(page.locator('[data-product="RENTAL"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-product="LEASE"]')).toHaveCount(0);
  await expect(page.locator('[data-condition="age"]')).toHaveCount(2);
  for (const [key, value] of [["term", 48], ["mileage", 30000], ["deposit", 0], ["prepayment", 10]]) {
    await page.locator(`[data-condition="${key}"][data-value="${value}"]`).click();
  }
  await step(page, 4, capture);
}

test("a different vehicle from the taste test opens its contact form", async ({ page, api }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const candidates = api.pages[0].items;
  for (const [index, vehicle] of candidates.entries()) {
    Object.assign(vehicle, {
      model_name: index ? "아반떼" : "그랜저", segment: "sedan", fuel: "gasoline", image_url: "/showroom-fixture.svg",
      displayed_product_type: "RENTAL", monthly_payment_product_type: "RENTAL", representative_monthly_price: 350000,
    });
  }
  await page.goto("/inquiry/");
  await expect(page.locator(".lp-slide.is-on")).toBeVisible();
  await page.locator(".lp-testcta").click();
  for (let question = 1; question <= 12; question++) {
    await expect(page.locator(".lp-q__no")).toHaveText(new RegExp(`Q${question}$`));
    await page.locator('#lpTest [data-a="0"]').click();
  }
  await page.getByRole("button", { name: "다른 차량 상담받기" }).click();
  const alternative = page.locator("#lpTest [data-car]").first();
  const model = await alternative.locator("b").innerText();
  await alternative.click();
  await expect(page.locator("#tNameIn")).toBeFocused();
  await expect(page.locator("#tName")).toContainText(model);
  expect(api.posts).toHaveLength(0);
});

async function review(page, { capture = false, id = "local-rental" } = {}) {
  await chooseVehicle(page, id, capture);
  await page.locator("#nextButton").click();
  await step(page, 5);
  await expect(page.locator("#nextButton")).toBeDisabled();
  await page.locator("#customerName").fill(name);
  await page.locator("#customerPhone").fill("02-1234-5678");
  await expect(page.locator("#nextButton")).toBeDisabled();
  await page.locator("#customerPhone").fill(phone);
  await step(page, 5, capture);
  await page.locator("#nextButton").click();
  await step(page, 6, capture);
  await expect(page.locator("#stepContent")).toContainText("48개월 / 연 30,000km");
  await expect(page.locator("#stepContent")).toContainText("보증금 0% / 선납금 10%");
  await expect(page.locator("#stepContent")).toContainText("보험 연령");
  await expect(page.locator("#nextButton")).toBeDisabled();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  test(`landing referral to six steps submits once with NEW receipt at ${viewport.width}px`, async ({ page, api }) => {
    api.discovery = true;
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("unrelated-saved-quote", "preserve-me"));
    const response = await page.goto(`/landing/?ref=${referral.toLowerCase()}&utm_source=local-test&utm_campaign=inquiry-smoke`);
    expect(response.status()).toBe(200);
    await expect(page.locator(".home-vehicle").first()).toBeVisible();
    await expect.poll(() => page.locator("img").evaluateAll(images => images
      .filter(img => img.getBoundingClientRect().top < innerHeight && img.getBoundingClientRect().bottom > 0)
      .every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    await noOverflow(page);
    await page.screenshot({ path: test.info().outputPath(`landing-${viewport.width}.png`), fullPage: true });
    await page.locator(".promotion-slide.is-current .quote-focus-button").click();
    await expect(page.locator("#lpCarInput")).toBeVisible();
    await expect(page.locator("#lpHeroStage")).not.toContainText("차량을 불러오고 있어요");
    const catalogReadsBeforeSteps = api.reads.filter(url => new URL(url).pathname === "/api/v1/vehicles/").length;
    await page.getByRole("link", { name: "셀프견적" }).click();
    await expect(page.locator('[data-brand="현대"]')).toBeVisible();
    const url = new URL(page.url());
    expect(url.pathname).toBe("/inquiry/steps.html");
    expect(url.searchParams.get("ref").toUpperCase()).toBe(referral);
    expect(url.searchParams.get("utm_source")).toBe("local-test");
    expect(url.searchParams.get("utm_campaign")).toBe("inquiry-smoke");
    await review(page, { capture: true });
    await page.locator("#privacyAgree").check();
    await expect(page.locator("#agreeAll")).toHaveJSProperty("indeterminate", true);
    await expect(page.locator("#nextButton")).toBeDisabled();
    await page.locator("#agreeAll").check();
    await expect(page.locator("#privacyAgree")).toBeChecked();
    await expect(page.locator("#noticeAgree")).toBeChecked();
    let release;
    api.submitGate = new Promise(resolve => { release = resolve; });
    try {
      await page.locator("#nextButton").evaluate(button => { button.click(); button.click(); });
      await expect.poll(() => api.posts.length).toBe(1);
      await expect(page.locator("#nextButton")).toBeDisabled();
      await expect(page.locator("#backButton")).toBeDisabled();
      await expect(page.locator("#stepContent")).toHaveJSProperty("inert", true);
      release();
      await expect(page.locator("#successTitle")).toBeVisible();
    } finally { release(); }
    await expect(page.locator(".receipt")).toContainText("local-only-receipt");
    await expect(page.locator("#flowActions")).toBeHidden();
    expect(api.posts).toHaveLength(1);
    expect(api.discoveryReads).toBe(1);
    expect(api.reads.filter(url => new URL(url).pathname === "/api/v1/vehicles/").length).toBe(catalogReadsBeforeSteps);
    expect(api.posts[0]).toMatchObject({
      name, phone: "01000000000", privacy_agreed: true, product_type: "RENTAL",
      term_months: 48, mileage_per_year: 30000, referral_code: referral, quoted_monthly_payment: null,
    });
    expect(api.posts[0].condition_summary).toContain("vehicle_id=local-rental");
    expect(api.posts[0].condition_summary).toContain("보험연령 만 26세 이상");
    expect(JSON.stringify(api.posts[0])).not.toContain("987654");
    expect(await page.evaluate(() => localStorage.getItem("unrelated-saved-quote"))).toBe("preserve-me");
    const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
    expect(stored).not.toContain(name);
    expect(stored).not.toContain("01000000000");
    await noOverflow(page);
  });
}

test("offline catalog stays empty and disabled until explicit retry succeeds", async ({ page, api }) => {
  api.offlineCatalog = true;
  await page.goto("/inquiry/steps.html");
  await expect(page.locator(".state-panel")).toContainText("차량 정보를 불러오지 못했어요");
  await expect(page.locator("[data-brand]")).toHaveCount(0);
  await expect(page.locator("#nextButton")).toBeDisabled();
  expect(api.reads).toHaveLength(1);
  api.offlineCatalog = false;
  await page.locator("[data-retry]").click();
  await expect(page.locator('[data-brand="현대"]')).toBeVisible();
  expect(api.posts).toHaveLength(0);
});

test("duplicate pagination never displays a partial catalog", async ({ page, api }) => {
  api.pages[1].items = [api.pages[0].items[0]];
  await page.goto("/inquiry/steps.html");
  await expect(page.locator("[data-retry]")).toBeVisible();
  await expect(page.locator("[data-brand], [data-vehicle]")).toHaveCount(0);
  await expect(page.locator("#nextButton")).toBeDisabled();
  expect(api.reads).toHaveLength(2);
});

test("invalid fast discovery fails closed instead of silently requesting priced pages", async ({ page, api }) => {
  api.discovery = true;
  api.discoveryOverride = { contract_version: "discovery_v1", complete: false, total: 1, items: [], revision: "a".repeat(64) };
  await page.goto("/inquiry/steps.html");
  await expect(page.locator("[data-retry]")).toBeVisible();
  await expect(page.locator("[data-brand], [data-vehicle]")).toHaveCount(0);
  expect(api.discoveryReads).toBe(1);
  expect(api.reads).toHaveLength(0);
  expect(api.posts).toHaveLength(0);
});

test("reopening reuses only a complete fresh discovery catalog without retaining customer information", async ({ page, api }) => {
  await openInquiry(page);
  const catalogReads = api.reads.length;
  expect(catalogReads).toBe(2);
  await page.reload();
  await expect(page.locator('[data-brand="현대"]')).toBeVisible();
  expect(api.reads).toHaveLength(catalogReads);
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("recar_inquiry_discovery_rental_v2")));
  expect(stored.complete).toBe(true);
  expect(stored.items).toHaveLength(3);
  expect(JSON.stringify(stored)).not.toContain("monthly_payment");
  expect(JSON.stringify(stored)).not.toContain("987654");
  expect(JSON.stringify(stored)).not.toContain(name);
  expect(JSON.stringify(stored)).not.toContain(phone);
  api.offlineDetail = true;
  await page.locator('[data-brand="현대"]').click();
  await page.locator("#nextButton").click();
  await page.locator('[data-vehicle="local-rental"]').click();
  await page.locator("#nextButton").click();
  await expect(page.locator("[data-retry-detail]")).toBeVisible();
  expect(api.posts).toHaveLength(0);
});

test("detail offline error supports retry without selecting a fake trim", async ({ page, api }) => {
  await openInquiry(page);
  await page.locator('[data-brand="현대"]').click();
  await page.locator("#nextButton").click();
  api.offlineDetail = true;
  await page.locator('[data-vehicle="local-rental"]').click();
  await page.locator("#nextButton").click();
  await expect(page.locator("[data-retry-detail]")).toBeVisible();
  await expect(page.locator("[data-trim]")).toHaveCount(0);
  await expect(page.locator("#nextButton")).toBeDisabled();
  api.offlineDetail = false;
  await page.locator("[data-retry-detail]").click();
  await expect(page.locator('[data-trim="local-rental-active"]')).toBeVisible();
  await expect(page.locator("#nextButton")).toBeDisabled();
});

test("vehicle choice prepares one shared detail request before continuing", async ({ page, api }) => {
  await openInquiry(page);
  await page.locator('[data-brand="현대"]').click();
  await page.locator("#nextButton").click();
  let release;
  api.detailGate = new Promise(resolve => { release = resolve; });
  try {
    await page.locator('[data-vehicle="local-rental"]').click();
    await expect.poll(() => api.reads.filter(url => new URL(url).pathname === "/api/v1/vehicles/local-rental").length).toBe(1);
    await expect(page.locator("#nextButton")).toBeEnabled();
    await page.locator("#nextButton").click();
    await expect(page.locator(".loading-label")).toBeVisible();
    release();
    await expect(page.locator('[data-trim="local-rental-active"]')).toBeVisible();
    expect(api.reads.filter(url => new URL(url).pathname === "/api/v1/vehicles/local-rental")).toHaveLength(1);
    await page.locator("#backButton").click();
    await page.locator("#nextButton").click();
    await expect(page.locator('[data-trim="local-rental-active"]')).toBeVisible();
    expect(api.reads.filter(url => new URL(url).pathname === "/api/v1/vehicles/local-rental")).toHaveLength(1);
  } finally { release(); }
});

test("a late prefetch for a previously selected vehicle cannot replace the new selection", async ({ page, api }) => {
  await openInquiry(page);
  await page.locator('[data-brand="현대"]').click();
  await page.locator("#nextButton").click();
  let release;
  api.detailGate = new Promise(resolve => { release = resolve; });
  try {
    await page.locator('[data-vehicle="local-rental"]').click();
    await expect.poll(() => api.reads.filter(url => new URL(url).pathname === "/api/v1/vehicles/local-rental").length).toBe(1);
    api.detailGate = null;
    await page.locator('[data-vehicle="local-zero"]').click();
    await page.locator("#nextButton").click();
    await expect(page.locator('[data-trim="local-zero-active"]')).toBeVisible();
    release();
    await expect(page.locator('[data-trim="local-rental-active"]')).toHaveCount(0);
    await expect(page.locator('[data-trim="local-zero-active"]')).toBeVisible();
  } finally { release(); }
});

test("UNAVAILABLE trim selection blocks progression despite populated raw trims", async ({ page }) => {
  await openInquiry(page);
  await page.locator('[data-brand="현대"]').click();
  await page.locator("#nextButton").click();
  await page.locator('[data-vehicle="local-blocked"]').click();
  await page.locator("#nextButton").click();
  await expect(page.locator(".state-panel")).toContainText("현재 선택 가능한 세부 등급 정보가 없습니다");
  await expect(page.locator("[data-trim]")).toHaveCount(0);
  await expect(page.locator("#nextButton")).toBeDisabled();
});

test("a real zero-color trim progresses with consultation placeholders", async ({ page, api }) => {
  await openInquiry(page);
  await review(page, { id: "local-zero" });
  await expect(page.locator(".review")).toContainText("상담 시 확인 / 상담 시 확인");
  await page.locator("#agreeAll").check();
  await page.locator("#nextButton").click();
  await expect(page.locator("#successTitle")).toBeVisible();
  expect(api.posts).toHaveLength(1);
  expect(api.posts[0].condition_summary).toContain("trim_id=local-zero-active");
  expect(api.posts[0].quoted_monthly_payment).toBeNull();
});

test("back and forward preserve reachable steps; changing trim resets colors and consents", async ({ page }) => {
  await openInquiry(page);
  await review(page);
  await page.locator("#agreeAll").check();
  await page.goBack();
  await step(page, 5);
  await page.goForward();
  await step(page, 6);
  await expect(page.locator("#agreeAll")).toBeChecked();
  await page.getByRole("button", { name: "트림 수정", exact: true }).click();
  await page.locator('[data-trim="local-rental-alternative"]').click();
  await expect(page.locator("[data-color]")).toHaveCount(0);
  await page.locator("#nextButton").click();
  await page.locator("#nextButton").click();
  await expect(page.locator("#customerName")).toHaveValue(name);
  await page.locator("#nextButton").click();
  await expect(page.locator("#agreeAll")).not.toBeChecked();
  await expect(page.locator("#privacyAgree")).not.toBeChecked();
  await expect(page.locator("#noticeAgree")).not.toBeChecked();
  await expect(page.locator("#nextButton")).toBeDisabled();
  await expect(page.locator(".review")).toContainText("상담 시 확인 / 상담 시 확인");
  await page.getByRole("button", { name: "차량 수정", exact: true }).click();
  await page.locator('[data-vehicle="local-zero"]').click();
  await page.locator("#nextButton").click();
  await expect(page.locator('[data-trim="local-zero-active"]')).toBeVisible();
  await expect(page.locator('[data-trim][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator("#nextButton")).toBeDisabled();
});

for (const [label, receipt, status] of [
  ["non-NEW", { id: "local-only-receipt", status: "ACCEPTED" }, 201],
  ["NEW without ID", { id: "", status: "NEW" }, 201],
  ["server error", { detail: "local failure" }, 503],
]) {
  test(`${label} never shows success or automatically resubmits`, async ({ page, api }) => {
    api.receipt = receipt;
    api.submitStatus = status;
    await openInquiry(page);
    await review(page);
    await page.locator("#agreeAll").check();
    await page.locator("#nextButton").click();
    await expect(page.locator("#flowStatus")).toContainText("자동 재전송하지 않습니다");
    await expect(page.locator("#successTitle")).toHaveCount(0);
    await expect(page.locator("#nextButton")).toBeEnabled();
    await expect(page.locator("#stepContent")).toHaveJSProperty("inert", false);
    expect(api.posts).toHaveLength(1);
  });
}

test("a landing vehicle keeps its model and displayed conditions using canonical API IDs", async ({ page, api }) => {
  api.pages[0].items[0].model_name = "모닝";
  api.pages[0].items[0].brand = "기아";
  await page.goto(`/landing/?ref=${referral}&utm_source=vehicle-entry`);
  const card = page.locator('.home-vehicle[data-inquiry-brand="기아"][data-inquiry-model="모닝"]').first();
  await expect(card).toBeVisible();
  await card.locator(".vehicle-quote-button").click();
  await expect(page.locator("#lpPicked")).toContainText("모닝");
  await page.getByRole("link", { name: "셀프견적" }).click();
  await step(page, 2);
  const url = new URL(page.url());
  expect(url.searchParams.get("mileage")).toBe("10000");
  expect(url.searchParams.get("model")).toBe("모닝");
  expect(url.searchParams.get("ref")).toBe(referral);
  await expect(page.locator('[data-vehicle="local-rental"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator("#nextButton").click();
  await page.locator('[data-trim="local-rental-alternative"]').click();
  await page.locator("#nextButton").click();
  await expect(page.locator('[data-condition="term"][data-value="60"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-condition="mileage"][data-value="10000"]')).toHaveAttribute("aria-pressed", "true");
  expect(api.posts).toHaveLength(0);
});

test("switching market clears the hidden brand and keeps keyboard focus on the new tab", async ({ page }) => {
  await openInquiry(page);
  await page.locator('[data-brand="현대"]').click();
  await expect(page.locator('[data-brand="현대"]')).toBeFocused();
  await expect(page.locator("#nextButton")).toBeEnabled();
  await page.locator('[data-market="imported"]').click();
  await expect(page.locator('[data-market="imported"]')).toBeFocused();
  await expect(page.locator("#nextButton")).toBeDisabled();
});

test("an imported vehicle entry returns to the matching manufacturer tab", async ({ page, api }) => {
  api.pages[0].items[0].brand = "Tesla";
  api.pages[0].items[0].model_name = "Model Y";
  const query = new URLSearchParams({ brand: "테슬라", model: "Model Y", mileage: "10000" });
  await page.goto(`/inquiry/steps.html?${query}`);
  await step(page, 2);
  await expect(page.locator('[data-vehicle="local-rental"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator("#backButton").click();
  await step(page, 1);
  await expect(page.locator('[data-market="imported"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-brand="Tesla"]')).toHaveAttribute("aria-pressed", "true");
});

for (const width of [390, 1440]) {
  test(`stepwise inquiry has no serious accessibility violations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openInquiry(page);
    let result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations).toEqual([]);
    await review(page);
    result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations).toEqual([]);
  });
}
