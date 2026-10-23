import { STEPS, requestJson, loadCatalog, selectableTrims, colorsFor, safeImage, referralCode, validPhone, inquiryPayload } from "./catalog.mjs?v=20261023";

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const domestic = new Set(["현대", "기아", "제네시스", "KGM", "쉐보레", "르노", "Hyundai", "Kia", "Genesis", "Renault"]);
const brandNames = { Hyundai: "현대", Kia: "기아", Genesis: "제네시스", Renault: "르노", "르노코리아": "르노", "Mercedes-Benz": "벤츠", Mercedes: "벤츠", Benz: "벤츠", Tesla: "테슬라", Volvo: "볼보", Audi: "아우디", Lexus: "렉서스", MINI: "미니", Porsche: "포르쉐", "Land Rover": "랜드로버", Polestar: "폴스타", Chevrolet: "쉐보레" };
const localLogos = new Set(["현대", "기아", "제네시스", "KGM", "쉐보레", "르노", "벤츠", "테슬라", "BMW", "아우디", "볼보", "렉서스", "미니", "포르쉐", "랜드로버", "폴스타"]);
const brandLabel = brand => brandNames[brand] || brand;
const productLabel = product => product === "LEASE" ? "리스" : "장기렌트";
const state = {
  step: 0, furthest: 0, market: "domestic", catalog: [], brand: "", vehicle: null, detail: null, trim: null,
  exterior: null, interior: null, query: "", loading: true, error: "", submitting: false, receipt: null,
  conditions: { product: "", term: 60, mileage: 20000, deposit: 0, prepayment: 0, age: 26 },
  contact: { name: "", phone: "", agreed: false, notice: false },
};
let localStorage;
try { localStorage = window.localStorage; } catch { /* In-memory inquiry still works without browser storage. */ }
const code = referralCode(location.search, localStorage);
const params = new URLSearchParams(location.search);
let detailGeneration = 0;
let catalogLoading = false;
let renderedStep = -1;
const detailRequests = new Map();

