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
  await page.goto("/crew/guide/preview/");

  await page.getByRole("button", { name: "기존 5단계", exact: true }).click();
  await expect(page.locator("[data-route-panel='old']")).toBeVisible();
  await expect(page.locator("[data-route-panel='old'] .route-step")).toHaveCount(5);
  await expect(page.locator("[data-recar-caption]")).toContainText("유통업체, 영업사원, 대리점·딜러");

  await page.locator("[data-recar-mode='recar']").click();
  await expect(page.locator("[data-route-panel='old']")).toBeHidden();
  await expect(page.locator("[data-route-panel='recar']")).toBeVisible();
  await expect(page.locator("[data-route-panel='recar'] .route-step")).toHaveCount(3);
  await expect(page.locator("[data-recar-caption]")).toContainText("바로 정리");

  await page.locator("[data-mode='lease']").click();
  await expect(page.locator("[data-mode-owner]")).toHaveText("리스 회사(금융사)");
  await expect(page.locator("[data-mode-plate]")).toContainText("일반 번호판");
  await expect(page.locator("[data-mode-insurance]")).toContainText("개인 별도");

  await page.locator("[data-mode='installment']").click();
  await expect(page.locator("[data-mode-owner]")).toHaveText("고객");
  await expect(page.locator("[data-mode-payment]")).toContainText("분할 상환");

  await page.locator("[data-mode='cash']").click();
  await expect(page.locator("[data-mode-payment]")).toContainText("월 금융 납부 없음");

  await page.locator("[data-factor='mileage']").click();
  await expect(page.locator("[data-gauge-label]")).toHaveText("기간과 주행거리");
  await page.locator("[data-term='60']").click();
  await page.locator("[data-mileage='30000']").click();
  await expect(page.locator("[data-condition-message]")).toContainText("60개월 · 연 30,000 km");
  await expect(page.locator("[data-quote-term]")).toHaveText("60개월");
  await expect(page.locator("[data-quote-mileage]")).toHaveText("3만 km");

  await page.locator("[data-money-mode='prepayment']").click();
  await expect(page.locator("[data-money-center]")).toHaveText("월 이용료에 반영");
  await expect(page.locator("[data-money-return]")).toBeHidden();

  await page.locator("[data-insurance-mode='lease']").click();
  await expect(page.locator("[data-insurance-title]")).toContainText("개인 별도");
  await expect(page.locator("[data-insurance-owner]")).toHaveText("이용자 개인 보험");

  await page.locator("[data-ending-choice='purchase']").click();
  await expect(page.locator("[data-ending-message]")).toContainText("필요한 전체 금액");

  await page.locator("[data-economy-mode='total']").click();
  await expect(page.locator("[data-economy-start]")).toHaveText("보증금·선납금");
  await expect(page.locator("[data-economy-monthly]")).toHaveText("납입·보험·정비");
  await page.locator("[data-economy-mode='opportunity']").click();
  await expect(page.locator("[data-economy-caption]")).toContainText("저축·투자·사업운영");
  expect(errors).toEqual([]);
});

test("searches, filters, FAQ, and explanation controls work", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.goto("/crew/guide/preview/");

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

  await page.locator("[data-fact-filter='economy']").click();
  await expect(page.locator("[data-fact-grid]")).toContainText("총이용비용");
  await page.locator("[data-fact-filter='crew']").click();
  await expect(page.locator("[data-fact-grid]")).toContainText("본업과 병행하는 크루 활동");

  const badPhrase = await page.locator("[data-phrase-text]").innerText();
  await page.locator("[data-phrase-toggle]").click();
  const safePhrase = await page.locator("[data-phrase-text]").innerText();
  expect(safePhrase).not.toBe(badPhrase);
  await expect(page.locator("[data-phrase-state]")).toHaveText("사실");

  await page.locator("[data-faq-list] details").first().locator("summary").click();
  await expect(page.locator("[data-faq-list] details").first()).toHaveAttribute("open", "");

  await page.getByRole("button", { name: "가이드 검색", exact: true }).click();
  await page.getByPlaceholder("예: 중도해지, 재테크, 크루 부업").fill("중도해지");
  await expect(page.locator("[data-search-results]")).toContainText("만기·중도해지");
  await page.locator("[data-search-kind='section'][data-search-id='ending']").click();
  await expect(page.locator("#searchDialog")).not.toHaveAttribute("open", "");

  await page.getByRole("button", { name: "가이드 검색", exact: true }).click();
  await page.getByPlaceholder("예: 중도해지, 재테크, 크루 부업").fill("부업");
  await expect(page.locator("[data-search-results]")).toContainText("크루 부업 이해");
  await page.getByRole("button", { name: "검색 닫기", exact: true }).click();
  expect(errors).toEqual([]);
});

