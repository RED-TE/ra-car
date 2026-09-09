const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const catalog = require("../../data/vehicle-static-catalog.json");

test.beforeEach(async ({ page }) => {
  // No test can create a production inquiry, even if the legacy Firebase fallback runs.
  await page.route("**/api/v1/friends/track**", route => route.fulfill({ status: 204 }));
  await page.route("**/firestore.googleapis.com/**", route => route.abort());
  await page.route("https://www.gstatic.com/firebasejs/**", route => route.abort());
  await page.route("**/api/leads", route => route.fulfill({ status: 201, json: { ok: true, stored: "firebase", firebase: { stored: true } } }));
});

async function ready(page, url = "/") {
  await page.goto(url);
  await expect(page.locator(".home-vehicle").first()).toBeVisible();
}

async function fillForm(page) {
  await page.locator("#vehicleWish").fill("로컬 검증용 차량");
  await page.locator("#contactPhone").fill("010-0000-0000");
  await page.locator("#customerName").fill("로컬 테스트");
  await page.locator("#privacyConsent").check();
  await page.locator("#termsConsent").check();
}

test("vehicle data keeps models, brands and body types aligned", async () => {
  const trailblazer = catalog.items.find(item => item.id === "static-쉐보레트레일블레이저");
  expect(trailblazer).toMatchObject({ brand: "쉐보레", name: "트레일블레이저" });
  expect(trailblazer.categories).toContain("suv");
  expect(trailblazer.imageUrl).toContain("쉐보레/트레일블레이저/model_360.png");

  const shootingBrake = catalog.items.find(item => item.id === "static-제네시스g70슈팅브레이크");
  expect(shootingBrake).toMatchObject({ brand: "제네시스", name: "G70 슈팅브레이크" });
  expect(shootingBrake.imageUrl).toContain("제네시스/G70/model_360.png");

  const cla = catalog.items.find(item => item.id === "static-mercedesbenzcla");
  expect(cla.name).toBe("CLA-Class");
  expect(cla.imageUrl).toContain("벤츠/CLA-Class/model_360.png");
});

test("home assets load, reference proportions and actual catalog prices are preserved", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const file of ["/home.css", "/home.js", "/assets/home-fonts/Pretendard-Regular.woff2", "/assets/home-icons/quick-quote.webp", "/assets/home-icons/guide-rent-lease.webp"]) expect((await request.get(file)).status()).toBe(200);
  await ready(page);
  expect((await page.locator(".site-header").boundingBox()).height).toBe(86);
  expect((await page.locator('.promotion-slide[data-position="center"]').boundingBox()).width).toBe(750);
  expect((await page.locator("#special").boundingBox()).width).toBe(1200);
  await expect(page.locator(".home-vehicle").first()).toContainText(catalog.items[0].monthlyPayment.toLocaleString("ko-KR"));
  await expect(page.locator(".catalog-basis")).toContainText("60개월");
  await expect(page.locator(".catalog-basis")).toContainText("선납금 0% · 보증금 0%");
  await expect(page.locator(".catalog-basis")).toContainText("10,000km");
  expect(await page.evaluate(() => localStorage.getItem("recar_referral_code"))).toBeNull();
});