function prepareDetail(vehicleId, { refresh = false } = {}) {
  const previous = detailRequests.get(vehicleId);
  if (!refresh && previous && Date.now() - previous.startedAt < 60000) return previous.promise;
  const entry = { startedAt: Date.now(), promise: null };
  entry.promise = requestJson(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}`).then(detail => {
    if (detail?.id !== vehicleId || !Array.isArray(detail.trims)) throw new Error("DETAIL_INVALID");
    return detail;
  }).catch(error => {
    if (detailRequests.get(vehicleId) === entry) detailRequests.delete(vehicleId);
    throw error;
  });
  detailRequests.set(vehicleId, entry);
  if (detailRequests.size > 8) detailRequests.delete(detailRequests.keys().next().value);
  return entry.promise;
}

function imageMarkup(value, alt, className = "") {
  const src = safeImage(value);
  return src ? `<img src="${escape(src)}" alt="${escape(alt)}" class="${className}" loading="lazy" decoding="async">` : '<span class="image-empty">사진 준비 중</span>';
}

function markStatus(message = "") { $("#flowStatus").textContent = message; }
function resetAgreements() { state.contact.agreed = false; state.contact.notice = false; }
function resetVehicle() {
  detailGeneration++;
  state.vehicle = state.detail = state.trim = state.exterior = state.interior = null;
  state.conditions.product = "";
  state.query = "";
  state.error = "";
  resetAgreements();
}

function reachable(step) {
  if (step >= 1 && !state.brand) return false;
  if (step >= 2 && (!state.vehicle || state.vehicle.brand !== state.brand)) return false;
  if (step >= 3 && (!state.detail || !state.trim
    || !selectableTrims(state.detail).some(trim => trim.id === state.trim.id)
    || (colorsFor(state.trim, "exterior").length && !state.exterior)
    || (colorsFor(state.trim, "interior").length && !state.interior))) return false;
  if (step >= 4 && !state.vehicle.available_product_types.includes(state.conditions.product)) return false;
  if (step >= 5 && (!state.contact.name.trim() || !validPhone(state.contact.phone))) return false;
  return true;
}

function canNext() {
  if (state.loading || state.error || state.submitting) return false;
  if (state.step === 0) return Boolean(state.brand);
  if (state.step === 1) return Boolean(state.vehicle);
  if (state.step === 2) return Boolean(state.trim)
    && (!colorsFor(state.trim, "exterior").length || Boolean(state.exterior))
    && (!colorsFor(state.trim, "interior").length || Boolean(state.interior));
  if (state.step === 3) return Boolean(state.conditions.product);
  if (state.step === 4) return Boolean(state.contact.name.trim()) && validPhone(state.contact.phone);
  return state.contact.agreed && state.contact.notice;
}

function updateActions() {
  $("#backButton").hidden = state.step === 0;
  $("#backButton").disabled = state.submitting;
  const next = $("#nextButton");
  next.disabled = !canNext();
  next.innerHTML = state.submitting ? "접수 확인 중" : state.step === 5 ? "이 조건으로 상담 신청" : '다음 <span aria-hidden="true">→</span>';
}

function renderChrome() {
  $("#stepList").innerHTML = STEPS.map((label, index) => `<li class="${index < state.step ? "is-done" : ""}"><button type="button" data-step="${index}" ${index > state.step || state.submitting ? "disabled" : ""} ${index === state.step ? 'aria-current="step"' : ""}><span class="step-dot">${index < state.step ? "✓" : String(index + 1).padStart(2, "0")}</span>${label}</button></li>`).join("");
  $("#stepLabel").textContent = `${STEPS[state.step]} ${state.step === 5 ? "" : "선택"}`;
  $("#stepCounter").innerHTML = `${String(state.step + 1).padStart(2, "0")} <span>/ 06</span>`;
  $("#progressFill").style.width = `${(state.step + 1) / 6 * 100}%`;
  $(".progress-track").setAttribute("aria-valuenow", String(state.step + 1));
  $("#flow").setAttribute("aria-busy", String(state.loading || state.submitting));
  const headings = [
    ["첫 번째 선택", "어떤 브랜드를 찾으세요?", "마음에 두신 제조사부터 골라보세요."],
    ["두 번째 선택", `${brandLabel(state.brand)}, 어떤 차가 좋으세요?`, "원하는 차량을 선택해 주세요. 이용조건은 다음 단계에서 정할 수 있어요."],
    ["세 번째 선택", "내 차의 디테일을 골라보세요", "트림을 고른 뒤 외장과 내장 색상을 선택해 주세요."],
    ["네 번째 선택", "어떤 조건으로 이용할까요?", "희망하는 조건을 알려주시면 리카가 확인해 드릴게요."],
    ["다섯 번째 선택", "어디로 안내해 드릴까요?", "선택하신 차량과 조건을 확인해 연락드리겠습니다."],
    ["마지막 확인", "선택하신 내용을 확인해 주세요", "상담 신청만으로 계약이나 신용조회가 진행되지는 않아요."],
  ];
  [$("#stepEyebrow").textContent, $("#stepTitle").textContent, $("#stepDescription").textContent] = headings[state.step];
  const preview = $("#selectionPreview");
  preview.hidden = !state.vehicle;
  preview.innerHTML = state.vehicle ? `${imageMarkup(state.exterior?.image_url || state.vehicle.image_url || state.vehicle.thumbnail_url, state.vehicle.model_name)}<strong>${escape(brandLabel(state.vehicle.brand))} ${escape(state.vehicle.model_name)}</strong><p>${escape(state.trim?.display_name || state.trim?.name || "트림을 선택해 주세요")}</p>` : "";
  updateActions();
}

function renderBrands() {
  const brands = [...new Set(state.catalog.map(vehicle => vehicle.brand))];
  const matching = brands.filter(brand => state.market === "all" || domestic.has(brandLabel(brand)) === (state.market === "domestic"));
  return `<div class="market-tabs" role="group" aria-label="제조사 구분">${[["domestic", "국산차"], ["imported", "수입차"], ["all", "전체"]].map(([value, label]) => `<button type="button" data-market="${value}" aria-pressed="${state.market === value}">${label}</button>`).join("")}</div><div class="choice-grid brands" role="group" aria-label="제조사 선택">${matching.map(brand => {
    const label = brandLabel(brand);
    const logo = localLogos.has(label) ? `<img src="/assets/danawa/brands/${encodeURIComponent(label)}/logo.png" alt="" width="62" height="30">` : `<span class="brand-monogram" aria-hidden="true">${escape(label.slice(0, 3))}</span>`;
    return `<button type="button" class="choice brand-choice" data-brand="${escape(brand)}" aria-pressed="${state.brand === brand}">${logo}<span>${escape(label)}</span>${state.brand === brand ? '<span class="selection-check" aria-hidden="true">✓</span>' : ""}</button>`;
  }).join("")}</div>${matching.length ? "" : '<p class="notice">현재 조회된 카탈로그에 해당 제조사가 없습니다.</p>'}`;
}

function vehicleItems() {
  const query = state.query.toLocaleLowerCase("ko-KR").trim();
  return state.catalog.filter(vehicle => vehicle.brand === state.brand && vehicle.model_name.toLocaleLowerCase("ko-KR").includes(query));
}

function vehicleCards() {
  const items = vehicleItems();
  return items.map(vehicle => `<button type="button" class="choice vehicle-choice" data-vehicle="${escape(vehicle.id)}" aria-pressed="${state.vehicle?.id === vehicle.id}">${imageMarkup(vehicle.image_url || vehicle.thumbnail_url, vehicle.model_name)}<strong>${escape(vehicle.model_name)}</strong><small>${escape(vehicle.available_product_types.map(productLabel).join(" · "))}</small>${state.vehicle?.id === vehicle.id ? '<span class="selection-check" aria-hidden="true">✓</span>' : ""}</button>`).join("") || '<p class="notice">검색 결과가 없습니다. 다른 차량명으로 검색해 주세요.</p>';
}

function renderVehicles() {
  return `<div class="vehicle-tools"><label class="search"><span class="sr-only">차량명 검색</span><input id="vehicleSearch" type="search" placeholder="차량명을 검색해 보세요" value="${escape(state.query)}" aria-label="차량명 검색" autocomplete="off"></label><span class="result-count" id="resultCount">${vehicleItems().length}개 차량</span></div><div class="choice-grid vehicles" id="vehicleGrid" role="group" aria-label="차량 선택">${vehicleCards()}</div>`;
}

function colorChoices(type, label) {
  const colors = colorsFor(state.trim, type);
  const selected = type === "exterior" ? state.exterior : state.interior;
  return `<fieldset class="field-group"><legend>${label}</legend>${colors.length ? `<div class="choice-grid color-grid">${colors.map(color => {
    const hex = /^#[0-9a-f]{6}$/i.test(color.hex || "") ? color.hex : "#e8ebef";
    return `<button type="button" class="choice color-choice" data-color="${escape(color.id)}" data-color-type="${type}" aria-pressed="${selected?.id === color.id}"><span class="swatch" style="background-color:${hex}" aria-hidden="true"></span><span>${escape(color.name)}</span></button>`;
  }).join("")}</div>` : '<p class="notice">별도 색상 정보가 제공되지 않는 트림입니다. 색상은 상담 시 확인해 주세요.</p>'}</fieldset>`;
}

function renderDetails() {
  const trims = selectableTrims(state.detail || {});
  if (!trims.length) return '<div class="state-panel"><h2>트림 정보를 확인하고 있어요</h2><p>현재 선택 가능한 세부 등급 정보가 없습니다. 다른 차량을 선택하거나 잠시 후 다시 확인해 주세요.</p><button type="button" class="secondary" data-retry-detail>다시 확인하기</button></div>';
  return `<fieldset class="field-group"><legend>트림</legend><div class="trim-list">${trims.map(trim => `<button type="button" class="choice trim-choice" data-trim="${escape(trim.id)}" aria-pressed="${state.trim?.id === trim.id}"><strong>${escape(trim.display_name || trim.name)}${trim.model_spec && !(trim.display_name || trim.name).includes(trim.model_spec) ? `<small>${escape(trim.model_spec)}</small>` : ""}</strong><span class="selection-check" aria-hidden="true">${state.trim?.id === trim.id ? "✓" : ""}</span></button>`).join("")}</div></fieldset>${state.trim ? `${colorChoices("exterior", "외장 색상")}${colorChoices("interior", "내장 색상")}` : '<p class="notice">트림을 선택하면 해당 트림의 색상을 확인할 수 있어요.</p>'}`;
}

function choiceGroup(key, label, values, format, note = "") {
  return `<fieldset class="field-group"><legend>${label}</legend><div class="choice-grid condition-grid" role="group" aria-label="${label}">${values.map(value => `<button type="button" class="choice condition-choice" data-condition="${key}" data-value="${value}" aria-pressed="${state.conditions[key] === value}">${format(value)}</button>`).join("")}</div>${note ? `<p class="field-note">${note}</p>` : ""}</fieldset>`;
}

function renderConditions() {
  return `<fieldset class="field-group"><legend>이용 방식</legend><div class="choice-grid product-grid">${state.vehicle.available_product_types.map(product => `<button type="button" class="choice product-choice" data-product="${product}" aria-pressed="${state.conditions.product === product}">${productLabel(product)}<small>${product === "LEASE" ? "일반 번호판 · 보험 별도 확인" : "하·허·호 번호판 · 보험 포함 여부 확인"}</small></button>`).join("")}</div><p class="field-note">선택하신 차량에서 제공되는 상품만 표시됩니다.</p></fieldset>`
    + choiceGroup("term", "이용 기간", [24, 36, 48, 60], value => `${value / 12}년 (${value}개월)`)
    + choiceGroup("mileage", "연간 주행거리", [10000, 20000, 30000, 40000], value => `${value / 10000}만 km`)
    + choiceGroup("deposit", "보증금", [0, 10, 20, 30, 40], value => value ? `${value}%` : "없음", "계약 종료 시 정산 조건에 따라 반환되는 담보금입니다.")
    + choiceGroup("prepayment", "선납금", [0, 10, 20, 30, 40], value => value ? `${value}%` : "없음", "월 이용료 일부를 미리 내는 금액으로, 보증금과 다릅니다.")
    + (state.conditions.product === "RENTAL" ? choiceGroup("age", "보험 연령", [21, 26], value => `만 ${value}세 이상`) : "")
    + '<p class="notice">선택 내용은 <strong>희망 이용조건</strong>입니다. 가능 여부와 실제 월 납입료는 리카가 금융사 조건을 확인한 뒤 안내합니다.</p>';
}

function renderContact() {
  return `<div class="contact-form"><label for="customerName">이름<input id="customerName" name="name" autocomplete="name" maxlength="100" placeholder="성함을 입력해 주세요" value="${escape(state.contact.name)}" required></label><label for="customerPhone">연락처<input id="customerPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="010-0000-0000" value="${escape(state.contact.phone)}" aria-describedby="phoneHelp" required></label><p class="field-note" id="phoneHelp">선택하신 차량 상담을 위해 연락드릴 휴대전화 번호입니다.</p></div><p class="notice" style="margin-top:28px">가입 없이 상담을 신청할 수 있어요.<br>선택한 차량과 조건은 다음 화면에서 한 번 더 확인합니다.</p>`;
}

