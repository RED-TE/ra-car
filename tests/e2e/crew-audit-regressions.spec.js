const { test, expect } = require("@playwright/test");
const { AxeBuilder } = require("@axe-core/playwright");

const status = { applied: true, status: "APPROVED", name: "테스트 크루", login_id: "fixture", phone: "010-0000-0000", activity_description: "테스트" };
function dashboard(month = "2026-10") {
  const days = month === "2026-09" ? 30 : 31;
  return {
    referral_code: "RC-QACREW", total_referrals: 1, click_count: 2,
    settlement: { pending_month_amount: 450000 },
    vehicle_benefit: { target_contracts: 100, eligible_contracts: 1 },
    crew_metrics: {
      referral_count: 1, review_count: 1, contract_count: 1, delivery_count: 1,
      period: { month_start: `${month}-01`, month_end: `${month}-${days}` },
      daily: Array.from({ length: days }, (_, index) => ({ date: `${month}-${String(index + 1).padStart(2, "0")}`, label: `${Number(month.slice(5))}/${index + 1}`, referrals: index === 1 ? 1 : 0, reviews: 0, contracts: 0, deliveries: 0, settlement_amount: 0 })),
    },
    recent_events: [{ type: "CONTRACT_DELIVERED", status: "PAID", amount: 450000, customer_name_masked: "김**", occurred_at: "2026-10-02T08:00:00Z" }],
    referrals: [{ id: "fixture-referral", stage: "DELIVERY_COMPLETED", reward_status: "PAID", reward_amount: 450000, customer_name_masked: "김**", created_at: "2026-10-02T08:00:00Z" }],
  };
}

async function mock(page, options = {}) {
  await page.clock.install({ time: new Date("2026-10-12T06:00:00Z") });
  if (options.token !== false) await page.addInitScript(() => {
    if (!sessionStorage.getItem("fixture-session-seeded")) {
      localStorage.setItem("recar_friends_access_token", "fixture-token");
      sessionStorage.setItem("fixture-session-seeded", "1");
    }
  });
  const state = { applications: [], inquiries: [], months: [], loginCalls: 0, statusCalls: 0 };
  await page.route("https://api.recarplan.com/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    let body = {};
    let code = 200;
    if (url.pathname.endsWith("/status")) {
      state.statusCalls += 1;
      body = { ...status, ...options.status };
      if (options.statusCode) { code = options.statusCode; body = { error: { message: "서버 점검 중입니다." } }; }
    } else if (url.pathname.endsWith("/dashboard")) {
      const month = url.searchParams.get("month") || "2026-10";
      state.months.push(month);
      body = options.noMetrics ? { ...dashboard(), crew_metrics: undefined } : dashboard(month);
      if (options.monthError && url.searchParams.has("month")) { code = 503; body = { error: { message: "월 조회 점검 중입니다." } }; }
    } else if (url.pathname.endsWith("/login-id/check")) body = { available: true, login_id: url.searchParams.get("login_id") };
    else if (url.pathname.endsWith("/apply")) { state.applications.push(request.postDataJSON()); code = 201; body = { login_id: request.postDataJSON().login_id, status: "PENDING" }; }
    else if (url.pathname.endsWith("/login")) { state.loginCalls += 1; code = options.loginCode || 200; body = code === 200 ? { access_token: "fixture-token" } : { error: { message: "서비스 점검 중입니다." } }; }
    else if (url.pathname.endsWith("/support/requests")) {
      if (request.method() === "POST") { state.inquiries.push({ id: "fixture-inquiry", status: "NEW", ...request.postDataJSON() }); code = 201; }
      body = request.method() === "GET" ? { items: state.inquiries } : { id: "fixture-inquiry" };
    } else { code = 404; body = { error: { message: "Unexpected fixture request" } }; }
    await route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
  });
  return state;
}

for (const path of ["/crew?action=apply", "/crew/?action=apply", "/crew/login?action=apply"]) {
  test(`application intent survives ${path}`, async ({ page }) => {
    await mock(page, { token: false });
    await page.goto(path);
    await expect(page.locator("#crewApplyForm")).toBeVisible();
    await expect(page.locator("#crewLoginForm")).toBeHidden();
    await expect(page).toHaveURL(/\/crew\/login(?:\.html)?\?action=apply$/);
  });
}

