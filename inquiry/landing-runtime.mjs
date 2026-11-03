import { requestJson, referralCode, safeImage } from "./catalog.mjs?v=20261023";
import { LANDING_DEFAULTS, createSubmissionController, isLocalPreview, landingEntryFromSearch, loadLandingData, withLandingEntry, withReferral } from "./landing-contract.mjs?v=20261103o";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const won = value => typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("ko-KR") : "-";
const svg = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const I = {
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  bolt: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  heart: svg('<path d="M12 21s-7.5-4.6-9.5-9.4C1.2 8.5 3 5 6.5 5c2 0 3.5 1.2 5.5 3.2C14 6.2 15.5 5 17.5 5 21 5 22.8 8.5 21.5 11.6 19.5 16.4 12 21 12 21Z"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  chevR: svg('<path d="m9 18 6-6-6-6"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  chevL: svg('<path d="m15 18-6-6 6-6"/>'),
};

// Display information is copied from the selected static landing, not inferred.
const site = {
  name: "RE:CAR", nameKo: "리카", company: "리카오토플랜", ceo: "조용철", bizNo: "325-60-00844",
  address: "경기도 부천시 원미구 신흥로 40, 709호(심곡동, 디오스빌)",
  bizType: "정보통신업, 도매 및 소매업", bizItem: "응용 소프트웨어 개발 및 공급업, 전자상거래 소매업",
  tel: "010-6573-1038", email: "jhxox666@gmail.com", hours: "평일 09:00 ~ 18:00", kakao: "https://open.kakao.com/o/s7SanMki",
};
const brandRows = [
  ["Hyundai", "hyundai", "현대", "HYUNDAI", "brand-hyundai.svg", true, ["현대"]],
  ["Kia", "kia", "기아", "KIA", "brand-kia.svg", true, ["기아"]],
  ["Genesis", "genesis", "제네시스", "GENESIS", "brand-genesis.svg", true, ["제네시스"]],
  ["르노", "renault", "르노", "RENAULT", "brand-renault.svg", true, ["르노코리아", "Renault"]],
  ["KGM", "kgm", "KGM", "KGM", "brand-kgm.svg", true, []],
  ["쉐보레", "chevrolet", "쉐보레", "CHEVROLET", "brand-chevrolet.svg", true, ["Chevrolet"]],
  ["Mercedes-Benz", "benz", "벤츠", "BENZ", "brand-mercedes-benz.svg", false, ["벤츠"]],
  ["BMW", "bmw", "BMW", "BMW", "brand-bmw.svg", false, []],
  ["Audi", "audi", "아우디", "AUDI", "brand-audi.svg", false, ["아우디"]],
  ["Tesla", "tesla", "테슬라", "TESLA", "brand-tesla.svg", false, ["테슬라"]],
  ["Volvo", "volvo", "볼보", "VOLVO", "brand-volvo.svg", false, ["볼보"]],
  ["Lexus", "lexus", "렉서스", "LEXUS", "brand-lexus.svg", false, []],
  ["Porsche", "porsche", "포르쉐", "PORSCHE", "brand-porsche.svg", false, []],
];
const brands = brandRows.map(([api, id, name, en, logo, domestic, alias]) => ({ api, id, name, en, logo, domestic, alias }));
const brandOf = value => brands.find(row => row.api === value || row.name === value || row.id === value || row.alias.includes(value))
  || { api: value, name: value, en: String(value || "").toUpperCase(), logo: null, domestic: false };
window.RECAR = {
  site, defaults: LANDING_DEFAULTS, brands,
  api: { base: "https://api.recarplan.com/api/v1", inquiry: { sendFromLocal: false } },
  trust: {
    loanBrokerNo: "",
    antiFraud: "리카는 계약금 · 보증금 · 선납금 · 차량대금 등 어떤 명목으로도 상담사 개인 계좌나 제3자 계좌로 입금을 요청하지 않습니다. 모든 입금은 금융사 · 렌트사의 공식 계좌로만 진행되며, 개인 계좌 입금 요청을 받으셨다면 진행을 멈추고 고객센터로 확인해 주세요.",
  },
};
let storage;
try { storage = window.localStorage; } catch { /* Referrals remain usable from the URL. */ }
const code = referralCode(location.search, storage);
const entry = landingEntryFromSearch(location.search);
// Undefined preserves the entry selection; an empty override explicitly clears it.
let productOverride;
const currentProduct = () => productOverride === undefined ? entry.productType : productOverride;
const submitter = createSubmissionController({ request: requestJson, isPreview: isLocalPreview(location) || !["recarplan.com", "www.recarplan.com"].includes(location.hostname) });
const privacyText = '<ul><li>수집 항목: 이름, 연락처, 선택 차량·트림·색상·이용조건, 추천코드(해당 시)</li><li>목적: 차량 견적 상담, 조건 안내 및 문의 응대</li><li>보유 기간: 기존 홈페이지 상담 정책에 따라 상담 종료 후 3개월까지 보관 후 파기</li><li>동의를 거부할 수 있으나 상담 접수는 제한됩니다.</li></ul>';
const noticeText = '<p>희망 조건과 실제 가능 조건은 다를 수 있습니다. 차량 재고, 금융사 심사, 보험 조건과 계약 시점에 따라 확정되며 실제 계약은 별도 계약서가 우선합니다. 문의 접수는 계약 체결이나 신용조회 동의가 아닙니다.</p>';

function consentHTML(compact = false) {
  return `<div class="consent${compact ? " consent--compact" : ""}"><label class="chk chk--all"><input type="checkbox" data-agree-all><span>아래 필수 항목 모두 동의</span></label><label class="chk"><input type="checkbox" name="agree" required data-agree><span>[필수] 개인정보 수집·이용 동의</span><a href="#privacy-collect" data-open-privacy="collect">보기</a></label><label class="chk"><input type="checkbox" name="agree3" required data-agree><span>[필수] 상담 유의사항 확인</span><a href="#inquiry-notice" data-open-privacy="notice">보기</a></label>${code ? '<p class="referral-disclosure">이 페이지는 리카 크루의 추천 링크입니다. 계약이 성사되면 추천인에게 수수료가 지급될 수 있습니다.</p>' : ""}</div>`;
}
function phoneMask(root) {
  $$('input[name="phone"]', root).forEach(input => {
    if (input.dataset.landingPhoneMask) return;
    input.dataset.landingPhoneMask = "true";
    input.addEventListener("input", () => {
      const digits = input.value.replace(/\D/g, "").slice(0, 11);
      input.value = digits.length < 4 ? digits : digits.length < 8 ? digits.replace(/(\d{3})(\d+)/, "$1-$2")
        : digits.replace(/(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
    });
  });
}
function errorFor(form, message) {
  let error = $(".lp-err, .form-err", form);
  if (!error) { error = document.createElement("p"); error.className = "form-err"; form.append(error); }
  error.setAttribute("role", "alert"); error.textContent = message;
}
let lockedControls = [];
function lockForms() {
  lockedControls = $$('form button, form input, form select, form textarea').map(element => [element, element.disabled]);
  lockedControls.forEach(([element]) => { element.disabled = true; });
  $$('form').forEach(form => form.setAttribute("aria-busy", "true"));
}
function unlockForms() {
  lockedControls.forEach(([element, disabled]) => { if (element.isConnected) element.disabled = disabled; });
  lockedControls = [];
  $$('form').forEach(form => form.removeAttribute("aria-busy"));
}
async function submitInquiry(form, payload) {
  if (submitter.state !== "idle") {
    errorFor(form, submitter.state === "pending" ? "접수 확인 중입니다. 잠시 기다려 주세요." : submitter.state === "succeeded" ? "이미 접수가 완료됐습니다. 추가 접수 없이 안내를 기다려 주세요." : "접수 결과를 확인하지 못했습니다. 중복 접수를 막기 위해 이 화면에서는 다시 전송하지 않습니다. 고객센터로 확인해 주세요.");
    return false;
  }
  const contact = { name: form.elements.name?.value, phone: form.elements.phone?.value, agreed: form.elements.agree?.checked === true, notice: form.elements.agree3?.checked === true };
  const button = $('button[type="submit"]', form), label = button?.innerHTML;
  lockForms();
  if (button) button.textContent = "접수 확인 중";
  try {
    const requested = { ...payload, ...(form.dataset.landingProductType === "LEASE" ? { product_type: "LEASE", condition_summary: `리스 전문 상담 · ${payload.condition_summary || "랜딩 상담"}` } : {}) };
    const receipt = await submitter.submit(contact, withLandingEntry(requested, entry, { quiz: form.id === "tPhone", ...(productOverride !== undefined ? { productOverride } : {}) }), code);
    if (receipt.preview) unlockForms();
    else { $$('form').forEach(item => item.removeAttribute("aria-busy")); }
    return receipt;
  } catch (error) {
    const invalid = ["CONTACT_INVALID", "INQUIRY_INVALID"].includes(error?.message);
    const knownRejected = submitter.state === "idle";
    errorFor(form, invalid ? "이름·연락처와 두 필수 동의 항목을 확인해 주세요." : knownRejected ? "접수가 거절됐습니다. 입력 내용을 확인한 뒤 다시 신청해 주세요." : "접수 완료 응답을 확인하지 못했습니다. 자동 재전송하지 않습니다. 중복 접수를 막기 위해 다시 신청하지 말고 고객센터로 확인해 주세요.");
    if (knownRejected) unlockForms();
    else $$('form').forEach(item => item.removeAttribute("aria-busy"));
    return false;
  } finally { if (button?.isConnected) button.innerHTML = label; }
}

function syncProductSelections() {
  for (const form of $$("#lpFunnel, #tName, #tPhone")) {
    const product = currentProduct();
    if (product) form.dataset.landingProductType = product;
    else delete form.dataset.landingProductType;
    let badge = $("[data-current-product]", form);
    if (!badge) {
      badge = document.createElement("div");
      badge.id = form.id === "lpFunnel" ? "landingProductSelection" : `${form.id}ProductSelection`;
      badge.className = "lp-product-selection"; badge.dataset.currentProduct = ""; badge.setAttribute("role", "status");
      Object.assign(badge.style, { margin: "12px 0", padding: "12px 14px", border: "1px solid #dbe4f2", background: "#f3f6ff", color: "#18356a", borderRadius: "12px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" });
      const progress = $(".lp-prog", form), content = $(".lp-ask", form);
      if (progress) progress.after(badge); else if (content) content.prepend(badge); else form.prepend(badge);
    }
    if (badge.dataset.product === product) continue;
    badge.dataset.product = product;
    badge.innerHTML = `<span style="font-size:14px">상담 방식</span><strong tabindex="-1" style="font-size:15px">${product === "LEASE" ? "리스 전문 상담" : product === "RENTAL" ? "장기렌트 상담" : "미정"}</strong>${product ? '<button type="button" class="lp-link" data-reset-product style="margin:0 0 0 auto;font-size:14px">상담 방식 미정으로 바꾸기</button>' : ""}`;
  }
}

let modalFocus = null;
function closePrivacy() {
  const modal = $(".modal[data-landing-privacy]");
  if (!modal) return;
  modal.remove();
  if (!$("#lpTest:not([hidden])")) document.documentElement.classList.remove("is-locked");
  modalFocus?.focus?.({ preventScroll: true });
}
function openPrivacy(type) {
  closePrivacy(); modalFocus = document.activeElement;
  const modal = document.createElement("div");
  modal.className = "modal is-open"; modal.dataset.landingPrivacy = "true";
  const title = type === "lease" ? "리스는 전문 상담으로 안내해 드려요" : type === "notice" ? "상담 유의사항" : "개인정보 수집·이용 동의";
  const content = type === "lease" ? '<p>리스는 금융상품으로, 전문 상담사가 고객님의 상황과 금융사 조건을 확인한 뒤 안내해 드려요.</p><p>화면에 리스 금액을 표시하지 않으며, 문의를 남기시면 상담으로 도와드려요. 문의 접수만으로 계약이나 신용조회가 진행되지는 않아요.</p><button type="button" class="lp-t-main" data-lease-ask>리스 상담 문의하기</button>' : type === "notice" ? noticeText : privacyText;
  modal.innerHTML = `<div class="modal__dim" data-close></div><div class="modal__box" role="dialog" aria-modal="true" aria-label="${title}" tabindex="-1"><button type="button" class="modal__x" data-close aria-label="닫기">${I.close}</button><h2>${title}</h2>${content}</div>`;
  document.body.append(modal); document.documentElement.classList.add("is-locked");
  $(".modal__x", modal).focus({ preventScroll: true });
  modal.addEventListener("click", event => { if (event.target.closest("[data-close]")) closePrivacy(); });
}
document.addEventListener("click", event => {
  const link = event.target.closest?.("[data-open-privacy]");
  if (link) { event.preventDefault(); openPrivacy(link.dataset.openPrivacy); return; }
  if (event.target.closest?.("[data-lease-consult]")) { event.preventDefault(); openPrivacy("lease"); return; }
  if (event.target.closest?.("[data-reset-product]")) {
    event.preventDefault();
    const form = event.target.closest("form");
    productOverride = ""; syncProductSelections();
    $("[data-current-product] strong", form || document)?.focus({ preventScroll: true });
    return;
  }
  if (event.target.closest?.("[data-lease-ask]")) {
    event.preventDefault(); closePrivacy();
    const quiz = $("#lpTest:not([hidden])");
    if (quiz) $(".lp-test__x", quiz)?.click();
    const form = $("#lpFunnel");
    if (form && !form.hidden) {
      productOverride = "LEASE"; syncProductSelections();
      $("#lpFocusForm")?.click();
    }
  }
});
function trapFocus(container, event) {
  if (event.key !== "Tab") return;
  const focusable = $$('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]', container)
    .filter(element => element.getClientRects().length && !element.closest("[hidden],[inert]"));
  if (!focusable.length) { event.preventDefault(); container.focus({ preventScroll: true }); return; }
  if (!container.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? focusable.at(-1) : focusable[0]).focus(); }
  else if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
}
document.addEventListener("keydown", event => {
  const privacy = $(".modal[data-landing-privacy]");
  if (privacy) {
    if (event.key === "Escape") { event.preventDefault(); closePrivacy(); }
    else trapFocus(privacy, event);
    return;
  }
  // Another modal owns focus while visible; the test never steals it back.
  if ($(".modal")) return;
  const quiz = $("#lpTest:not([hidden])");
  if (quiz) trapFocus(quiz, event);
});

function prepareLinks(root) {
  const anchors = root.matches?.("a[href]") ? [root, ...$$('a[href]', root)] : $$('a[href]', root);
  anchors.forEach(anchor => {
    const before = anchor.getAttribute("href"), after = withReferral(before, location.search, storage, location.href);
    if (after !== before) anchor.setAttribute("href", after);
  });
}
window.addEventListener("error", event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || image.dataset.landingFailed) return;
  image.dataset.landingFailed = "true";
  // A missing product image stays visibly missing; no synthetic car is inserted.
  image.hidden = true;
  const label = document.createElement("span"); label.className = "image-empty"; label.textContent = "사진 준비 중";
  image.after(label);
}, true);
window.RC = {
  $, $$, esc, won, I, brandOf,
  carName: vehicle => `${brandOf(vehicle.brand).name} ${vehicle.model_name}`,
  carImg: vehicle => safeImage(vehicle?.image_url || vehicle?.thumbnail_url),
  errorHTML: message => `<p class="empty" role="status">${esc(message)}</p>`,
  reduceMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  telHref: `tel:${site.tel.replace(/\D/g, "")}`, phoneMask, prefill() {}, consentHTML, submitInquiry,
};
const data = loadLandingData();
// The landing attaches its own failure presentation after the module resolves.
data.catch(() => {});
window.RC_HOME = { data, stockOf: () => 0 };
prepareLinks(document); phoneMask(document);
new MutationObserver(records => {
  for (const record of records) {
    if (record.type === "attributes") { prepareLinks(record.target); continue; }
    record.addedNodes.forEach(node => { if (node instanceof Element) { prepareLinks(node); phoneMask(node); } });
  }
  syncProductSelections();
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });

// The original selected layout runs only after its small compatibility surface exists.
await import("/inquiry/landing-assets/js/landing.js?v=20261103o");
syncProductSelections();

// Restore only a verified-shape vehicle label from the existing home entry.
// Moving to the name step never submits, agrees, fetches a quote or restores PII.
if (entry.vehicleName) {
  const input = $("#lpCarInput"), next = $("#lpNext");
  if (input && next) {
    input.value = entry.vehicleName;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (!next.disabled) next.click();
  }
}
