const { expect, test } = require("@playwright/test");

function trackConsoleErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("core comparison controls update the visible structure", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.goto("/crew/knowledge/preview/");

  await page.getByRole("button", { name: "기존 방식", exact: true }).click();
  await expect(page.locator("[data-flow-fee]")).toBeVisible();
  await expect(page.locator("[data-finance-stack] span:visible")).toHaveCount(1);
  await expect(page.locator("[data-recar-caption]")).toContainText("영업 과정");

  await page.locator("[data-recar-mode='recar']").click();
  await expect(page.locator("[data-flow-fee]")).toBeHidden();
  await expect(page.locator("[data-finance-stack] span:visible")).toHaveCount(3);

  await page.locator("[data-mode='lease']").click();
  await expect(page.locator("[data-mode-owner]")).toHaveText("리스사");
  await expect(page.locator("[data-mode-plate]")).toContainText("일반 번호판");
  await expect(page.locator("[data-mode-insurance]")).toContainText("개인 별도");

  await page.locator("[data-mode='installment']").click();
  await expect(page.locator("[data-mode-owner]")).toHaveText("고객");
  await expect(page.locator("[data-mode-payment]")).toContainText("분할 상환");

  await page.locator("[data-mode='cash']").click();
  await expect(page.locator("[data-mode-payment]")).toContainText("월 금융 납부 없음");

  await page.locator("[data-factor='mileage']").click();
  await expect(page.locator("[data-gauge-label]")).toHaveText("연간 주행거리");
  await page.locator("[data-term='60']").click();
  await page.locator("[data-mileage='30000']").click();
  await expect(page.locator("[data-condition-message]")).toContainText("60개월 · 연 30,000 km");

  await page.locator("[data-money-mode='prepayment']").click();
  await expect(page.locator("[data-money-center]")).toHaveText("월 이용료에 반영");
  await expect(page.locator("[data-money-return]")).toBeHidden();

  await page.locator("[data-insurance-mode='lease']").click();
  await expect(page.locator("[data-insurance-title]")).toContainText("개인 별도");
  await expect(page.locator("[data-insurance-owner]")).toHaveText("이용자 개인 보험");

  await page.locator("[data-ending-choice='purchase']").click();
  await expect(page.locator("[data-ending-message]")).toContainText("잔존가치");
  expect(errors).toEqual([]);
});

test("searches, filters, FAQ, and safe-expression controls work", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.goto("/crew/knowledge/preview/");

  const termSearch = page.getByPlaceholder("예: 보증금, 잔존가치, 중도해지");
  await termSearch.fill("잔존가치");
  await expect(page.locator("[data-term-grid] .term-card")).toHaveCount(3);
  await expect(page.locator("[data-term-grid]")).toContainText("잔존가치");
  await page.locator("[data-clear-term-search]").click();
  await expect(termSearch).toHaveValue("");

  await page.locator("[data-customer-filter='business']").click();
  await expect(page.locator("[data-customer-grid]")).toContainText("개인사업자");
  await expect(page.locator("[data-customer-grid]")).toContainText("법인");

  await page.locator("[data-fact-filter='advertising']").click();
  await expect(page.locator("[data-fact-grid]")).toContainText("광고 월 납입금");
  await expect(page.locator("[data-fact-grid]")).toContainText("무조건 승인 광고");

  const badPhrase = await page.locator("[data-phrase-text]").innerText();
  await page.locator("[data-phrase-toggle]").click();
  const safePhrase = await page.locator("[data-phrase-text]").innerText();
  expect(safePhrase).not.toBe(badPhrase);
  await expect(page.locator("[data-phrase-state]")).toHaveText("이렇게 바꿔주세요");

  await page.locator("[data-faq-list] details").first().locator("summary").click();
  await expect(page.locator("[data-faq-list] details").first()).toHaveAttribute("open", "");

  await page.getByRole("button", { name: "가이드 검색", exact: true }).click();
  await page.getByPlaceholder("예: 중도해지, 보험, 사업자").fill("중도해지");
  await expect(page.locator("[data-search-results]")).toContainText("만기·중도해지");
  await page.locator("[data-search-kind='section'][data-search-id='ending']").click();
  await expect(page.locator("#searchDialog")).not.toHaveAttribute("open", "");
  expect(errors).toEqual([]);
});

test("deep information opens in focused dialogs", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.goto("/crew/knowledge/preview/");

  await page.getByRole("button", { name: "장기렌트 전체 보기", exact: true }).click();
  await expect(page.locator("#detailDialog")).toHaveAttribute("open", "");
  await expect(page.locator("[data-dialog-title]")).toHaveText("장기렌트 완전 이해");
  await expect(page.locator("#detailDialog .detail-section")).toHaveCount(5);
  await page.getByRole("button", { name: "상세 정보 닫기", exact: true }).click();

  await page.getByRole("button", { name: "표로 자세히 보기", exact: true }).click();
  await expect(page.locator("#compareDialog")).toHaveAttribute("open", "");
  await expect(page.locator(".compare-table tbody tr")).toHaveCount(14);
  await page.getByRole("button", { name: "비교표 닫기", exact: true }).click();

  await page.locator("[data-toggle-all-terms]").click();
  await expect(page.locator("[data-dialog-title]")).toHaveText("전체 핵심 용어");
  await expect(page.locator("#detailDialog .library-list button")).toHaveCount(24);
  await page.getByRole("button", { name: "상세 정보 닫기", exact: true }).click();

  await page.locator("[data-open-all-sources]").click();
  await expect(page.locator("#detailDialog .library-list a")).toHaveCount(15);
  await page.getByRole("button", { name: "상세 정보 닫기", exact: true }).click();

  await page.locator("[data-open-all-faq]").click();
  await expect(page.locator("#detailDialog .drawer-faq-list details")).toHaveCount(15);
  expect(errors).toEqual([]);
});

test("images and internal links resolve without broken resources", async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await page.goto("/crew/knowledge/preview/");

  const imageState = await page.locator("img").evaluateAll((images) =>
    images.map((image) => ({
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      source: image.currentSrc || image.src,
    })),
  );
  expect(imageState.every((image) => image.complete && image.naturalWidth > 0)).toBeTruthy();

  const internalLinks = await page.locator("a[href]").evaluateAll((anchors) =>
    [...new Set(
      anchors
        .map((anchor) => anchor.getAttribute("href"))
        .filter((href) => href && href.startsWith("/") && !href.startsWith("//")),
    )],
  );
  for (const href of internalLinks) {
    const response = await request.get(href);
    expect(response.status(), href).toBeLessThan(400);
  }

  await expect(page.getByText("내 추천 코드")).toHaveCount(0);
  await expect(page.getByText("내 상담 링크")).toHaveCount(0);
  expect(errors).toEqual([]);
});