function reviewRow(label, value, step) {
  return `<div><dt>${label}</dt><dd>${escape(value)}</dd><dd class="review-edit"><button type="button" data-step="${step}" aria-label="${label} 수정">수정</button></dd></div>`;
}

function renderReview() {
  const { vehicle: v, trim: t, conditions: c, contact } = state;
  return `<div class="review-vehicle">${imageMarkup(state.exterior?.image_url || v.image_url || v.thumbnail_url, v.model_name)}<div><small>${escape(brandLabel(v.brand))}</small><h2>${escape(v.model_name)}</h2></div></div><dl class="review">`
    + reviewRow("차량", `${brandLabel(v.brand)} ${v.model_name}`, 1)
    + reviewRow("트림", t.display_name || t.name, 2)
    + reviewRow("외장 / 내장", `${state.exterior?.name || "상담 시 확인"} / ${state.interior?.name || "상담 시 확인"}`, 2)
    + reviewRow("이용 방식", productLabel(c.product), 3)
    + reviewRow("기간 / 주행거리", `${c.term}개월 / 연 ${c.mileage.toLocaleString("ko-KR")}km`, 3)
    + reviewRow("초기비용", `보증금 ${c.deposit}% / 선납금 ${c.prepayment}%`, 3)
    + (c.product === "RENTAL" ? reviewRow("보험 연령", `만 ${c.age}세 이상`, 3) : "")
    + reviewRow("이름 / 연락처", `${contact.name} / ${contact.phone}`, 4)
    + '</dl><p class="notice">선택하신 조건으로 상담을 요청합니다. <strong>월 납입료와 계약 조건은 금융사 확인 후 안내</strong>하며, 신청만으로 계약이나 신용조회는 진행되지 않습니다.</p>'
    + `<div class="consents"><label class="agree-all"><input id="agreeAll" type="checkbox" ${contact.agreed && contact.notice ? "checked" : ""}>아래 필수 항목 모두 동의</label><label><input id="privacyAgree" type="checkbox" ${contact.agreed ? "checked" : ""}>[필수] 개인정보 수집·이용 동의</label><details><summary>수집·이용 내용 보기</summary><ul><li>수집 항목: 이름, 연락처, 선택 차량·트림·색상·이용조건, 추천코드(해당 시)</li><li>목적: 차량 견적 상담, 조건 안내 및 문의 응대</li><li>보유 기간: 기존 홈페이지 상담 정책에 따라 상담 종료 후 3개월까지 보관 후 파기</li><li>동의를 거부할 수 있으나 상담 접수는 제한됩니다.</li></ul></details><label><input id="noticeAgree" type="checkbox" ${contact.notice ? "checked" : ""}>[필수] 상담 유의사항 확인</label><details><summary>상담 유의사항 보기</summary><p>희망 조건과 실제 가능 조건은 다를 수 있습니다. 차량 재고, 금융사 심사, 보험 조건과 계약 시점에 따라 확정되며 실제 계약은 별도 계약서가 우선합니다. 문의 접수는 계약 체결이나 신용조회 동의가 아닙니다.</p></details></div>`
    + (code ? '<p class="referral-disclosure">이 페이지는 리카 크루의 추천 링크입니다. 계약이 성사되면 추천인에게 수수료가 지급될 수 있습니다.</p>' : "");
}

