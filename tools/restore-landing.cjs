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
