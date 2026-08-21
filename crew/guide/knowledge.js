import {
  REVIEW_DATE,
  contentFacts,
  customerProfiles,
  faqs,
  modes,
  paymentFactors,
  phrasePairs,
  recarFacts,
  sections,
  sources,
  terms,
} from "./knowledge-data.js";

const categoryLabels = {
  advertising: "광고 이해",
  business: "사업자",
  compare: "비교",
  crew: "크루 부업",
  economy: "경제·재테크",
  end: "계약 종료",
  insurance: "보험",
  lease: "리스",
  quote: "견적",
  recar: "RE:CAR",
  rent: "장기렌트",
};

const customerGroups = {
  personal: new Set(["first", "high-insurance", "accident", "import"]),
  business: new Set(["sole", "corporate"]),
  driving: new Set(["long-distance", "short-distance", "easy-care"]),
  ownership: new Set(["frequent-change", "long-owner", "purchase-end", "low-upfront", "normal-plate"]),
};

const productDetails = {
  rent: {
    kicker: "장기렌트",
    title: "장기렌트는 어떤 방식인가요?",
    lead: "렌터카 회사의 차량을 일정 기간 빌려 타고 월 대여료를 내는 방식입니다.",
    structure: [
      "차량 소유자와 명의는 렌터카 회사입니다.",
      "보험과 자동차세가 대여료에 반영되는 구조가 일반적입니다.",
      "대여사업용 번호판을 사용합니다.",
    ],
    comfort: [
      "보험·세금 관리를 한 번에 정리하기 편할 수 있습니다.",
      "개인 보험료가 높은 고객은 비교 가치가 커질 수 있습니다.",
      "보증금·선납금·무보증 등으로 초기비용을 조절할 수 있습니다.",
    ],
    caution: [
      "운전자 범위와 사고 시 면책금 기준을 확인합니다.",
      "약정 주행거리와 초과주행 정산 기준을 확인합니다.",
      "중도해지금과 반납 시 감가·원상복구 기준을 확인합니다.",
      "개인 보험경력 인정 여부는 상품과 보험사 기준을 확인합니다.",
    ],
    customer: "보험료와 차량 관리 편의를 함께 보고 싶은 고객이 먼저 비교할 수 있습니다.",
    ending: "반납·인수·연장 가능 여부와 인수 가격 산정 기준은 계약 전에 확인합니다.",
    safe: "보험과 세금이 포함되는 일반적인 구조라 차량 관리가 간편할 수 있습니다.",
    unsafe: "장기렌트는 보험료도 없고 사고가 나도 돈이 들지 않습니다.",
    sourceIds: ["rentalLaw", "rentalTerms", "kbRental", "lotteInsurance", "kbReturn"],
  },
  lease: {
    kicker: "자동차 리스",
    title: "자동차 리스는 어떤 방식인가요?",
    lead: "금융회사가 구입한 차량을 정해진 기간 이용하고 월 리스료를 내는 방식입니다.",
    structure: [
      "차량 소유자는 리스사이며 등록 명의는 상품 구조를 확인합니다.",
      "일반 번호판을 사용하는 구조가 일반적입니다.",
      "자동차보험은 이용자가 별도로 가입하는 구조가 많습니다.",
    ],
    comfort: [
      "일반 번호판과 개인 보험을 유지하려는 고객이 비교하기 좋습니다.",
      "차량 구입 자금을 한 번에 지출하지 않고 이용할 수 있습니다.",
      "운용리스는 만기 반납·인수 선택이 가능한 상품이 있습니다.",
    ],
    caution: [
      "금융리스와 운용리스의 구조가 다릅니다.",
      "잔존가치와 만기 인수금액을 함께 확인합니다.",
      "개인 보험료와 월 리스료를 합친 실제 부담을 봅니다.",
      "중도해지·반납·초과주행 정산 기준을 확인합니다.",
    ],
    customer: "일반 번호판과 개인 보험경력을 중요하게 보는 고객이 먼저 비교할 수 있습니다.",
    ending: "운용리스의 반납·인수 조건과 금융리스의 상환 구조는 상품별 약관이 우선합니다.",
    safe: "리스료와 개인 보험료, 만기 인수금액을 함께 비교하세요.",
    unsafe: "리스는 무조건 내 차가 되고 비용처리도 전액 가능합니다.",
    sourceIds: ["leaseLaw", "leaseGuide", "leaseTerms", "kbLease", "kbReturn"],
  },
};

const endingMessages = {
  return: "반납: 초과주행·사고·파손·원상복구 기준을 확인합니다.",
  purchase: "인수: 계약이 끝날 때 차를 가져오는 데 필요한 전체 금액을 확인합니다.",
  extend: "연장: 더 이용할 수 있는 상품인지, 기간과 새 월 금액을 확인합니다.",
  replace: "차량 교체: 기존 계약 정산과 새 계약 조건을 각각 확인합니다.",
};

const economyDetails = {
  cashflow: {
    start: "초기 납입금",
    monthly: "고정 지출",
    ending: "만기 정산",
    caption: "먼저 내는 돈, 매월 나가는 돈, 계약이 끝날 때 드는 돈을 한 흐름으로 봅니다.",
  },
  total: {
    start: "보증금·선납금",
    monthly: "납입·보험·정비",
    ending: "인수·반납 비용",
    caption: "표시 월 금액이 아니라 계약기간 동안 실제로 빠져나가는 비용을 같은 조건으로 더해 봅니다.",
  },
  opportunity: {
    start: "차량에 묶이는 돈",
    monthly: "다른 목적과 균형",
    ending: "남는 자금 여력",
    caption: "차량에 쓴 돈으로 포기하는 저축·투자·사업운영·비상자금의 가치와 위험을 함께 봅니다.",
  },
};

const insuranceDetails = {
  rent: {
    title: "계약 포함 구조가 일반적",
    owner: "렌터카사 보험",
    driver: "등록된 운전자",
    accident: "면책금·약관 확인",
    points: ["운전자 연령·범위", "사고 면책금", "보험경력 인정 여부"],
  },
  lease: {
    title: "개인 별도 가입 구조가 많음",
    owner: "이용자 개인 보험",
    driver: "보험 증권상 운전자",
    accident: "보험사 보상 기준",
    points: ["개인 보험료 별도", "보험경력 유지 가능", "담보·자기부담금 확인"],
  },
};

const state = {
  customerFilter: "all",
  customerPage: 0,
  factFilter: "featured",
  phraseIndex: 0,
  phraseSafe: false,
  termQuery: "",
};

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function refreshIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons({
      attrs: {
        "aria-hidden": "true",
        "stroke-width": 1.8,
      },
    });
  }
}

function sourceChips(sourceIds = []) {
  const uniqueIds = [...new Set(sourceIds)].filter((id) => sources[id]);
  if (!uniqueIds.length) return "";

  return `
    <div class="source-chips" aria-label="관련 공식 자료">
      ${uniqueIds
        .map(
          (id) => `
            <a href="${escapeHtml(sources[id].url)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(sources[id].organization)}
            </a>
          `,
        )
        .join("")}
    </div>
  `;
}