function render() {
  renderChrome();
  const content = $("#stepContent");
  if (state.loading) {
    content.innerHTML = `<p class="loading-label" role="status">${state.step === 2 ? "차량의 트림과 색상을 확인하고 있어요." : "리카 차량 카탈로그를 불러오고 있어요."}</p><div class="skeleton-grid" aria-hidden="true">${"<div></div>".repeat(8)}</div>`;
  } else if (state.error) {
    content.innerHTML = `<div class="state-panel"><h2>차량 정보를 불러오지 못했어요</h2><p>차량 서버 연결이 지연되고 있어요.<br>잠시 후 다시 시도해 주세요.</p><button type="button" class="secondary" ${state.step === 2 ? "data-retry-detail" : "data-retry"}>다시 불러오기</button><br><a href="/landing/">리카 서비스 살펴보기</a></div>`;
  } else {
    const views = [renderBrands, renderVehicles, renderDetails, renderConditions, renderContact, renderReview];
    content.innerHTML = views[state.step]();
    const all = $("#agreeAll");
    if (all) all.indeterminate = state.contact.agreed !== state.contact.notice;
  }
  content.classList.remove("step-enter");
  if (renderedStep !== state.step) content.classList.add("step-enter");
  renderedStep = state.step;
}

function goTo(step, { push = true } = {}) {
  if (state.submitting || state.receipt || step < 0 || step > 5 || !reachable(step)) return;
  if (state.loading && step !== 2) { detailGeneration++; state.loading = false; }
  state.step = step;
  state.furthest = Math.max(state.furthest, step);
  state.error = "";
  markStatus();
  if (push) history.pushState({ inquiryStep: step }, "", `${location.pathname}${location.search}#step${step + 1}`);
  if (step === 2 && !state.detail) { void fetchDetail(); return; }
  render();
  $("#stepTitle").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
}