test("successful application closes the form and moves focus to the receipt", async ({ page }) => {
  const state = await mock(page, { token: false });
  await page.goto("/crew/login.html?action=apply");
  await page.locator("#crewApplyName").fill("테스트 신청");
  await page.locator("#crewApplyPhone").fill("010-0000-0000");
  await page.locator("#crewApplySnsNone").check();
  await expect(page.locator("#crewApplySns")).toBeDisabled();
  await page.locator("#crewApplyLoginId").fill("test+특수@example.invalid");
  await page.locator("#checkLoginIdButton").click();
  await expect(page.locator("#loginIdSuccess")).toBeVisible();
  await page.locator("#crewApplyPassword").fill("fixture-only-password");
  await page.locator("#crewApplyPasswordConfirm").fill("fixture-only-password");
  await page.locator("#crewApplyConsentAll").check();
  await page.locator("#crewApplyPrivacy").uncheck();
  expect(await page.locator("#crewApplyConsentAll").evaluate(input => input.indeterminate)).toBe(true);
  await page.locator("#crewApplyConsentAll").check();
  await page.locator("#crewApplyButton").click();
  await expect(page.locator("#crewApplyForm")).toBeHidden();
  await expect(page.locator("#crewApplyComplete")).toBeVisible();
  await expect(page.locator("#crewApplyComplete")).toBeFocused();
  await expect(page.locator("#crewApplyButton")).toBeDisabled();
  expect(state.applications).toHaveLength(1);
  expect(state.applications[0]).toMatchObject({ login_id: "test+특수@example.invalid", terms_agreed: true, privacy_agreed: true, settlement_policy_agreed: true, ad_disclosure_agreed: true, advertising_guide_agreed: true });
});

test("saved session reaches a single dashboard without a navigation loop", async ({ page }) => {
  const state = await mock(page);
  let navigations = 0;
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations += 1; });
  await page.goto("/crew");
  await expect(page.locator("#crewShareLink")).toHaveValue("https://recarplan.com/app/?ref=RC-QACREW");
  expect(state.statusCalls).toBe(1);
  expect(navigations).toBeLessThan(4);
});

for (const pendingStatus of ["PENDING", "REJECTED", "SUSPENDED"]) {
  test(`${pendingStatus} has an explicit account notice`, async ({ page }) => {
    await mock(page, { status: { status: pendingStatus } });
    await page.goto("/crew/index.html");
    await expect(page.locator("#crewSessionNotice")).toBeVisible();
    await expect(page.locator("#crewSessionNotice")).toContainText(pendingStatus === "PENDING" ? "승인 대기" : pendingStatus === "REJECTED" ? "승인하지 못" : "이용이 제한");
    await expect(page.locator("#crewLoginForm")).toBeVisible();
  });
}

test("logout clears the token and returning to the dashboard cannot expose the account", async ({ page }) => {
  await mock(page);
  await page.goto("/crew/index.html#crewProfile");
  await expect(page.locator("#crewProfileLoginId")).toHaveText("fixture");
  await page.locator("#crewProfile .crew-logout").click();
  await expect(page.locator("#crewSessionNotice")).toHaveText("로그아웃했습니다.");
  // Prevent the fixture's init script from reintroducing a token on navigation.
  expect(await page.evaluate(() => localStorage.getItem("recar_friends_access_token"))).toBeNull();
  await page.goto("/crew/index.html");
  await expect(page.locator("#crewLoginForm")).toBeVisible();
  await expect(page).toHaveURL(/\/crew\/login\.html$/);
});

test("login shows the service error instead of blaming credentials", async ({ page }) => {
  await mock(page, { token: false, loginCode: 503 });
  await page.goto("/crew/login.html");
  await page.locator("#crewId").fill("fixture");
  await page.locator("#crewPassword").fill("fixture-only-password");
  await page.locator("#crewLoginForm .login-button").click();
  await expect(page.locator("#loginError")).toHaveText("서비스 점검 중입니다.");
  await expect(page.locator("#crewLoginForm .login-button")).toBeEnabled();
});

test("daily details exclude future dates and monthly navigation requests real data", async ({ page }) => {
  const state = await mock(page);
  await page.goto("/crew/index.html#crewAnalyticsDetail");
  await expect(page.locator("#analyticsTableBody tr")).toHaveCount(12);
  await expect(page.locator("#analyticsTableBody tr").first()).toContainText("10월 12일");
  await page.locator(".analytics-close-button").click();
  await page.getByRole("button", { name: "이전 달", exact: true }).click();
  await expect(page.locator("#chartMonthLabel")).toHaveText("2026년 9월");
  await expect(page.locator("#settlementMonth")).toHaveValue("2026-09");
  expect(state.months).toContain("2026-09");
  await page.getByRole("button", { name: "다음 달", exact: true }).click();
  await expect(page.locator("#chartMonthLabel")).toHaveText("2026년 10월");
  await expect(page.getByRole("button", { name: "다음 달", exact: true })).toBeDisabled();
});

test("failed monthly request preserves the previously verified period", async ({ page }) => {
  await mock(page, { monthError: true });
  await page.goto("/crew/index.html");
  await expect(page.locator("#chartMonthLabel")).toHaveText("2026년 10월");
  await page.getByRole("button", { name: "이전 달", exact: true }).click();
  await expect(page.locator("#crewPeriodStatus")).toContainText("기존 조회 결과를 유지");
  await expect(page.locator("#chartMonthLabel")).toHaveText("2026년 10월");
});

