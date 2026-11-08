const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let html = fs.readFileSync(path.join(root, "tests/fixtures/legacy-home.html"), "utf8");
html = html.replaceAll('="./', '="/');
html = html.replace('<dd>조용철</dd>', '<dd>조홍철</dd>');
html = html.replaceAll('content="https://recarplan.com/"', 'content="https://recarplan.com/landing/"')
  .replace('rel="canonical" href="https://recarplan.com/"', 'rel="canonical" href="https://recarplan.com/landing/"');
// The archived time-deal widget derived discounts locally; it is not a live offer feed.
html = html.replace(/\s*<section class="home-time-deals"[\s\S]*?<\/section>/, "");
html = html.replace(/<form class="quote-form"[\s\S]*?<\/form>/, `<div class="landing-inquiry-entry"><p>차량과 이용조건을 하나씩 골라보세요.<br>선택하신 내용 그대로 리카에 상담을 요청할 수 있습니다.</p><a class="home-button filled" href="/inquiry/" data-inquiry-entry>내 차 간편견적 시작하기 <span aria-hidden="true">→</span></a><p class="quote-assurance">상담 신청만으로 계약이나 신용조회가 진행되지 않습니다.</p></div>`);
html = html.replaceAll('href="/vehicles.html"', 'href="/inquiry/" data-inquiry-entry');
html = html.replace('    <script src="/crew/guide/lucide.min.js">', '    <script src="/landing/landing.js?v=20261022"></script>\n    <script src="/crew/guide/lucide.min.js">');
html = html.replace('<link rel="stylesheet" href="/home.css?v=20261015-app-entry" />', `<link rel="stylesheet" href="/home.css?v=20261022-landing" /><style>.landing-inquiry-entry{padding:28px 0}.landing-inquiry-entry>p{line-height:1.8;margin:0 0 24px}.landing-inquiry-entry .quote-assurance{margin-top:18px;font-size:13px;color:#626c7c}</style>`);
// Rental-only public copy; preserve the retained layout and image paths.
html = html.replaceAll("장기렌트·자동차리스 견적 비교", "장기렌트 견적 확인");
html = html.replaceAll("장기렌트·리스", "장기렌트");
html = html.replaceAll("<b>구매방식</b> 렌트·리스", "<b>구매방식</b> 장기렌트");
html = html.replaceAll("선납금 0% · 보증금 0%", "선납금 0% · 보증금 별도 확인");
html = html.replaceAll("<option value=\"all\">렌트·리스 전체</option><option value=\"rent\">장기렌트</option><option value=\"lease\">리스</option>", "<option value=\"all\">장기렌트 전체</option><option value=\"rent\">장기렌트</option>");
html = html.replaceAll("표시 금액은 상담 전 안내 가격입니다. 최종 견적과 출고 가능 여부는 재고 및 금융사 심사, 계약 조건에 따라 달라질 수 있습니다.", "금액은 선택 조건 근거가 확인된 예상 월납입니다. 보증금 원본 기재 여부와 최종 계약 조건은 별도 확인이 필요합니다.");
html = html.replaceAll("60개월 · 선납금 0% · 보증금 별도 확인 · 연 10,000km 기준 안내 가격", "장기렌트 · 60개월 · 선납금 0% · 연 10,000km. 보증금과 최종 계약 조건 별도 확인");
html = html.replaceAll("/landing/landing.js?v=20261022", "/landing/landing.js?v=20261108-rental-pricing");
html = html.replaceAll("/home.js?v=20261015-app-entry", "/home.js?v=20261108-rental-pricing");
html = html.replaceAll("/script.js?v=20260915-crew-referral-path", "/script.js?v=20261108-rental-pricing");
html = html.replaceAll("장기렌트·자동차리스 견적", "장기렌트 견적");
html = html.replaceAll("<a href=\"#compare\">렌트·리스</a>", "<a href=\"#compare\">이용 안내</a>");
html = html.replaceAll("<a href=\"#compare\">렌트·리스 비교</a>", "<a href=\"#compare\">이용 안내</a>");
html = html.replaceAll("<span>렌트·리스</span></a>", "<span>이용 안내</span></a>");
if (html.includes('src="./') || html.includes('href="./') || html.includes('class="quote-form"') || html.includes('id="timeDealGrid"')) {
  throw new Error("Review landing resource paths and inquiry separation before publishing");
}
const target = path.join(root, "landing/index.html");
if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8") !== html) throw new Error("Landing differs from retained source; run node tools/restore-landing.cjs");
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
}