async function fetchCatalog({ forceRefresh = false } = {}) {
  if (catalogLoading) return;
  catalogLoading = true;
  state.loading = true; state.error = ""; state.step = 0; resetVehicle(); render();
  try {
    state.catalog = await loadCatalog(undefined, { forceRefresh });
    if (!state.catalog.length) throw new Error("CATALOG_EMPTY");
    if (state.brand && !state.catalog.some(vehicle => vehicle.brand === state.brand)) state.brand = "";
    if (!state.catalog.some(vehicle => domestic.has(brandLabel(vehicle.brand)))) state.market = "all";
    const normalize = value => value.replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
    const entryBrand = params.get("brand");
    const entryModel = params.get("model");
    if (entryBrand && entryModel) {
      const matches = state.catalog.filter(vehicle => normalize(brandLabel(vehicle.brand)) === normalize(brandLabel(entryBrand))
        && normalize(vehicle.model_name) === normalize(entryModel));
      if (matches.length === 1) {
        state.vehicle = matches[0]; state.brand = state.vehicle.brand;
        state.market = domestic.has(brandLabel(state.brand)) ? "domestic" : "imported";
        state.conditions.product = state.vehicle.available_product_types.includes(params.get("product")) ? params.get("product") : state.vehicle.available_product_types[0];
        for (const [key, values] of [["term", [24, 36, 48, 60]], ["mileage", [10000, 20000, 30000, 40000]], ["deposit", [0, 10, 20, 30, 40]], ["prepayment", [0, 10, 20, 30, 40]]]) {
          if (params.has(key) && values.includes(Number(params.get(key)))) state.conditions[key] = Number(params.get(key));
        }
        state.step = state.furthest = 1;
        history.replaceState({ inquiryStep: 1 }, "", `${location.pathname}${location.search}#step2`);
      } else markStatus("랜딩에서 선택한 차량을 현재 카탈로그에서 확인하지 못했습니다. 제조사와 차량을 다시 선택해 주세요.");
    }
  } catch { state.error = "catalog"; }
  finally { catalogLoading = false; state.loading = false; render(); }
}