test("Korean activity dates and invalid month inputs stay consistent with the displayed period", async ({ page }) => {
  await mock(page);
  await page.goto("/crew/index.html");
  await expect(page.locator("#crewShareLink")).not.toHaveValue("");
  expect(await page.evaluate(() => window.longDateLabel({ date: "2026-09-30T16:00:00" }))).toBe("10월 1일");
  expect(await page.evaluate(() => window.longDateLabel({ date: "2026-09-30" }))).toBe("9월 30일");
  await page.locator("#settlementMonth").fill("2026-11");
  await expect(page.locator("#settlementMonth")).toHaveValue("2026-10");
  await expect(page.locator("#crewPeriodStatus")).toContainText("기존 조회 결과를 유지");
});

test("missing monthly metrics are not fabricated as zero-valued days", async ({ page }) => {
  await mock(page, { noMetrics: true });
  await page.goto("/crew/index.html");
  await expect(page.locator("#crewPeriodStatus")).toContainText("제공받지 못");
  await expect(page.locator("#chartMetricTotal")).toHaveText("미제공");
  await expect(page.locator("#chartMonthLabel")).toHaveText("2026년 10월");
  await expect(page.locator(".activity-chart")).toBeHidden();
});

test("recent activities open real details and paid rewards are labelled paid", async ({ page }) => {
  await mock(page);
  await page.goto("/crew/index.html");
  await page.locator("#recentActivityList .request-row").click();
  await expect(page.locator("#crewActivityDialog")).toBeVisible();
  await expect(page.locator("#crewActivityDetail")).toContainText("지급완료");
  await expect(page.locator("#crewActivityDetail")).toContainText("450,000");
  await page.locator("#crewActivityClose").click();
  await page.locator("#crewActivityAll").click();
  await expect(page.locator("#crewActivityDialogTitle")).toHaveText("전체 추천 진행 내역");
  await page.locator(".crew-activity-item").click();
  await expect(page.locator("#crewActivityDetail")).toContainText("인도 완료");
});

test("group purchase is submitted through the admin-connected support inbox", async ({ page }) => {
  const state = await mock(page);
  await page.goto("/crew/index.html");
  await expect(page.locator("#crewGroupPurchase")).toBeEnabled();
  await page.locator("#crewGroupPurchase").click();
  await expect(page.locator("#crewSupportForm")).toBeVisible();
  await expect(page.locator('#crewSupportForm [name="category"]')).toHaveValue("ETC");
  await page.locator('#crewSupportForm [name="message"]').fill("[차량 공동구매 신청] 희망 차량: GV70, 예상 대수: 3대");
  await page.locator('#crewSupportForm button[type="submit"]').click();
  await expect(page.locator("#crewSupportSaveStatus")).toContainText("접수됐습니다");
  await expect(page.locator("#crewSupportHistory")).toContainText("GV70");
  expect(state.inquiries[0]).toMatchObject({ category: "ETC", message: "[차량 공동구매 신청] 희망 차량: GV70, 예상 대수: 3대" });
});

test("initial API failure cannot be mistaken for zero results", async ({ page }) => {
  await mock(page, { statusCode: 503 });
  await page.goto("/crew/index.html");
  await expect(page.locator("#crewLoadError")).toBeVisible();
  await expect(page.locator("#referralCount")).toHaveText("조회 불가");
  await expect(page.locator("#settlementAmount")).toHaveText("조회 불가");
  expect(await page.evaluate(() => localStorage.getItem("recar_friends_access_token"))).toBe("fixture-token");
});

test("legacy referral URLs reach the app with their code intact", async ({ page }) => {
  await page.route("**/app/flutter_bootstrap.js**", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.goto("/r/RC-QACREW");
  await expect(page).toHaveURL(/\/app\/\?ref=RC-QACREW$/);
  await expect(page.locator("base")).toHaveAttribute("href", "/app/");
});

test("mobile dashboard and application have no overflow and preserve readable conditions", async ({ page }, testInfo) => {
  await mock(page);
  for (const width of [360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/crew/index.html");
    await expect(page.locator("#crewShareLink")).toHaveValue("https://recarplan.com/app/?ref=RC-QACREW");
    const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll("body *")].filter(el => { const box = el.getBoundingClientRect(); return box.width && box.right > innerWidth + 1 && getComputedStyle(el).position !== "fixed"; }).slice(0, 12).map(el => ({ name: el.tagName, id: el.id, className: String(el.className), right: el.getBoundingClientRect().right })) }));
    expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(width);
    if (width <= 430) expect(await page.locator(".crew-summary-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(2);
    if ([390, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true });
  }
  const dashboardResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(dashboardResults.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))).toEqual([]);
  await page.goto("/crew/login.html?action=apply");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

for (const [name, path] of [["login", "/crew/login.html"], ["njob", "/crew/njob/"], ["guide", "/crew/guide/"]]) {
  test(`${name} public layout has readable contrast and no horizontal overflow`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mock(page, { token: false });
    for (const width of [360, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if ([390, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true });
    }
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))).toEqual([]);
  });
}
