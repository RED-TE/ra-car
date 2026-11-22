import { referralCode, validPhone } from "./catalog.mjs";
import { createSubmissionController, isLocalPreview, landingEntryFromSearch, stepHref, withLandingEntry } from "./showroom/contract.mjs";

const search = new URLSearchParams(location.search);
let storage;
try { storage = localStorage; } catch { /* The form works without saved attribution. */ }
const code = search.getAll("ref").length > 1 ? "" : referralCode(search, storage);
const entry = landingEntryFromSearch(location.search);
const preview = isLocalPreview(location);
const submitter = createSubmissionController({ isPreview: preview });
const form = document.querySelector("#quote");
const status = document.querySelector("#inquiryStatus");
const vehicle = document.querySelector("#vehicleWish");
const phone = document.querySelector("#contactPhone");
const name = document.querySelector("#customerName");
const privacy = document.querySelector("#privacyConsent");
const notice = document.querySelector("#noticeConsent");
const submit = form.querySelector('[type="submit"]');
const stepPanels = [...form.querySelectorAll("[data-step]")];
const controls = [...form.querySelectorAll("input, button")];
let current = 0;
let locked = false;
vehicle.value = entry.vehicleName;
document.querySelector("#crewDisclosure").hidden = !code;

const stepsUrl = new URL(stepHref(location.search, code, entry), location.origin);
for (const link of document.querySelectorAll("[data-steps]")) link.href = stepsUrl.href;
for (const link of document.querySelectorAll("[data-showroom]")) {
  link.href = new URL("/inquiry/showroom/" + stepsUrl.search, location.origin).href;
}
const landingQuery = new URLSearchParams(stepsUrl.search);
for (const key of ["brand", "model", "product", "term", "mileage", "deposit", "prepayment"]) landingQuery.delete(key);
for (const link of document.querySelectorAll("[data-landing]")) {
  const landing = new URL("/landing/", location.origin);
  landing.search = landingQuery;
  link.href = landing.href;
}

function feedback(message = "", error = false) {
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle("is-error", error);
}

function showStep(index) {
  current = index;
  for (const [i, panel] of stepPanels.entries()) {
    panel.hidden = i !== index;
    panel.classList.toggle("is-active", i === index);
  }
  form.querySelector(".quiet-step-counter").textContent = `${index + 1} / ${stepPanels.length}`;
  feedback();
  stepPanels[index].querySelector("input").focus();
}

function invalid(input, message) {
  input.setAttribute("aria-invalid", "true");
  feedback(message, true);
  input.focus();
}

function advance() {
  if (current === 0 && !vehicle.value.trim()) return invalid(vehicle, "희망 차종을 입력해 주세요.");
  if (current === 1 && !validPhone(phone.value)) return invalid(phone, "휴대전화 번호를 다시 확인해 주세요.");
  if (current < stepPanels.length - 1) showStep(current + 1);
}

function syncSubmit() {
  submit.disabled = locked || !name.value.trim() || !privacy.checked || !notice.checked;
}

form.addEventListener("input", event => {
  event.target.removeAttribute("aria-invalid");
  if (!locked) feedback();
  syncSubmit();
});

form.addEventListener("click", event => {
  if (locked) return;
  if (event.target.closest("[data-next-step]")) advance();
  if (event.target.closest("[data-prev-step]") && current > 0) showStep(current - 1);
});

form.addEventListener("keydown", event => {
  if (!locked && current < stepPanels.length - 1 && event.key === "Enter" && !event.isComposing && event.target.matches("input")) {
    event.preventDefault();
    advance();
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (locked) return;
  if (current < stepPanels.length - 1) return advance();
  const contact = { name: name.value, phone: phone.value, agreed: privacy.checked, notice: notice.checked };
  if (!contact.name.trim() || !contact.agreed || !contact.notice) {
    feedback("성함과 필수 동의 항목을 확인해 주세요.", true);
    return;
  }
  locked = true;
  for (const control of controls) control.disabled = true;
  form.setAttribute("aria-busy", "true");
  feedback("접수 결과를 확인하고 있어요.");
  try {
    const receipt = await submitter.submit(contact, withLandingEntry({
      vehicle_name: vehicle.value.trim(), condition_summary: "간편 견적 상담",
    }, entry), code);
    feedback(receipt.preview
      ? "검수용 화면입니다. 문의를 전송하지 않았습니다."
      : `문의가 접수됐습니다. 리카가 확인한 뒤 연락드리겠습니다. 접수번호: ${receipt.id}`);
    if (!receipt.preview) form.reset();
  } catch {
    locked = submitter.state !== "idle";
    feedback(locked
      ? "접수 여부를 확인하지 못했습니다. 중복 신청을 피하려면 리카에 먼저 문의해 주세요."
      : "접수하지 못했습니다. 입력 내용과 연결 상태를 확인한 뒤 다시 시도해 주세요.", true);
  } finally {
    form.removeAttribute("aria-busy");
    if (!locked) for (const control of controls) control.disabled = false;
    syncSubmit();
  }
});
