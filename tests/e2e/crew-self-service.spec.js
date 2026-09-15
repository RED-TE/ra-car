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

async function mockCrewApi(page) {
  const saved = { profile: null, inquiries: [] };
  await page.addInitScript(() => localStorage.setItem("recar_friends_access_token", "qa-token"));
  await page.route("https://api.recarplan.com/api/v1/friends/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data;
    let status = 200;
    if (request.method() === "GET" && path.endsWith("/status")) data = initialStatus;
    else if (request.method() === "GET" && path.endsWith("/dashboard")) data = dashboard;
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

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  test(`crew self-service and support on ${label}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const saved = await mockCrewApi(page);
    await page.goto("/crew/index.html#crewProfile");
    await expect(page.getByRole("heading", { name: "내정보" })).toBeVisible();
    await expect(page.locator("#crewProfileLoginId")).toHaveText("crew_qa");
    await expect(page.locator("#crewProfileLink")).toHaveValue("https://recarplan.com/?ref=RC-QACREW");
    await page.screenshot({ path: testInfo.outputPath(`${label}-profile.png`) });
    await page.getByRole("button", { name: "추천 링크 복사" }).click();
    await expect(page.locator("#crewCopyStatus")).toHaveText("복사했습니다.");
    await page.locator('#crewProfileForm [name="phone"]').fill("010-2222-3333");
    await page.getByRole("button", { name: "변경 저장" }).click();
    await expect(page.locator("#crewProfileSaveStatus")).toContainText("저장했습니다");
    expect(saved.profile.phone).toBe("010-2222-3333");

    await page.getByRole("link", { name: "고객센터", exact: true }).click();
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