test("manufacturer, body, product, search, sorting and empty-state reset work", async ({ page }) => {
  await ready(page);
  await page.locator('[data-brand="기아"]').click();
  await expect(page.locator(".home-vehicle").first()).toContainText("모닝");
  await page.locator('[data-body="suv"]').click();
  const suvIds = await page.locator(".home-vehicle").evaluateAll(cards => cards.map(card => card.dataset.vehicleId));
  expect(suvIds.length).toBeGreaterThan(0);
  for (const id of suvIds) expect(catalog.items.find(item => item.id === id).categories).toContain("suv");
  await page.locator("#homeSearch").fill("Tesla");
  await page.locator(".home-search").getByRole("button").click();
  await expect(page.locator(".home-vehicle").first()).toContainText("Model");
  await page.locator("#homeSearch").fill("");
  await page.locator(".home-search").getByRole("button").click();
  await page.locator("#catalogProduct").selectOption("lease");
  const productIds = await page.locator(".home-vehicle").evaluateAll(cards => cards.map(card => card.dataset.vehicleId));
  expect(productIds.length).toBeGreaterThan(0);
  for (const id of productIds) expect(catalog.items.find(item => item.id === id).calculation.product).toBe("lease");
  await page.locator("#homeSearch").fill("없는차량__local");
  await page.locator(".home-search").getByRole("button").click();
  await expect(page.locator("#catalogEmpty")).toBeVisible();
  await page.getByRole("button", { name: "검색 조건 초기화" }).click();
  await page.locator("#catalogSort").selectOption("price");
  const prices = await page.locator(".home-car-price strong").allTextContents();
  const values = prices.map(price => Number(price.replaceAll(",", "")));
  expect(values).toEqual([...values].sort((a,b) => a-b));
});

test("hero, car rail, guide filters and vehicle inquiry entry work", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: "다음 배너", exact: true }).click();
  await expect(page.locator(".promotion-count b")).toHaveText("2");
  await expect(page.locator('.promotion-slide[data-position="center"]')).toContainText("BMW");
  await page.getByRole("button", { name: "이전 배너", exact: true }).click();
  await expect(page.locator(".promotion-count b")).toHaveText("1");
  await page.getByRole("button", { name: "다음 차량", exact: true }).click();
  expect(await page.locator(".vehicle-grid").evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
  await page.getByRole("button", { name: "이전 차량", exact: true }).click();
  await page.locator(".home-vehicle-link").first().click();
  await expect(page.locator("#vehicleWish")).toHaveValue(/모닝/);
  await expect(page.locator("#contactPhone")).toBeFocused();
  await page.locator('[data-guide="business"]').click();
  await expect(page.locator(".guide-card:visible")).toHaveCount(1);
  await page.locator('[data-guide="compare"]').click();
  await page.locator('.guide-card[href="#rentGuide"]').click();
  await expect(page.locator("#rentGuide")).toHaveAttribute("open", "");
});

test("SUV collection uses distinct representative SUV models", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const titles = await page.locator("#suvCollection h3").allTextContents();
  expect(titles).toHaveLength(12);
  expect(new Set(titles).size).toBe(titles.length);
  expect(titles).not.toContain("기아 레이");
  expect(titles).toContain("쉐보레 트레일블레이저");
  expect(titles).toContain("현대 디 올 뉴 팰리세이드");

  const floating = page.locator(".home-floating");
  expect((await floating.boundingBox()).width).toBeLessThanOrEqual(52);
  await expect(floating.getByRole("link", { name: "카카오톡 상담" })).toHaveCount(1);
  await expect(floating.getByRole("link", { name: "견적 상담" })).toHaveCount(0);
});

test("persistent inquiry entry follows desktop and mobile without covering focused fields", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  const desktopButton = page.locator(".persistent-quote-button");
  const quickDialog = page.locator("#quickQuoteDialog");
  await expect(desktopButton).toBeVisible();
  await expect(desktopButton).toHaveAttribute("aria-haspopup", "dialog");
  expect((await desktopButton.boundingBox()).y).toBeGreaterThan(900);
  await desktopButton.click();
  await expect(quickDialog).toBeVisible();
  await expect(quickDialog.locator(".quote-form")).toBeVisible();
  await expect(page.locator("#contactPhone")).toBeFocused();
  await expect(desktopButton).toBeHidden();
  await fillForm(page);
  const popupRequest = page.waitForRequest("**/api/leads");
  await quickDialog.getByRole("button", { name: "조건 확인하기", exact: true }).click();
  expect((await popupRequest).postDataJSON()).toMatchObject({ entryPoint: "하단 간편 문의" });
  await expect(quickDialog.locator(".form-status")).toContainText("문의가 접수되었습니다");
  await quickDialog.getByRole("button", { name: "문의 창 닫기" }).click();
  await expect(quickDialog).toBeHidden();
  await expect(page.locator("#quote > .home-container > .quote-form")).toBeAttached();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(desktopButton).toBeHidden();
  await expect(page.locator(".mobile-consult")).toBeVisible();
  await expect(page.locator(".mobile-consult")).toHaveAttribute("href", "#quote");
  await page.locator(".mobile-consult").click();
  await expect(quickDialog).toBeVisible();
  await expect(page.locator("#contactPhone")).toBeFocused();
});