function listHtml(items) {
  return `<ul class="detail-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function openDetail({ kicker, title, body }) {
  const dialog = qs("#detailDialog");
  qs("[data-dialog-kicker]", dialog).textContent = kicker;
  qs("[data-dialog-title]", dialog).textContent = title;
  qs("[data-dialog-body]", dialog).innerHTML = body;
  if (!dialog.open) dialog.showModal();
  refreshIcons();
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function factDetail(fact, kicker = "항목별 설명") {
  const factSources = sourceChips(fact.sourceIds);
  openDetail({
    kicker,
    title: fact.title,
    body: `
      <div class="detail-hero">
        <strong>${escapeHtml(fact.summary)}</strong>
        <p>${escapeHtml(fact.body)}</p>
      </div>
      <section class="detail-section">
        <h3>함께 확인할 조건</h3>
        <div class="detail-pair">
          <div><span>흔한 오해</span><p>${escapeHtml(fact.misconception)}</p></div>
          <div><span>같이 볼 내용</span><p>${escapeHtml(fact.condition)}</p></div>
        </div>
      </section>
      <section class="detail-section">
        <h3>사실과 오해</h3>
        <div class="expression-box safe"><span>사실</span><p>${escapeHtml(fact.safe)}</p></div>
        <div class="expression-box unsafe"><span>오해</span><p>${escapeHtml(fact.unsafe)}</p></div>
      </section>
      <section class="detail-section">
        <h3>근거 확인</h3>
        <p>${
          factSources
            ? "일반적인 구조를 설명한 자료입니다. 실제 계약서와 상품별 약관이 우선합니다."
            : "RE:CAR의 현재 운영 화면과 최신 운영정책을 기준으로 확인합니다."
        }</p>
        ${factSources}
      </section>
    `,
  });
}

function termDetail(term) {
  openDetail({
    kicker: "용어",
    title: term.name,
    body: `
      <div class="detail-hero">
        <strong>${escapeHtml(term.simple)}</strong>
        <p>${escapeHtml(term.detail)}</p>
      </div>
      <section class="detail-section">
        <h3>헷갈리지 않기</h3>
        <p>${escapeHtml(term.confused)}</p>
      </section>
      <section class="detail-section">
        <h3>한 줄로 이해하기</h3>
        <div class="expression-box safe"><span>쉬운 설명</span><p>${escapeHtml(term.safe)}</p></div>
      </section>
      <section class="detail-section">
        <h3>근거 확인</h3>
        ${sourceChips(term.sourceIds)}
      </section>
    `,
  });
}

function customerDetail(profile) {
  openDetail({
    kicker: "상황별로 보기",
    title: profile.label,
    body: `
      <div class="detail-hero">
        <strong>${escapeHtml(profile.start)}</strong>
        <p>${escapeHtml(profile.why)}</p>
      </div>
      <section class="detail-section">
        <h3>먼저 확인할 조건</h3>
        ${listHtml([profile.check, "보험료·심사 결과·실제 견적은 고객별로 달라질 수 있습니다.", "이 출발점은 확정 추천이 아닙니다."])}
      </section>
      <section class="detail-section">
        <h3>사실과 오해</h3>
        <div class="expression-box safe">
          <span>사실</span>
          <p>${escapeHtml(profile.label)}이라면 ${escapeHtml(profile.start)} 조건부터 비교해볼 수 있습니다.</p>
        </div>
        <div class="expression-box unsafe">
          <span>오해</span>
          <p>${escapeHtml(profile.label)}에게는 이 상품이 무조건 가장 저렴합니다.</p>
        </div>
      </section>
    `,
  });
}

function openProductDetail(type) {
  const product = productDetails[type];
  openDetail({
    kicker: product.kicker,
    title: product.title,
    body: `
      <div class="detail-hero">
        <strong>${escapeHtml(product.lead)}</strong>
        <p>일반적인 설명이며 회사와 상품에 따라 실제 조건은 달라질 수 있습니다.</p>
      </div>
      <section class="detail-section"><h3>기본 구조</h3>${listHtml(product.structure)}</section>
      <section class="detail-section">
        <h3>편한 점과 확인할 점</h3>
        <div class="detail-pair">
          <div><span>장점</span>${listHtml(product.comfort)}</div>
          <div><span>확인할 내용</span>${listHtml(product.caution)}</div>
        </div>
      </section>
      <section class="detail-section">
        <h3>고객과 계약 종료</h3>
        <div class="detail-pair">
          <div><span>비교 출발점</span><p>${escapeHtml(product.customer)}</p></div>
          <div><span>만기 확인</span><p>${escapeHtml(product.ending)}</p></div>
        </div>
      </section>
      <section class="detail-section">
        <h3>사실과 오해</h3>
        <div class="expression-box safe"><span>사실</span><p>${escapeHtml(product.safe)}</p></div>
        <div class="expression-box unsafe"><span>오해</span><p>${escapeHtml(product.unsafe)}</p></div>
      </section>
      <section class="detail-section"><h3>공식 근거</h3>${sourceChips(product.sourceIds)}</section>
    `,
  });
}

function openRecarDetail() {
  openDetail({
    kicker: "RE:CAR",
    title: "RE:CAR는 무엇을 하나요?",
    body: `
      <div class="detail-hero">
        <strong>월 납입금 하나가 아니라 그 숫자를 만든 조건을 비교합니다.</strong>
        <p>차량·기간·주행거리·처음 내는 돈을 같은 조건으로 맞춘 뒤 여러 회사의 견적을 확인합니다.</p>
      </div>
      <section class="detail-section">
        <h3>기존 방식과 다른 점</h3>
        <div class="detail-pair">
          <div>
            <span>기존 방식</span>
            <p>영업 과정의 추가 비용과 서로 다른 조건이 견적에 함께 들어갈 수 있습니다.</p>
          </div>
          <div>
            <span>RE:CAR 방식</span>
            <p>영업사원별 임의 추가 수수료 없이 같은 RE:CAR 기준으로 여러 회사의 조건을 비교합니다.</p>
          </div>
        </div>
      </section>
      <section class="detail-section">
        <h3>진행 순서</h3>
        ${listHtml(["원하는 차량과 이용 조건 정리", "금융회사 심사와 결과 확인", "계약부터 차량 출고까지 진행상태 확인", "앱과 전화상담을 통한 안내"])}
      </section>
      <section class="detail-section">
        <h3>가격 비교</h3>
        <div class="expression-box safe">
          <span>사실</span>
          <p>RE:CAR는 같은 기준으로 여러 회사의 조건을 비교합니다.</p>
        </div>
        <div class="expression-box unsafe">
          <span>오해</span>
          <p>모든 수수료 0원, 마진 0원, 전국 무조건 최저가.</p>
        </div>
      </section>
      <section class="detail-section">
        <h3>운영 기준</h3>
        <p>홈페이지의 참고 금액과 실제 계약 금액은 다를 수 있습니다. 최종 조건은 상담 후 받은 공식 견적과 계약서를 기준으로 확인합니다.</p>
        ${sourceChips(["financeAd", "adLaw"])}
      </section>
    `,
  });
}

function openMoneyDetail() {
  openDetail({
    kicker: "처음 내는 돈",
    title: "보증금과 선납금은 무엇이 다른가요?",
    body: `
      <div class="detail-hero">
        <strong>둘 다 월 납입금을 낮출 수 있지만 돈의 쓰임은 다릅니다.</strong>
        <p>처음 내는 돈, 매달 내는 돈, 계약이 끝날 때 돌려받거나 추가로 내는 돈을 함께 봅니다.</p>
      </div>
      <section class="detail-section">
        <h3>세 가지 돈의 흐름</h3>
        <div class="detail-pair">
          <div><span>보증금</span><p>계약 이행을 담보하고 종료 시 미납금·정산비용 등을 제외한 뒤 반환되는 구조가 일반적입니다.</p></div>
          <div><span>선납금</span><p>앞으로 낼 이용료 일부를 먼저 내 월 납입금에 나누어 반영하는 구조입니다.</p></div>
        </div>
        <div class="detail-pair">
          <div><span>잔존가치</span><p>만기 시점의 예상 차량가치로 월 납입금과 인수금액에 함께 영향을 줄 수 있습니다.</p></div>
          <div><span>무보증</span><p>보증금이 없다는 뜻이며 선납금·보증보험·심사 조건까지 모두 없다는 뜻은 아닙니다.</p></div>
        </div>
      </section>
      <section class="detail-section">
        <h3>함께 확인할 내용</h3>
        ${listHtml(["초기 납입금의 이름과 비율", "반환 여부와 반환 시 공제 조건", "월 납입금과 총 납입액", "만기 인수금액과 취득 관련 비용"])}
        ${sourceChips(["leaseTerms", "rentalTerms", "leaseGlossary"])}
      </section>
    `,
  });
}

function openInsuranceDetail() {
  openDetail({
    kicker: "보험과 사고",
    title: "보험과 사고 처리",
    body: `
      <div class="detail-hero">
        <strong>누가 보험에 가입하고, 사고 때 누가 얼마를 부담하는지 확인합니다.</strong>
        <p>장기렌트와 리스는 보험에 가입하는 사람이 다를 수 있습니다.</p>
      </div>
      <section class="detail-section">
        <h3>장기렌트</h3>
        ${listHtml(["렌터카 회사의 보험이 월 대여료에 포함되는 경우가 많습니다.", "보험이 인정하는 운전자와 나이 범위를 확인합니다.", "사고 때 고객이 내는 금액과 추가 비용을 확인합니다."])}
      </section>
      <section class="detail-section">
        <h3>리스</h3>
        ${listHtml(["이용자가 개인 자동차보험에 따로 가입하는 경우가 많습니다.", "개인 보험경력을 이어갈 수 있는지 보험사에 확인합니다.", "월 리스료와 별도 보험료를 합쳐 비교합니다."])}
      </section>
      <section class="detail-section">
        <h3>사실과 오해</h3>
        <div class="expression-box safe"><span>사실</span><p>운전자 범위와 사고 면책금은 상품 약관에서 확인하세요.</p></div>
        <div class="expression-box unsafe"><span>오해</span><p>보험이 포함돼서 사고가 나도 비용이 전혀 없습니다.</p></div>
        ${sourceChips(["autoInsuranceLaw", "lotteInsurance", "kbRental", "kbLease"])}
      </section>
    `,
  });
}

function openEndingDetail() {
  openDetail({
    kicker: "계약 종료",
    title: "계약이 끝날 때 무엇을 하나요?",
    body: `
      <div class="detail-hero">
        <strong>반납할지 인수할지는 계약 시작 전에 조건을 확인합니다.</strong>
        <p>계약기간을 다 채우고 끝내는 것과 중간에 그만두는 것은 비용 계산이 다릅니다.</p>
      </div>
      <section class="detail-section">
        <h3>만기 전 확인</h3>
        ${listHtml(["반납·인수·연장 선택 가능 여부", "잔존가치와 만기 인수금액", "약정 주행거리와 초과주행 정산", "사고·파손·튜닝과 가치감가 기준"])}
      </section>
      <section class="detail-section">
        <h3>중도 종료</h3>
        ${listHtml(["중도해지금 산식과 적용 기간", "승계 가능 여부와 수수료", "미납금·과태료·정산비용", "차량 회수와 원상복구 기준"])}
      </section>
      <section class="detail-section">
        <h3>사실과 오해</h3>
        <div class="expression-box safe"><span>사실</span><p>만기 선택과 중도해지 비용은 계약서의 산식과 조건을 확인하세요.</p></div>
        <div class="expression-box unsafe"><span>오해</span><p>마음이 바뀌면 언제든 비용 없이 반납할 수 있습니다.</p></div>
        ${sourceChips(["rentalTerms", "leaseTerms", "kbReturn", "leaseGuide"])}
      </section>
    `,
  });
}

function openEconomyDetail() {
  openDetail({
    kicker: "전체 비용",
    title: "차량에 실제로 드는 돈은 얼마인가요?",
    body: `
      <div class="detail-hero">
        <strong>월 납입금만 보지 않고 계약 처음부터 끝까지 드는 돈을 봅니다.</strong>
        <p>처음 내는 돈, 매달 내는 돈, 보험·세금·정비와 계약 종료 비용을 함께 더해 봅니다.</p>
      </div>
      <section class="detail-section">
        <h3>세 가지 관점</h3>
        <div class="detail-pair">
          <div><span>돈이 나가는 순서</span><p>처음 내는 돈과 매달 내는 돈을 내 소득과 비상자금으로 감당할 수 있는지 봅니다.</p></div>
          <div><span>계약 전체 비용</span><p>처음 내는 돈, 월 납입, 보험·세금·정비, 인수·반납 비용과 돌려받는 돈을 구분해 봅니다.</p></div>
        </div>
        <div class="detail-pair">
          <div><span>남겨 둘 자금</span><p>차량에 쓰지 않은 돈을 저축·투자·사업운영·빚 상환 등에 사용할 수도 있습니다.</p></div>
          <div><span>나중의 차값</span><p>차량의 미래 가치는 시간·주행거리·사고·시장 상황에 따라 달라집니다.</p></div>
        </div>
      </section>
      <section class="detail-section">
        <h3>비용 계산</h3>
        <div class="detail-formula">
          <span>계약 전체 비용</span>
          <strong>처음 내는 돈 + 매달 내는 돈 + 유지·종료 비용 - 돌려받는 돈</strong>
        </div>
        <p>비교 기간과 주행거리, 보험·정비 범위, 만기 선택을 같게 맞춘 뒤 계산합니다. 세금 효과나 투자수익은 개인 상황과 위험이 달라 별도로 검토합니다.</p>
      </section>
      <section class="detail-section">
        <h3>사실과 오해</h3>
        <div class="expression-box safe"><span>사실</span><p>초기자금·월 지출·만기 비용과 자금의 다른 사용 기회를 함께 비교하세요.</p></div>
        <div class="expression-box unsafe"><span>오해</span><p>렌트·리스가 현금 구매보다 무조건 재테크에 유리하고 투자수익도 보장됩니다.</p></div>
      </section>
      <section class="detail-section">
        <h3>공식 근거</h3>
        ${sourceChips(["bokTerms", "leaseTerms", "rentalTerms", "leaseGuide", "kbReturn"])}
      </section>
    `,
  });
}

function openCrewWorkDetail() {
  openDetail({
    kicker: "크루 활동",
    title: "RE:CAR 크루는 무슨 일을 하나요?",
    body: `
      <div class="detail-hero">
        <strong>크루는 차량 정보를 알리고 관심 있는 사람을 공식 문의로 연결합니다.</strong>
        <p>이후 상담·심사·계약·차량 인도는 RE:CAR 운영팀이 진행합니다.</p>
      </div>
      <section class="detail-section">
        <h3>활동 흐름</h3>
        ${listHtml([
          "블로그·릴스·쇼츠 등 익숙한 채널에서 차량 정보를 알립니다.",
          "관심 고객을 개인정보를 직접 받지 않는 공식 문의 절차로 연결합니다.",
          "RE:CAR 운영팀이 상담·견적·심사·계약·인도 과정을 확인합니다.",
          "유효한 차량 인도 실적은 최신 운영정책에 따라 정산 여부를 확인합니다.",
        ])}
      </section>
      <section class="detail-section">
        <h3>활동 특징과 정산 조건</h3>
        <div class="detail-pair">
          <div>
            <span>활동 특징</span>
            ${listHtml(["정해진 출퇴근 없이 본업과 병행 가능", "차량 정보 콘텐츠 제작 경험", "상담·심사·계약 실무는 운영팀이 진행"])}
          </div>
          <div>
            <span>정산 조건</span>
            ${listHtml(["고정 급여·최소 수익을 보장하지 않음", "문의나 클릭만으로 정산이 확정되지 않음", "취소·인도 결과·운영정책에 따라 실적이 달라짐"])}
          </div>
        </div>
      </section>
      <section class="detail-section">
        <h3>정산 기준</h3>
        <p>정산은 계약 시점이 아니라 차량 인도 완료를 기준으로 익월에 진행됩니다. 전산 반영에는 시간이 걸릴 수 있으며, 대상·금액·지급 시점은 최신 운영정책과 실제 대시보드에서 확인합니다.</p>
        <p>실제 정산 금액은 대상 기간, 산정 조건, 취소 여부와 세전·세후 기준에 따라 달라질 수 있습니다. 이 안내서는 특정 금액을 수익으로 보장하지 않습니다.</p>
      </section>
      <section class="detail-section">
        <h3>세금과 광고 표시</h3>
        ${listHtml([
          "활동의 지속성과 형태에 따라 사업소득 또는 기타소득 등으로 구분될 수 있습니다.",
          "지급 자료와 활동 관련 증빙을 보관하고 본인 상황은 국세청 또는 세무전문가에게 확인합니다.",
          "활동에 따른 수익이나 혜택이 있는 홍보물에는 경제적 이해관계 표시가 필요할 수 있습니다.",
        ])}
      </section>
      <section class="detail-section">
        <h3>사실과 오해</h3>
        <div class="expression-box safe"><span>사실</span><p>본업과 병행할 수 있는 콘텐츠 활동이며 수익은 유효 실적과 최신 운영정책에 따라 달라집니다.</p></div>
        <div class="expression-box unsafe"><span>오해</span><p>가입만 하면 누구나 매달 고정수익, 문의만 연결해도 즉시 지급됩니다.</p></div>
      </section>
      <section class="detail-section">
        <h3>확인 자료</h3>
        ${sourceChips(["ntsCreator", "endorsementAd", "sideJobSafety", "adLaw"])}
      </section>
    `,
  });
}

function openRewardDetail() {
  openDetail({
    kicker: "크루 보상",
    title: "계약별 보상과 100대 혜택",
    body: `
      <div class="detail-hero">
        <strong>계약별 보상은 차량가 구간과 실제 계약 조건을 함께 반영해 확인합니다.</strong>
        <p>누적 계약 100대 달성 시에는 Tesla Model Y 1년 이용을 지원합니다.</p>
      </div>
      <section class="detail-section">
        <h3>계약별 보상 산정 요소</h3>
        <div class="detail-formula">
          <span>계약별 보상</span>
          <strong>차량가 구간 + 상품·기간 + 금융사 조건 + 계약 결과</strong>
        </div>
        ${listHtml([
          "차종과 트림의 계약 기준가가 속한 차량가 구간을 확인합니다.",
          "장기렌트·리스 상품, 이용기간과 계약 시점의 금융사 조건을 함께 반영합니다.",
          "취소 여부와 계약 결과를 확인한 뒤 최신 운영 기준에 따라 보상을 확정합니다.",
        ])}
      </section>
      <section class="detail-section">
        <h3>누적 100대 계약 마일스톤</h3>
        <div class="detail-pair">
          <div>
            <span>달성 기준</span>
            <p>누적 계약 100대</p>
          </div>
          <div>
            <span>달성 혜택</span>
            <p>Tesla Model Y 1년 이용 지원</p>
          </div>
        </div>
        <p>차량 사양, 보험, 주행거리, 이용 시작일과 그 밖의 세부 조건은 혜택 제공 시 RE:CAR 운영팀이 안내합니다.</p>
      </section>
      <section class="detail-section">
        <h3>확인할 내용</h3>
        ${listHtml([
          "화면의 산정 요소는 보상 구조를 이해하기 위한 안내입니다.",
          "실제 계약별 금액과 지급 시점은 최신 운영 기준에서 확인합니다.",
          "100대 혜택의 세부 이용 조건은 마일스톤 달성 확인 후 안내됩니다.",
        ])}
      </section>
    `,
  });
}

function openPriceChecklist() {
  openDetail({
    kicker: "월 납입금",
    title: "월 납입금을 볼 때 8가지 조건",
    body: `
      <div class="detail-hero">
        <strong>숫자는 조건과 함께 보여줄 때 정확해집니다.</strong>
        <p>월 납입금만 강조하면 실제 부담을 오해하게 만들 수 있습니다.</p>
      </div>
      <section class="detail-section">
        <h3>함께 확인할 조건</h3>
        ${listHtml([
          "차량·트림·옵션",
          "계약 기간과 연간 약정 주행거리",
          "보증금·선납금·보증보험 등 초기 조건",
          "보험과 정비 포함 범위",
          "잔존가치와 만기 인수금액",
          "심사와 프로모션 적용 조건",
          "부가세 포함 여부와 견적 기준일",
          "중도해지·초과주행·반납 정산 기준",
        ])}
      </section>
      <section class="detail-section">
        <h3>예시로 구분하기</h3>
        <div class="expression-box safe"><span>조건이 보이는 예시</span><p>48개월·연 2만 km·보증금 20% 기준 예시이며 실제 견적은 심사와 시점에 따라 달라질 수 있습니다.</p></div>
        <div class="expression-box unsafe"><span>조건이 빠진 예시</span><p>누구나 이 가격, 무조건 승인, 전국 최저가.</p></div>
        ${sourceChips(["financeAd", "adLaw"])}
      </section>
    `,
  });
}

function renderFactorList() {
  const container = qs("[data-factor-list]");
  container.innerHTML = paymentFactors
    .map(
      (factor, index) => `
        <button class="factor-button${index === 0 ? " is-active" : ""}" type="button" data-factor="${escapeHtml(factor.id)}" aria-pressed="${index === 0}">
          <i data-lucide="${escapeHtml(factor.icon)}" aria-hidden="true"></i>
          <span>${escapeHtml(factor.label)}</span>
        </button>
      `,
    )
    .join("");
}

function selectFactor(id) {
  const factor = paymentFactors.find((item) => item.id === id);
  if (!factor) return;

  qsa("[data-factor]").forEach((button) => {
    const active = button.dataset.factor === id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  qs("[data-gauge-ring]").style.setProperty("--impact", factor.impact);
  qs("[data-gauge-label]").textContent = factor.label;
  qs("[data-gauge-note]").textContent = factor.note;
  qs("[data-gauge-icon]").setAttribute("data-lucide", factor.icon);
  refreshIcons();
}

function updateConditions() {
  const term = qs("[data-term-choices] .is-active")?.dataset.term ?? "48";
  const mileage = qs("[data-mileage-choices] .is-active")?.dataset.mileage ?? "20000";
  const mileageLabel = Number(mileage).toLocaleString("ko-KR");
  qs("[data-quote-term]").textContent = `${term}개월`;
  qs("[data-quote-mileage]").textContent =
    Number(mileage) % 10000 === 0 ? `${Number(mileage) / 10000}만 km` : `${mileageLabel} km`;
  qs("[data-condition-message]").textContent =
    `${term}개월 · 연 ${mileageLabel} km는 월 부담뿐 아니라 실제 이용기간과 초과주행 위험을 함께 확인해야 합니다.`;
}

function updateMode(modeId) {
  const mode = modes[modeId];
  if (!mode) return;

  qsa("[data-mode]").forEach((tab) => {
    const active = tab.dataset.mode === modeId;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  const panel = qs("#modePanel");
  panel.style.setProperty("--mode-color", mode.color);
  panel.setAttribute("aria-labelledby", `modeTab${modeId[0].toUpperCase()}${modeId.slice(1)}`);
  qs("[data-mode-owner]").textContent = mode.owner;
  qs("[data-mode-plate]").textContent = mode.plate;
  qs("[data-mode-insurance]").textContent = mode.insurance;
  qs("[data-mode-payment]").textContent = mode.payment;
  qs("[data-mode-label]").textContent = mode.label;
  qs("[data-mode-short]").textContent = mode.short;
  qs("[data-mode-end]").textContent = `만기: ${mode.end}`;
}

function updateRecarMode(mode) {
  const isRecar = mode === "recar";
  qsa("[data-recar-mode]").forEach((button) => {
    const active = button.dataset.recarMode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  qsa("[data-route-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.routePanel !== mode;
  });
  qs("[data-recar-caption]").textContent = isRecar
    ? "고객 조건을 RE:CAR가 바로 정리해 제휴 금융사·렌터카사의 견적을 같은 기준으로 비교합니다."
    : "고객 문의가 여러 유통업체와 판매 단계를 거쳐 금융사에 전달되면, 정보 전달과 중간 비용 구조가 복잡해질 수 있습니다.";
}

function updateMoneyMode(mode) {
  const deposit = mode === "deposit";
  qsa("[data-money-mode]").forEach((button) => {
    const active = button.dataset.moneyMode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  qs("[data-money-out]").textContent = deposit ? "계약 때 맡김" : "이용료를 미리 냄";
  qs("[data-money-center]").textContent = deposit ? "계약 이행 담보" : "월 이용료에 반영";
  qs("[data-money-icon]").setAttribute("data-lucide", deposit ? "shield-check" : "wallet-cards");
  qs("[data-money-return]").hidden = !deposit;
  qs("[data-money-caption]").textContent = deposit
    ? "미납금·정산비용 등을 제외한 뒤 돌려받는 구조가 일반적입니다."
    : "앞으로 낼 이용료 일부이므로 보증금처럼 그대로 반환되는 돈이 아닙니다.";
  refreshIcons();
}

function updateInsurance(mode) {
  const data = insuranceDetails[mode];
  qsa("[data-insurance-mode]").forEach((button) => {
    const active = button.dataset.insuranceMode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  qs("[data-insurance-title]").textContent = data.title;
  qs("[data-insurance-owner]").textContent = data.owner;
  qs("[data-insurance-driver]").textContent = data.driver;
  qs("[data-insurance-accident]").textContent = data.accident;
  qs("[data-insurance-points]").innerHTML = data.points
    .map((point) => `<li><i data-lucide="check" aria-hidden="true"></i>${escapeHtml(point)}</li>`)
    .join("");
  refreshIcons();
}

function updateEconomyMode(mode) {
  const detail = economyDetails[mode];
  if (!detail) return;

  qsa("[data-economy-mode]").forEach((button) => {
    const active = button.dataset.economyMode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  qs("[data-economy-start]").textContent = detail.start;
  qs("[data-economy-monthly]").textContent = detail.monthly;
  qs("[data-economy-ending]").textContent = detail.ending;
  qs("[data-economy-caption]").textContent = detail.caption;
}

function matchingTerms() {
  const query = state.termQuery.trim().toLowerCase();
  if (!query) return terms;
  return terms.filter((term) =>
    [term.name, term.simple, term.detail, term.confused, term.safe].join(" ").toLowerCase().includes(query),
  );
}

function renderTerms() {
  const matches = matchingTerms();
  const visible = matches.slice(0, 3);
  const grid = qs("[data-term-grid]");
  grid.innerHTML = visible.length
    ? visible
        .map(
          (term) => `
            <button class="term-card" type="button" data-term-id="${escapeHtml(term.id)}">
              <span class="card-icon"><i data-lucide="book-open-text" aria-hidden="true"></i></span>
              <span>
                <strong>${escapeHtml(term.name)}</strong>
                <p>${escapeHtml(term.simple)}</p>
              </span>
              <span class="card-link">자세히 <i data-lucide="arrow-up-right" aria-hidden="true"></i></span>
            </button>
          `,
        )
        .join("")
    : `<p class="empty-state">찾는 용어가 없습니다. 다른 단어로 검색해보세요.</p>`;

  const button = qs("[data-toggle-all-terms]");
  const count = qs("[data-term-count]");
  count.textContent = `${matches.length}개`;
  button.hidden = matches.length === 0;
  button.setAttribute("aria-expanded", "false");
  button.childNodes[0].textContent = state.termQuery ? "검색 결과 전체 보기 " : "전체 용어 보기 ";
  qs("[data-clear-term-search]").hidden = !state.termQuery;
  refreshIcons();
}

function openTermLibrary() {
  const matches = matchingTerms();
  openDetail({
    kicker: "용어",
    title: state.termQuery ? `"${state.termQuery}" 용어 검색` : "전체 핵심 용어",
    body: `
      <div class="detail-hero">
        <strong>${matches.length}개 용어</strong>
        <p>용어마다 한 줄 뜻과 상세 설명이 있습니다.</p>
      </div>
      <div class="library-list">
        ${matches
          .map(
            (term) => `
              <button type="button" data-library-kind="term" data-library-id="${escapeHtml(term.id)}">
                <span><strong>${escapeHtml(term.name)}</strong><small>${escapeHtml(term.simple)}</small></span>
                <i data-lucide="chevron-right" aria-hidden="true"></i>
              </button>
            `,
          )
          .join("")}
      </div>
    `,
  });
}

function filteredCustomers() {
  if (state.customerFilter === "all") return customerProfiles;
  const ids = customerGroups[state.customerFilter] ?? new Set();
  return customerProfiles.filter((profile) => ids.has(profile.id));
}

function renderCustomers() {
  const matches = filteredCustomers();
  const pageCount = Math.max(1, Math.ceil(matches.length / 3));
  state.customerPage = Math.min(state.customerPage, pageCount - 1);
  const visible = matches.slice(state.customerPage * 3, state.customerPage * 3 + 3);
  qs("[data-customer-grid]").innerHTML = visible
    .map(
      (profile) => `
        <button class="customer-card" type="button" data-customer-id="${escapeHtml(profile.id)}">
          <span class="card-icon"><i data-lucide="${escapeHtml(profile.icon)}" aria-hidden="true"></i></span>
          <span>
            <span class="customer-start">${escapeHtml(profile.start)}</span>
            <strong>${escapeHtml(profile.label)}</strong>
            <p>${escapeHtml(profile.why)}</p>
          </span>
          <span class="card-link">조건 보기 <i data-lucide="arrow-up-right" aria-hidden="true"></i></span>
        </button>
      `,
    )
    .join("");

  const showArrows = pageCount > 1;
  const previous = qs("[data-customer-prev]");
  const next = qs("[data-customer-next]");
  previous.classList.toggle("is-visible", showArrows);
  next.classList.toggle("is-visible", showArrows);
  previous.disabled = state.customerPage === 0;
  next.disabled = state.customerPage >= pageCount - 1;
  previous.setAttribute("aria-label", `이전 고객 유형, ${state.customerPage + 1}/${pageCount}쪽`);
  next.setAttribute("aria-label", `다음 고객 유형, ${state.customerPage + 1}/${pageCount}쪽`);
  refreshIcons();
}

function filteredFacts() {
  const allFacts = [...recarFacts, ...contentFacts];
  if (state.factFilter === "featured") {
    return [
      recarFacts.find((fact) => fact.id === "recar-reason"),
      contentFacts.find((fact) => fact.id === "rent-lease"),
      contentFacts.find((fact) => fact.id === "monthly"),
    ].filter(Boolean);
  }
  return allFacts.filter((fact) => fact.category === state.factFilter);
}

function renderFacts() {
  const matches = filteredFacts();
  const visible = matches.slice(0, 3);
  qs("[data-fact-grid]").innerHTML = visible
    .map(
      (fact) => `
        <button class="fact-card" type="button" data-fact-id="${escapeHtml(fact.id)}">
          <span class="card-icon"><i data-lucide="${escapeHtml(fact.icon)}" aria-hidden="true"></i></span>
          <span>
            <span class="fact-category">${escapeHtml(categoryLabels[fact.category] ?? fact.category)}</span>
            <strong>${escapeHtml(fact.title)}</strong>
            <p>${escapeHtml(fact.summary)}</p>
          </span>
          <span class="card-link">내용 보기 <i data-lucide="arrow-up-right" aria-hidden="true"></i></span>
        </button>
      `,
    )
    .join("");

  qs("[data-fact-count]").textContent = `${matches.length}개`;
  qs("[data-toggle-all-facts]").hidden = matches.length <= 3;
  refreshIcons();
}

function openFactLibrary() {
  const matches = filteredFacts();
  const label =
    state.factFilter === "featured" ? "핵심" : categoryLabels[state.factFilter] ?? state.factFilter;
  openDetail({
    kicker: "항목별 더 알아보기",
    title: `${label} 설명 ${matches.length}개`,
    body: `
      <div class="detail-hero">
        <strong>사실과 조건을 함께 확인합니다.</strong>
        <p>카드를 열면 쉬운 설명과 흔한 오해, 공식 근거까지 볼 수 있습니다.</p>
      </div>
      <div class="library-list">
        ${matches
          .map(
            (fact) => `
              <button type="button" data-library-kind="fact" data-library-id="${escapeHtml(fact.id)}">
                <span><strong>${escapeHtml(fact.title)}</strong><small>${escapeHtml(fact.summary)}</small></span>
                <i data-lucide="chevron-right" aria-hidden="true"></i>
              </button>
            `,
          )
          .join("")}
      </div>
    `,
  });
}

function renderPhrase() {
  const pair = phrasePairs[state.phraseIndex];
  qs("[data-phrase-index]").textContent = state.phraseIndex + 1;
  qs("[data-phrase-total]").textContent = phrasePairs.length;
  qs("[data-phrase-text]").textContent = state.phraseSafe ? pair.good : pair.bad;
  qs("[data-phrase-state]").textContent = state.phraseSafe ? "사실" : "오해";
  qs("[data-phrase-state]").className = `phrase-state ${state.phraseSafe ? "safe" : "bad"}`;
  qs("[data-phrase-card]").classList.toggle("is-safe", state.phraseSafe);
  qs("[data-phrase-card]").setAttribute("aria-pressed", String(state.phraseSafe));
  qs("[data-phrase-toggle]").textContent = state.phraseSafe ? "오해 보기" : "사실 보기";
}

function renderSources() {
  qs("[data-review-date]").textContent = REVIEW_DATE;
  const sourceEntries = Object.entries(sources);
  qs("[data-source-list]").innerHTML = sourceEntries
    .slice(0, 3)
    .map(
      ([, source]) => `
        <a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
          <span><i data-lucide="external-link" aria-hidden="true"></i></span>
          <strong>${escapeHtml(source.name)}</strong>
          <small>${escapeHtml(source.organization)}</small>
        </a>
      `,
    )
    .join("");
  qs("[data-source-count]").textContent = `${sourceEntries.length}개`;
}

function renderFaqs() {
  qs("[data-faq-list]").innerHTML = faqs
    .slice(0, 3)
    .map(
      (faq) => `
        <details>
          <summary>${escapeHtml(faq.question)}</summary>
          <p>${escapeHtml(faq.answer)}</p>
        </details>
      `,
    )
    .join("");
}

function openSourceLibrary() {
  openDetail({
    kicker: "확인 자료",
    title: `공식 자료 ${Object.keys(sources).length}개`,
    body: `
      <div class="detail-hero">
        <strong>정확한 내용은 공식 자료에서 다시 확인할 수 있습니다.</strong>
        <p>마지막 검토일 ${escapeHtml(REVIEW_DATE)} · 상품별 실제 약관과 계약서가 우선합니다.</p>
      </div>
      <div class="library-list">
        ${Object.values(sources)
          .map(
            (source) => `
              <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
                <span><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.organization)}</small></span>
                <i data-lucide="external-link" aria-hidden="true"></i>
              </a>
            `,
          )
          .join("")}
      </div>
    `,
  });
}

function openFaqLibrary() {
  openDetail({
    kicker: "FAQ",
    title: `자주 확인하는 질문 ${faqs.length}개`,
    body: `
      <div class="detail-hero">
        <strong>질문별 답변을 정리했습니다.</strong>
        <p>개별 상품의 최종 답은 실제 견적서·상품설명서·계약서가 우선합니다.</p>
      </div>
      <div class="faq-list drawer-faq-list">
        ${faqs
          .map(
            (faq) => `
              <details>
                <summary>${escapeHtml(faq.question)}</summary>
                <p>${escapeHtml(faq.answer)}</p>
              </details>
            `,
          )
          .join("")}
      </div>
    `,
  });
}

function renderCompareTable() {
  const rows = [
    ["한 줄 정의", ...Object.values(modes).map((mode) => mode.short)],
    ["차량 소유자", ...Object.values(modes).map((mode) => mode.owner)],
    ["등록 명의", ...Object.values(modes).map((mode) => mode.registration)],
    ["번호판", ...Object.values(modes).map((mode) => mode.plate)],
    ["보험", ...Object.values(modes).map((mode) => mode.insurance)],
    ["자동차세", ...Object.values(modes).map((mode) => mode.tax)],
    ["초기비용", ...Object.values(modes).map((mode) => mode.initial)],
    ["납입 구조", ...Object.values(modes).map((mode) => mode.payment)],
    ["계약 기간", ...Object.values(modes).map((mode) => mode.term)],
    ["주행거리", ...Object.values(modes).map((mode) => mode.mileage)],
    ["만기 선택", ...Object.values(modes).map((mode) => mode.end)],
    ["중도 종료", ...Object.values(modes).map((mode) => mode.earlyTermination)],
    ["차량 처분", ...Object.values(modes).map((mode) => mode.disposal)],
    ["비교 출발점", ...Object.values(modes).map((mode) => mode.fit)],
  ];
  qs("[data-compare-table]").innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th scope="col">비교 기준</th>
          ${Object.values(modes).map((mode) => `<th scope="col">${escapeHtml(mode.label)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                ${row
                  .map((cell, index) =>
                    index === 0
                      ? `<th scope="row">${escapeHtml(cell)}</th>`
                      : `<td>${escapeHtml(cell)}</td>`,
                  )
                  .join("")}
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function searchIndex(query) {
  const normalized = query.trim().toLowerCase();
  const allFacts = [...recarFacts, ...contentFacts];

  if (!normalized) {
    return sections.slice(0, 6).map((section) => ({
      id: section.id,
      kind: "section",
      label: section.label,
      description: "섹션으로 이동",
    }));
  }

  const sectionMatches = sections
    .filter((section) => `${section.label} ${section.keywords}`.toLowerCase().includes(normalized))
    .map((section) => ({
      id: section.id,
      kind: "section",
      label: section.label,
      description: "섹션으로 이동",
    }));
  const termMatches = terms
    .filter((term) => `${term.name} ${term.simple} ${term.detail}`.toLowerCase().includes(normalized))
    .map((term) => ({
      id: term.id,
      kind: "term",
      label: term.name,
      description: term.simple,
    }));
  const factMatches = allFacts
    .filter((fact) => `${fact.title} ${fact.summary} ${fact.body}`.toLowerCase().includes(normalized))
    .map((fact) => ({
      id: fact.id,
      kind: "fact",
      label: fact.title,
      description: fact.summary,
    }));

  return [...sectionMatches, ...termMatches, ...factMatches].slice(0, 15);
}

function renderSearchResults(query = "") {
  const matches = searchIndex(query);
  qs("[data-search-results]").innerHTML = matches.length
    ? matches
        .map(
          (item) => `
            <button class="search-result" type="button" data-search-kind="${escapeHtml(item.kind)}" data-search-id="${escapeHtml(item.id)}">
              <span>
                <strong>${escapeHtml(item.label)}</strong>
                <span>${escapeHtml(item.description)}</span>
              </span>
              <i data-lucide="${item.kind === "section" ? "arrow-down" : "arrow-up-right"}" aria-hidden="true"></i>
            </button>
          `,
        )
        .join("")
    : `<p class="empty-state">일치하는 내용이 없습니다.</p>`;
  refreshIcons();
}

function openSearch() {
  const dialog = qs("#searchDialog");
  renderSearchResults("");
  if (!dialog.open) dialog.showModal();
  const input = qs("[data-global-search]");
  input.value = "";
  requestAnimationFrame(() => input.focus());
}

function followSearchResult(kind, id) {
  closeDialog(qs("#searchDialog"));
  if (kind === "section") {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (kind === "term") {
    const term = terms.find((item) => item.id === id);
    if (term) termDetail(term);
    return;
  }
  const fact = [...recarFacts, ...contentFacts].find((item) => item.id === id);
  if (fact) factDetail(fact, fact.category === "recar" ? "RE:CAR FACT" : "FACT CARD");
}

function renderMobileMenu() {
  qs("[data-mobile-menu-links]").innerHTML = sections
    .map(
      (section, index) => `
        <a href="#${escapeHtml(section.id)}">
          <span><small>${String(index + 1).padStart(2, "0")}</small>${escapeHtml(section.label)}</span>
          <i data-lucide="chevron-right" aria-hidden="true"></i>
        </a>
      `,
    )
    .join("");
}

function setMobileMenu(open) {
  const menu = qs("#mobileMenu");
  const button = qs("[data-mobile-menu-button]");
  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  button.innerHTML = `<i data-lucide="${open ? "x" : "menu"}" aria-hidden="true"></i>`;
  document.body.classList.toggle("has-menu", open);
  refreshIcons();
  if (open) qs("[data-close-mobile-menu]")?.focus();
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, a");
    if (!target) return;

    if (target.matches("[data-open-search]")) openSearch();
    if (target.matches("[data-close-search]")) closeDialog(qs("#searchDialog"));
    if (target.matches("[data-mobile-menu-button]")) {
      setMobileMenu(qs("#mobileMenu").hidden);
    }
    if (target.matches("[data-close-mobile-menu]")) setMobileMenu(false);
    if (target.closest("[data-mobile-menu-links]")) setMobileMenu(false);
    if (target.matches("[data-close-dialog]")) closeDialog(qs("#detailDialog"));
    if (target.matches("[data-close-compare]")) closeDialog(qs("#compareDialog"));
    if (target.matches("[data-open-compare-table]")) qs("#compareDialog").showModal();
    if (target.matches("[data-open-recar-detail]")) openRecarDetail();
    if (target.matches("[data-open-product]")) openProductDetail(target.dataset.openProduct);
    if (target.matches("[data-open-money-detail]")) openMoneyDetail();
    if (target.matches("[data-open-insurance-detail]")) openInsuranceDetail();
    if (target.matches("[data-open-ending-detail]")) openEndingDetail();
    if (target.matches("[data-open-economy-detail]")) openEconomyDetail();
    if (target.matches("[data-open-crew-work-detail]")) openCrewWorkDetail();
    if (target.matches("[data-open-reward-detail]")) openRewardDetail();
    if (target.matches("[data-open-price-checklist]")) openPriceChecklist();
    if (target.matches("[data-open-all-sources]")) openSourceLibrary();
    if (target.matches("[data-open-all-faq]")) openFaqLibrary();

    if (target.matches("[data-recar-mode]")) updateRecarMode(target.dataset.recarMode);
    if (target.matches("[data-mode]")) updateMode(target.dataset.mode);
    if (target.matches("[data-factor]")) selectFactor(target.dataset.factor);
    if (target.matches("[data-money-mode]")) updateMoneyMode(target.dataset.moneyMode);
    if (target.matches("[data-insurance-mode]")) updateInsurance(target.dataset.insuranceMode);
    if (target.matches("[data-economy-mode]")) updateEconomyMode(target.dataset.economyMode);
    if (target.matches("[data-ending-choice]")) {
      qsa("[data-ending-choice]").forEach((button) => button.classList.toggle("is-active", button === target));
      qs("[data-ending-message]").textContent = endingMessages[target.dataset.endingChoice];
    }

    if (target.closest("[data-term-choices]") && target.matches("[data-term]")) {
      qsa("[data-term-choices] button").forEach((button) => button.classList.toggle("is-active", button === target));
      updateConditions();
    }
    if (target.closest("[data-mileage-choices]") && target.matches("[data-mileage]")) {
      qsa("[data-mileage-choices] button").forEach((button) => button.classList.toggle("is-active", button === target));
      updateConditions();
    }

    if (target.matches("[data-term-id]")) {
      const term = terms.find((item) => item.id === target.dataset.termId);
      if (term) termDetail(term);
    }
    if (target.matches("[data-toggle-all-terms]")) openTermLibrary();
    if (target.matches("[data-clear-term-search]")) {
      const input = qs("[data-term-search]");
      input.value = "";
      state.termQuery = "";
      renderTerms();
      input.focus();
    }

    if (target.matches("[data-customer-filter]")) {
      state.customerFilter = target.dataset.customerFilter;
      state.customerPage = 0;
      qsa("[data-customer-filter]").forEach((button) => {
        const active = button === target;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      renderCustomers();
    }
    if (target.matches("[data-customer-prev]") && state.customerPage > 0) {
      state.customerPage -= 1;
      renderCustomers();
    }
    if (target.matches("[data-customer-next]")) {
      const pageCount = Math.ceil(filteredCustomers().length / 3);
      if (state.customerPage < pageCount - 1) state.customerPage += 1;
      renderCustomers();
    }
    if (target.matches("[data-customer-id]")) {
      const profile = customerProfiles.find((item) => item.id === target.dataset.customerId);
      if (profile) customerDetail(profile);
    }

    if (target.matches("[data-fact-filter]")) {
      state.factFilter = target.dataset.factFilter;
      qsa("[data-fact-filter]").forEach((button) => {
        const active = button === target;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      renderFacts();
    }
    if (target.matches("[data-fact-id]")) {
      const fact = [...recarFacts, ...contentFacts].find((item) => item.id === target.dataset.factId);
      if (fact) factDetail(fact, fact.category === "recar" ? "RE:CAR FACT" : "FACT CARD");
    }
    if (target.matches("[data-toggle-all-facts]")) openFactLibrary();

    if (target.matches("[data-phrase-card], [data-phrase-toggle]")) {
      state.phraseSafe = !state.phraseSafe;
      renderPhrase();
    }
    if (target.matches("[data-phrase-prev], [data-phrase-next]")) {
      const delta = target.matches("[data-phrase-prev]") ? -1 : 1;
      state.phraseIndex = (state.phraseIndex + delta + phrasePairs.length) % phrasePairs.length;
      state.phraseSafe = false;
      renderPhrase();
    }

    if (target.matches("[data-search-kind]")) {
      followSearchResult(target.dataset.searchKind, target.dataset.searchId);
    }

    if (target.matches("[data-library-kind]")) {
      const kind = target.dataset.libraryKind;
      const id = target.dataset.libraryId;
      if (kind === "term") {
        const term = terms.find((item) => item.id === id);
        if (term) termDetail(term);
      } else {
        const fact = [...recarFacts, ...contentFacts].find((item) => item.id === id);
        if (fact) factDetail(fact, fact.category === "recar" ? "RE:CAR FACT" : "FACT CARD");
      }
    }
  });

  qs("[data-term-search]").addEventListener("input", (event) => {
    state.termQuery = event.currentTarget.value;
    renderTerms();
  });

  qs("[data-global-search]").addEventListener("input", (event) => {
    renderSearchResults(event.currentTarget.value);
  });

  qsa("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });

  const heroImage = qs(".hero-media img");
  heroImage.addEventListener("error", () => {
    document.documentElement.classList.add("image-fallback");
  });

  const header = qs("[data-header]");
  const updateHeader = () => header.classList.toggle("is-solid", window.scrollY > 40);
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();
}

function initialize() {
  renderFactorList();
  renderTerms();
  renderCustomers();
  renderFacts();
  renderPhrase();
  renderSources();
  renderFaqs();
  renderCompareTable();
  renderMobileMenu();
  updateMode("rent");
  updateRecarMode("recar");
  updateMoneyMode("deposit");
  updateInsurance("rent");
  updateEconomyMode("cashflow");
  bindEvents();
  refreshIcons();
}

initialize();
