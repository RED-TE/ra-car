const { test, expect } = require("@playwright/test");

const initialStatus = {
  applied: true, status: "APPROVED", name: "QA Crew", login_id: "crew_qa",
  phone: "010-1111-2222", activity_channel: "블로그",
  sns_url: "https://example.com/crew", activity_description: "차량 콘텐츠",
};
const dashboard = {
  referral_code: "RC-QACREW",
  referral_link: "https://recarplan.com/?ref=RC-QACREW",
  total_referrals: 2, signup_count: 0, click_count: 0, unique_click_count: 0,
  condition_request_count: 2, contract_count: 2, contracted_count: 1,
  recent_events: [], referrals: [],
  vehicle_benefit: { target_contracts: 100, eligible_contracts: 2, remaining_contracts: 98 },
};

async function mockCrewApi(page, dashboardOverrides = {}) {
  const saved = { profile: null, inquiries: [] };
  await page.addInitScript(() => localStorage.setItem("recar_friends_access_token", "qa-token"));
  await page.route("https://api.recarplan.com/api/v1/friends/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data;
    let status = 200;
    if (request.method() === "GET" && path.endsWith("/status")) data = initialStatus;
    else if (request.method() === "GET" && path.endsWith("/dashboard")) data = { ...dashboard, ...dashboardOverrides };
    else if (request.method() === "PATCH" && path.endsWith("/profile")) {
      saved.profile = request.postDataJSON();
      data = { ...initialStatus, ...saved.profile };
    } else if (request.method() === "POST" && path.endsWith("/support/requests")) {
      saved.inquiries.push({ id: "qa-inquiry", status: "NEW", created_at: "2026-09-15T09:00:00Z", ...request.postDataJSON() });
      data = { id: "qa-inquiry", status: "NEW" };
      status = 201;
    } else if (request.method() === "GET" && path.endsWith("/support/requests")) {
      data = { items: saved.inquiries };
    } else {
      data = { message: "Unexpected test API request" };
      status = 404;
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  return saved;
}

test("link visits stay separate from customer referrals", async ({ page }) => {
  await mockCrewApi(page, {
    recent_events: [
      { type: "DOWNLOAD", status: "ANALYTICS", amount: 0, occurred_at: "2026-09-15T15:17:50Z", customer_name_masked: null },
      { type: "CONTRACT_PENDING", status: "PENDING", amount: 250000, occurred_at: "2026-09-15T10:00:00Z", customer_name_masked: "김**" },
    ],
  });
  await page.goto("/crew/index.html");
  const rows = page.locator("#recentActivityList .request-row");
  await expect(rows.first()).toContainText("추천 링크 방문");
  await expect(rows.first()).toContainText("1회");
  await expect(rows.first()).toContainText("문의 전");
  await expect(rows.first()).not.toContainText("추천 고객");
  await expect(rows.first()).not.toContainText("1명");
  await expect(rows.nth(1)).toContainText("김**");
  await expect(rows.nth(1)).toContainText("1명");
  await expect(page.locator("#crewAlertCount")).toHaveText("1");
  await page.locator('.crew-sidebar a[href="#crewSupport"]').click();
  await expect(page.locator("#crewSupportContact")).toHaveText("내 등록 연락처: 010-1111-2222");
});

test("account menu keeps every action and disclosure inside its width", async ({ page }, testInfo) => {
  await mockCrewApi(page);
  for (const width of [1280, 800, 761]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/crew/index.html");
    await page.locator(".crew-account-button").click();
    await expect(page.locator("#crewAccountDropdown")).toBeVisible();
    const layout = await page.locator("#crewAccountDropdown").evaluate((menu) => {
      const bounds = menu.getBoundingClientRect();
      return {
        whiteSpace: getComputedStyle(menu).whiteSpace,
        menuLeft: bounds.left,
        menuRight: bounds.right,
        childRights: [...menu.children].map((child) => child.getBoundingClientRect().right),
        linkAlignment: getComputedStyle(menu.querySelector(".account-dropdown-link")).justifyContent,
      };
    });
    expect(layout.whiteSpace).toBe("normal");
    expect(layout.linkAlignment).toBe("flex-start");
    expect(layout.menuLeft).toBeGreaterThanOrEqual(0);
    expect(layout.menuRight).toBeLessThanOrEqual(width);
    expect(Math.max(...layout.childRights)).toBeLessThanOrEqual(layout.menuRight);
    await page.locator("#crewAccountDropdown").screenshot({ path: testInfo.outputPath(`account-menu-${width}.png`) });
  }
});

test("generated KPI artwork loads without changing the dashboard labels", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockCrewApi(page);
  await page.goto("/crew/index.html");
  const icons = page.locator(".crew-kpi-icon, .crew-benefit-icon img");
  await expect(icons).toHaveCount(5);
  expect(await icons.evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth >= 120))).toBe(true);
  await expect(page.locator(".crew-summary-grid")).toContainText("추천인 수");
  await expect(page.locator(".crew-summary-grid")).toContainText("심사 수");
  await expect(page.locator(".crew-summary-grid")).toContainText("계약 수");
  await expect(page.locator(".crew-summary-grid")).toContainText("인도 수");
  await expect(page.locator(".crew-benefit-strip")).toContainText("차량 1년 이용 혜택");
  await page.locator(".crew-summary-grid").screenshot({ path: testInfo.outputPath("crew-kpi-icons.png") });
  await page.locator(".crew-benefit-strip").screenshot({ path: testInfo.outputPath("crew-benefit-icon.png") });

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/crew/index.html");
  expect(await icons.evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth >= 120))).toBe(true);
  await expect(page.locator(".crew-benefit-strip")).toContainText("차량 1년 이용 혜택");
  const mobileBounds = await page.locator(".crew-summary-grid, .crew-benefit-strip").evaluateAll((sections) =>
    sections.map((section) => {
      const bounds = section.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right };
    }),
  );
  expect(mobileBounds.every(({ left, right }) => left >= 0 && right <= 320)).toBe(true);
});

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  test(`crew header stays in crew and separates homepage on ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/crew/login.html");
    const loginBrand = page.getByRole("link", { name: "크루 로그인" });
    await expect(loginBrand).toHaveAttribute("href", "./login.html");
    await expect(page.locator(".crew-login-home-link")).toBeVisible();
    await expect(page.locator(".crew-login-home-link")).toHaveAttribute("href", "https://recarplan.com/");
    await loginBrand.click();
    await expect(page).toHaveURL(/\/crew\/login\.html$/);

    await mockCrewApi(page);
    await page.goto("/crew/index.html#crewSupport");
    const dashboardBrand = page.locator(".crew-topbar-brand");
    await expect(dashboardBrand).toBeVisible();
    await expect(page.locator(".crew-homepage-link")).toBeVisible();
    await expect(page.locator(".crew-homepage-link")).toHaveAttribute("href", "https://recarplan.com/");
    await dashboardBrand.click();
    await expect(page).toHaveURL(/\/crew\/index\.html#$/);
    await expect(page.getByRole("heading", { name: "고객센터" })).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  });

  test(`crew self-service and support on ${label}`, async ({ context, page }, testInfo) => {
    await page.setViewportSize(viewport);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const saved = await mockCrewApi(page);
    await page.goto("/crew/index.html#crewProfile");
    await expect(page.getByRole("heading", { name: "내정보" })).toBeVisible();
    await expect(page.locator("#crewProfileLoginId")).toHaveText("crew_qa");
    await expect(page.locator("#crewProfileLink")).toHaveValue("https://recarplan.com/r/RC-QACREW");
    await page.screenshot({ path: testInfo.outputPath(`${label}-profile.png`) });
    await page.getByRole("button", { name: "고지 포함 추천 공유문 복사" }).click();
    await expect(page.locator("#crewCopyStatus")).toHaveText("수수료 안내를 포함한 공유문을 복사했습니다.");
    await page.locator('#crewProfileForm [name="phone"]').fill("010-2222-3333");
    await page.getByRole("button", { name: "변경 저장" }).click();
    await expect(page.locator("#crewProfileSaveStatus")).toContainText("저장했습니다");
    expect(saved.profile.phone).toBe("010-2222-3333");

    await page.locator('.crew-sidebar a[href="#crewSupport"]').click();
    await expect(page.getByRole("heading", { name: "고객센터" })).toBeVisible();
    await expect(page.locator('#crewSupport a[href="tel:01065731038"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${label}-support.png`) });
    await page.locator('#crewSupportForm [name="message"]').fill("정산 내역을 확인하고 연락해 주세요.");
    await page.getByRole("button", { name: "문의 남기기" }).click();
    await expect(page.locator("#crewSupportSaveStatus")).toContainText("접수됐습니다");
    await expect(page.locator("#crewSupportHistory")).toContainText("정산 내역을 확인하고 연락해 주세요.");
    expect(saved.inquiries).toHaveLength(1);
    await page.getByRole("button", { name: "고객센터 닫기" }).click();
    await expect(page.locator("#crewBenefitCount")).toHaveText("2대");
    await expect(page.locator("#crewBenefitRemaining")).toContainText("98대 남음");
    await page.locator(".crew-benefit-strip").evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.screenshot({ path: testInfo.outputPath(`${label}-dashboard.png`) });
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      offenders: [...document.querySelectorAll("body *")].filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width && box.right > document.documentElement.clientWidth + 1;
      }).slice(0, 8).map((element) => ({ tag: element.tagName, className: element.className?.baseVal || element.className, right: element.getBoundingClientRect().right })),
    }));
    expect(overflow, JSON.stringify(overflow)).toMatchObject({ scrollWidth: viewport.width, clientWidth: viewport.width });
  });
}