test("mobile menu closes with Escape, outside click and navigation; focus is restored", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const toggle = page.getByRole("button", { name: "전체 메뉴 열기" });
  await toggle.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.mouse.click(10, 400);
  await expect(page.getByRole("dialog")).toBeHidden();
  await toggle.click();
  await page.locator("#homeMenu").getByRole("link", { name: "전체 차량", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).toHaveURL(/#special$/);
  await expect(page.locator(".home-vehicle")).toHaveCount(3);
});

test("required fields and both consents are validated with associated errors", async ({ page }) => {
  await ready(page);
  const submit = page.getByRole("button", { name: "조건 확인하기", exact: true });
  await submit.click();
  await expect(page.locator("#vehicleWish")).toBeFocused();
  await expect(page.locator("#vehicleWish")).toHaveAttribute("aria-invalid", "true");
  await page.locator("#vehicleWish").fill("미정");
  await page.locator("#contactPhone").fill("123");
  await submit.click();
  await expect(page.locator("#contactPhone")).toBeFocused();
  await page.locator("#contactPhone").fill("010-0000-0000");
  await submit.click();
  await expect(page.locator("#customerName")).toBeFocused();
  await page.locator("#customerName").fill("로컬 테스트");
  await submit.click();
  await expect(page.locator("#privacyConsent")).toBeFocused();
  await page.locator("#privacyConsent").check();
  await submit.click();
  await expect(page.locator("#termsConsent")).toBeFocused();
});

test("submission waits for real response, blocks duplicate events, retains referral and campaign", async ({ page }) => {
  let submissions = 0, payload;
  let resolveResponse;
  const responseGate = new Promise(resolve => { resolveResponse = resolve; });
  await page.route("**/api/leads", async route => {
    submissions++;
    payload = route.request().postDataJSON();
    await responseGate;
    await route.fulfill({ status: 201, json: { ok: true, stored: "firebase" } });
  });
  await ready(page, "/?ref=RC-LOCALQA&campaign=local-test&leadSource=local-qa&vehicle=Test#quote");
  await fillForm(page);
  await page.getByRole("button", { name: "조건 확인하기", exact: true }).click();
  await expect(page.locator(".quote-form")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".submit-button")).toBeDisabled();
  await expect(page.locator(".form-status")).toBeHidden();
  await page.locator(".quote-form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await expect.poll(() => submissions).toBe(1);
  resolveResponse();
  await expect(page.locator(".form-status")).toBeVisible();
  await expect(page.locator(".form-status")).toContainText("문의가 접수되었습니다");
  expect(payload).toMatchObject({ referralCode: "RC-LOCALQA", privacyConsent: true, termsConsent: true, campaign: "local-test", leadSource: "local-qa", entryPoint: "홈페이지 상담 폼" });
});

test("a server-only inquiry is mirrored to the Firebase collection used by admin", async ({ page }) => {
  await page.addInitScript(() => {
    window.__adminLeadWrites = [];
    const firestore = () => ({
      collection: (name) => ({
        doc: (id) => ({
          set: (data) => {
            window.__adminLeadWrites.push({ name, id, data });
            return Promise.resolve();
          },
        }),
      }),
    });
    window.firebase = { apps: [{}], firestore, initializeApp: () => {} };
  });
  await page.route("**/api/leads", route => route.fulfill({ status: 201, json: { ok: true, stored: "server", firebase: { stored: false } } }));
  await ready(page);
  await fillForm(page);
  await page.getByRole("button", { name: "조건 확인하기", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__adminLeadWrites.length)).toBe(1);
  const write = await page.evaluate(() => window.__adminLeadWrites[0]);
  expect(write.name).toBe("leads");
  expect(write.data).toMatchObject({ progressStatus: "미배정", entryPoint: "홈페이지 상담 폼" });
});

test("failed inquiry stays failed until a successful retry response", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/leads", route => {
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 503, json: { error: "test-only" } }) : route.fulfill({ status: 201, json: { ok: true, stored: "firebase" } });
  });
  await ready(page);
  await fillForm(page);
  await page.locator(".submit-button").click();
  await expect(page.locator(".form-status")).toContainText("문제가 발생했습니다");
  await expect(page.locator(".submit-button")).toBeEnabled();
  await page.locator(".submit-button").click();
  await expect(page.locator(".form-status")).toContainText("문의가 접수되었습니다");
  expect(attempts).toBe(2);
});