test("deep information opens in focused dialogs", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.goto("/crew/guide/preview/");

  await page.getByRole("button", { name: "장기렌트 상세", exact: true }).click();
  await expect(page.locator("#detailDialog")).toHaveAttribute("open", "");
  await expect(page.locator("[data-dialog-title]")).toHaveText("장기렌트는 어떤 방식인가요?");
  await expect(page.locator("#detailDialog .detail-section")).toHaveCount(5);
  await page.getByRole("button", { name: "상세 정보 닫기", exact: true }).click();

  await page.getByRole("button", { name: "비교표 보기", exact: true }).click();
  await expect(page.locator("#compareDialog")).toHaveAttribute("open", "");
  await expect(page.locator(".compare-table tbody tr")).toHaveCount(14);
  await page.getByRole("button", { name: "비교표 닫기", exact: true }).click();

  await page.getByRole("button", { name: "전체 비용 상세", exact: true }).click();
  await expect(page.locator("[data-dialog-title]")).toHaveText("차량에 실제로 드는 돈은 얼마인가요?");
  await expect(page.locator("#detailDialog")).toContainText("남겨 둘 자금");
  await page.getByRole("button", { name: "상세 정보 닫기", exact: true }).click();

  await page.getByRole("button", { name: "크루 활동 상세", exact: true }).click();
  await expect(page.locator("[data-dialog-title]")).toHaveText("RE:CAR 크루는 무슨 일을 하나요?");
  await expect(page.locator("#detailDialog")).toContainText("고정 급여·최소 수익을 보장하지 않음");
  await expect(page.locator("#detailDialog")).toContainText("경제적 이해관계");
  await page.getByRole("button", { name: "상세 정보 닫기", exact: true }).click();

  await page.getByRole("button", { name: "보상 기준 상세", exact: true }).click();
  await expect(page.locator("[data-dialog-title]")).toHaveText("계약별 보상과 100대 혜택");
  await expect(page.locator("#detailDialog")).toContainText("Tesla Model Y 1년 이용 지원");
  await page.getByRole("button", { name: "상세 정보 닫기", exact: true }).click();

  await page.locator("[data-toggle-all-terms]").click();
  await expect(page.locator("[data-dialog-title]")).toHaveText("전체 핵심 용어");
  await expect(page.locator("#detailDialog .library-list button")).toHaveCount(24);
  await page.getByRole("button", { name: "상세 정보 닫기", exact: true }).click();

  await page.locator("[data-open-all-sources]").click();
  await expect(page.locator("#detailDialog .library-list a")).toHaveCount(19);
  await page.getByRole("button", { name: "상세 정보 닫기", exact: true }).click();

  await page.locator("[data-open-all-faq]").click();
  await expect(page.locator("#detailDialog .drawer-faq-list details")).toHaveCount(23);
  expect(errors).toEqual([]);
});

test("images and internal links resolve without broken resources", async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await page.goto("/crew/guide/preview/");

  for (const image of await page.locator("img").all()) {
    await image.scrollIntoViewIfNeeded();
  }
  await expect
    .poll(async () =>
      page.locator("img").evaluateAll((images) =>
        images.every((image) => image.complete && image.naturalWidth > 0),
      ),
    )
    .toBeTruthy();

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