async function fetchDetail({ refresh = false } = {}) {
  if (!state.vehicle) return;
  const generation = ++detailGeneration;
  const vehicleId = state.vehicle.id;
  state.loading = true; state.error = ""; render();
  try {
    const detail = await prepareDetail(vehicleId, { refresh });
    if (generation !== detailGeneration) return;
    state.detail = detail;
    state.trim = state.exterior = state.interior = null;
    resetAgreements();
  } catch { if (generation === detailGeneration) state.error = "detail"; }
  finally { if (generation === detailGeneration) { state.loading = false; render(); } }
}

async function submit() {
  if (!canNext() || state.step !== 5) return;
  let body;
  try { body = inquiryPayload(state, state.contact, code); }
  catch { markStatus("선택한 조건이나 연락처를 다시 확인해 주세요."); return; }
  state.submitting = true; markStatus(); renderChrome();
  // Lock the final review while a single explicitly requested POST is in flight.
  $("#stepContent").inert = true;
  try {
    const receipt = await requestJson("/api/v1/support/quote-inquiries", { method: "POST", body, timeout: 20000 });
    if (typeof receipt.id !== "string" || !receipt.id || receipt.status !== "NEW") throw new Error("RECEIPT_INVALID");
    state.receipt = receipt;
    state.contact = { name: "", phone: "", agreed: false, notice: false };
    renderSuccess();
  } catch {
    markStatus("접수 완료 응답을 확인하지 못했습니다. 자동 재전송하지 않습니다. 잠시 후 확인해 주세요. 다시 신청하면 중복 접수될 수 있습니다.");
  } finally {
    state.submitting = false;
    $("#stepContent").inert = false;
    if (!state.receipt) { renderChrome(); }
  }
}

function renderSuccess() {
  $("#flow").setAttribute("aria-busy", "false");
  $(".step-heading").hidden = true;
  $("#flowActions").hidden = true;
  $("#stepContent").innerHTML = `<div class="success-content"><div class="success-check" aria-hidden="true">✓</div><h1 id="successTitle" tabindex="-1">상담 신청이 접수됐어요</h1><p>리카가 선택하신 차량과 조건을 확인한 뒤<br>남겨주신 연락처로 안내드리겠습니다.</p><div class="receipt">접수번호<strong>${escape(state.receipt.id)}</strong></div><p>계약이나 신용조회는 시작되지 않았습니다.</p><div class="success-links"><a class="primary" href="/">차량 더 살펴보기</a><a class="secondary" href="/landing/">리카 알아보기</a></div></div>`;
  $("#successTitle").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
}