test("catalog outage, retry, empty and missing-image states are truthful", async ({ page }) => {
  await page.route("**/data/vehicle-static-catalog.json*", route => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/recar/vehicles?**", route => route.fulfill({ status: 503, json: {} }));
  await page.goto("/");
  await expect(page.locator("#vehicleError")).toBeVisible();
  await expect(page.locator(".home-vehicle")).toHaveCount(0);
  await page.route("**/data/vehicle-static-catalog.json*", route => route.fulfill({ json: { ...catalog, items: [] } }));
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await expect(page.locator("#catalogEmpty")).toBeVisible();
  await page.route("**/data/vehicle-static-catalog.json*", route => route.fulfill({ json: { ...catalog, items: [{ ...catalog.items[0], imageUrl: "/missing-image-test.png" }] } }));
  await page.reload();
  await expect(page.locator(".image-missing")).toBeVisible();
  await expect(page.locator(".home-car-price")).toContainText(catalog.items[0].monthlyPayment.toLocaleString("ko-KR"));
});

test("catalog shows loading until the data response arrives", async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/data/vehicle-static-catalog.json*", async route => {
    await gate;
    await route.fulfill({ json: catalog });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  try {
    await expect(page.locator(".catalog-loading")).toBeVisible();
    await expect(page.locator(".vehicle-grid")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator(".home-vehicle")).toHaveCount(0);
  } finally { release(); }
  await expect(page.locator(".home-vehicle").first()).toBeVisible();
  await expect(page.locator(".vehicle-grid")).toHaveAttribute("aria-busy", "false");
});

test("six target widths and narrow reflow keep prices and form controls accessible", async ({ page }) => {
  for (const width of [360,390,768,1280,1440,1920,320]) {
    await page.setViewportSize({ width, height: 1000 });
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const clipped = await page.locator(".home-car-price, .home-car-name, .submit-button").evaluateAll(elements =>
      elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
    expect(clipped).toEqual([]);
    await page.locator("#contactPhone").focus();
    await expect(page.locator("#contactPhone")).toBeFocused();
    if (width <= 600) await expect(page.locator(".mobile-bottom")).toBeHidden();
  }
});

test("catalog API fallback receives unchanged default conditions", async ({ page }) => {
  let query;
  await page.route("**/data/vehicle-static-catalog.json*", route => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/recar/vehicles?**", route => {
    query = Object.fromEntries(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: { ok: true, items: catalog.items.slice(0, 4) } });
  });
  await ready(page);
  expect(query).toMatchObject({ term: "60", deposit_pct: "0", mileage_limit: "10000", mode: "all" });
});

test("desktop and mobile homepage have no serious accessibility violations", async ({ page }) => {
  for (const width of [1440,390]) {
    await page.setViewportSize({ width, height: 1000 });
    await ready(page);
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations.filter(issue => ["serious", "critical"].includes(issue.impact))).toEqual([]);
  }
});