document.addEventListener("click", event => {
  if (!(event.target instanceof Element) || state.submitting || state.receipt) return;
  const target = event.target.closest("button");
  if (!target || target.disabled) return;
  if (target.id === "nextButton") {
    if (state.step === 5) void submit();
    else if (canNext()) goTo(state.step + 1);
    return;
  }
  if (target.id === "backButton") { goTo(state.step - 1); return; }
  if (target.hasAttribute("data-retry")) { void fetchCatalog({ forceRefresh: true }); return; }
  if (target.hasAttribute("data-retry-detail")) { void fetchDetail({ refresh: true }); return; }
  if (target.hasAttribute("data-step")) {
    const step = Number(target.dataset.step);
    if (step < state.step) goTo(step);
    return;
  }
  markStatus();
  if (target.dataset.market && state.market !== target.dataset.market) {
    state.market = target.dataset.market; state.brand = ""; resetVehicle();
  }
  if (target.dataset.brand && state.brand !== target.dataset.brand) {
    state.brand = target.dataset.brand; resetVehicle();
  }
  if (target.dataset.vehicle && state.vehicle?.id !== target.dataset.vehicle) {
    const vehicle = state.catalog.find(row => row.id === target.dataset.vehicle && row.brand === state.brand);
    if (!vehicle) return;
    resetVehicle(); state.vehicle = vehicle; state.conditions.product = vehicle.available_product_types[0];
    // Start only after an explicit vehicle choice; the next step shares this request.
    void prepareDetail(vehicle.id).catch(() => {});
  }
  if (target.dataset.trim && state.trim?.id !== target.dataset.trim) {
    state.trim = selectableTrims(state.detail).find(row => row.id === target.dataset.trim) || null;
    state.exterior = state.interior = null; resetAgreements();
  }
  if (target.dataset.color) {
    const type = target.dataset.colorType;
    const color = colorsFor(state.trim, type).find(row => row.id === target.dataset.color);
    if (color) { state[type === "exterior" ? "exterior" : "interior"] = color; resetAgreements(); }
  }
  if (target.dataset.product && state.vehicle.available_product_types.includes(target.dataset.product)) {
    state.conditions.product = target.dataset.product; resetAgreements();
  }
  if (target.dataset.condition && Object.hasOwn(state.conditions, target.dataset.condition)) {
    state.conditions[target.dataset.condition] = Number(target.dataset.value); resetAgreements();
  }
  const identity = Object.entries(target.dataset);
  render();
  const replacement = [...$("#stepContent").querySelectorAll("button")].find(button =>
    identity.length && identity.every(([key, value]) => button.dataset[key] === value));
  replacement?.focus({ preventScroll: true });
});

document.addEventListener("input", event => {
  const input = event.target;
  if (state.submitting || state.receipt) return;
  if (input.id === "vehicleSearch") {
    state.query = input.value; $("#vehicleGrid").innerHTML = vehicleCards();
    $("#resultCount").textContent = `${vehicleItems().length}개 차량`;
  }
  if (input.id === "customerName" || input.id === "customerPhone") {
    state.contact[input.id === "customerName" ? "name" : "phone"] = input.value;
    resetAgreements(); updateActions();
  }
});

document.addEventListener("change", event => {
  if (state.submitting || state.receipt) return;
  const input = event.target;
  if (input.id === "agreeAll") {
    state.contact.agreed = state.contact.notice = input.checked;
    $("#privacyAgree").checked = $("#noticeAgree").checked = input.checked;
  } else if (input.id === "privacyAgree") state.contact.agreed = input.checked;
  else if (input.id === "noticeAgree") state.contact.notice = input.checked;
  else return;
  $("#agreeAll").checked = state.contact.agreed && state.contact.notice;
  $("#agreeAll").indeterminate = state.contact.agreed !== state.contact.notice;
  updateActions();
});

document.addEventListener("error", event => {
  if (event.target instanceof HTMLImageElement) {
    event.target.hidden = true;
    if (event.target.closest(".vehicle-choice")) {
      const text = document.createElement("span");
      text.className = "image-empty"; text.textContent = "사진 준비 중"; event.target.after(text);
    }
  }
}, true);

window.addEventListener("popstate", event => {
  if (state.receipt) return;
  const step = event.state?.inquiryStep;
  if (Number.isInteger(step) && step >= 0 && step <= state.furthest && reachable(step) && !state.submitting) goTo(step, { push: false });
  else history.replaceState({ inquiryStep: state.step }, "", `${location.pathname}${location.search}#step${state.step + 1}`);
});

// Never restore names, phone numbers or consent from persistent storage.
history.replaceState({ inquiryStep: 0 }, "", `${location.pathname}${location.search}#step1`);
if (code && params.has("ref")) {
  try { localStorage?.setItem("recar_referral_code", code); } catch { /* Optional attribution storage. */ }
}
void fetchCatalog();
