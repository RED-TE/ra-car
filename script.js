// Public catalog prices are accepted only with evidence for these exact inputs.
// Never infer product/conditions from a badge, a static price, or a request echo.
window.recarPublicPrice = Object.freeze({
  conditions: Object.freeze({ productType: "RENTAL", term: 60, depositPct: 0, guaranteePct: 0, mileageLimit: 10000 }),
  isRental: item => item?.productType === "RENTAL",
  categories(item) {
    const categories = (Array.isArray(item?.categories) ? item.categories : [])
      .map(value => typeof value === "string" ? value : value?.key)
      .filter(value => typeof value === "string" && value !== "time");
    const segment = String(item?.segment || "").toLowerCase();
    if (["suv", "sedan"].includes(segment)) categories.push(segment);
    const domesticBrands = ["현대", "기아", "제네시스", "르노", "KGM", "쉐보레", "Hyundai", "Kia", "Genesis", "Renault", "Chevrolet"];
    if (item?.brand) categories.push(domesticBrands.includes(item.brand) ? "domestic" : "imported");
    return [...new Set(["all", ...categories])];
  },
  monthly(item) {
    const evidence = item?.priceEvidence;
    return item?.productType === "RENTAL" &&
      Number.isSafeInteger(item.monthlyPayment) && item.monthlyPayment > 0 &&
      evidence?.verified === true &&
      evidence.quoteKind === "ESTIMATE" && evidence.isEstimate === true &&
      Array.isArray(evidence.unverifiedConditions) &&
      ((evidence.evidenceScope === "EXACT" && evidence.unverifiedConditions.length === 0) ||
        (evidence.evidenceScope === "GUARANTEE_UNRECORDED" && evidence.unverifiedConditions.length === 1 && evidence.unverifiedConditions[0] === "guarantee")) &&
      Object.entries(this.conditions).every(([key, value]) => evidence[key] === value)
      ? item.monthlyPayment : null;
  },
});
// Public price boundary ends.

let rentalCatalogModule;
const publicCatalogModule = () => rentalCatalogModule ||= import("/lib/rental-catalog.mjs?v=20261108-rental-pricing");
window.recarCatalog = Object.freeze({
  async load() { return (await publicCatalogModule()).loadRentalCatalog({ limit: 12 }); },
  async detail(id, signal) { return (await publicCatalogModule()).loadRentalVehicle(id, { signal }); },
});

const header = document.querySelector(".site-header");
const navLinks = [...document.querySelectorAll(".nav-left a[href^='#'], .nav-right a[href='#business']")];
const mobileNavLinks = [...document.querySelectorAll(".mobile-bottom a[href^='#']")];
const slides = [...document.querySelectorAll(".hero-slide")];
const dots = [...document.querySelectorAll(".hero-dot")];
let activeSlide = 0;
let slideTimer;

function ensureSlideImage(index) {
  const image = slides[index]?.querySelector("img[data-src]");
  if (!image || image.getAttribute("src")) return;

  image.src = image.dataset.src;
  image.removeAttribute("data-src");
}

function setHeaderState() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 40);
}

function showSlide(index) {
  if (!slides.length) return;

  activeSlide = (index + slides.length) % slides.length;
  ensureSlideImage(activeSlide);

  slides.forEach((slide, slideIndex) => {
    slide.classList.toggle("is-active", slideIndex === activeSlide);
  });

  dots.forEach((dot, dotIndex) => {
    dot.classList.toggle("is-active", dotIndex === activeSlide);
  });
}

function startSlider() {
  window.clearInterval(slideTimer);
  slideTimer = window.setInterval(() => {
    showSlide(activeSlide + 1);
  }, 5000);
}

dots.forEach((dot, index) => {
  dot.addEventListener("click", () => {
    showSlide(index);
    startSlider();
  });
});

const sections = [...document.querySelectorAll("main section[id]")];

function setActiveNavigation(sectionId) {
  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === `#${sectionId}`);
  });

  mobileNavLinks.forEach((link) => {
    const target = link.dataset.navTarget || link.getAttribute("href")?.replace("#", "");
    link.classList.toggle("is-active", target === sectionId);
  });
}

function updateActiveNavigation() {
  if (!sections.length) return;

  const checkpoint = window.innerHeight * 0.45;
  let activeSection = sections[0];

  sections.forEach((section) => {
    if (section.getBoundingClientRect().top <= checkpoint) {
      activeSection = section;
    }
  });

  setActiveNavigation(activeSection.id);
}

const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;
    setActiveNavigation(visible.target.id);
  },
  {
    rootMargin: "-42% 0px -50% 0px",
    threshold: [0.1, 0.35, 0.7],
  },
);

sections.forEach((section) => observer.observe(section));

const quoteForm = document.querySelector(".quote-form");
const privacyConsentInput = document.querySelector("#privacyConsent");
const termsConsentInput = document.querySelector("#termsConsent");
const referralNotice = document.querySelector("[data-referral-notice]");
const referralToggleButton = document.querySelector("[data-referral-toggle]");
const referralDetails = document.querySelector("[data-referral-details]");
const referralCodeOutput = document.querySelector("[data-referral-code]");
const referralCopyButton = document.querySelector("[data-referral-copy]");
const referralCloseButton = document.querySelector("[data-referral-close]");
const referralStorageKey = "recar_referral_code";
const referralEntryPathKey = "recar_referral_entry_path";
let activeReferralCode = "";
const defaultLeadContext = {
  leadSource: quoteForm?.dataset.defaultLeadSource || "",
  campaign: quoteForm?.dataset.defaultCampaign || "",
  campaignLabel: quoteForm?.dataset.defaultCampaignLabel || "",
  timeDealOriginalMonthlyPayment: null,
  timeDealMonthlyPayment: null,
  timeDealDiscount: null,
};
let pendingLeadContext = { ...defaultLeadContext };

function makeLeadId() {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RECAR-${stamp}-${suffix}`;
}

function normalizePhone(value) {
  return value.replace(/[^\d]/g, "");
}

function normalizeReferralCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code) ? code : "";
}

function readStoredReferralCode() {
  try {
    return normalizeReferralCode(window.localStorage.getItem(referralStorageKey));
  } catch {
    return "";
  }
}

function writeStoredReferralCode(code) {
  try {
    window.localStorage.setItem(referralStorageKey, code);
  } catch {
    // Referral attribution still works for the current page when storage is blocked.
  }
}

function trackReferralVisit(code) {
  const sessionKey = `recar_referral_tracked_${code}`;
  try {
    if (window.sessionStorage.getItem(sessionKey)) return;
    window.sessionStorage.setItem(sessionKey, "1");
  } catch {
    // The server also deduplicates repeated visits by code and hashed IP.
  }

  const source = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? "ios-web"
    : /Android/i.test(navigator.userAgent)
      ? "android-web"
      : "homepage";
  const trackUrl = new URL("https://api.recarplan.com/api/v1/friends/track");
  trackUrl.searchParams.set("code", code);
  trackUrl.searchParams.set("source", source);
  window.fetch(trackUrl.toString(), {
    method: "GET",
    mode: "no-cors",
    credentials: "omit",
    keepalive: true,
  }).catch(() => {});
}

function setReferralNoticeExpanded(expanded) {
  if (!referralNotice || !referralToggleButton || !referralDetails) return;

  referralNotice.classList.toggle("is-expanded", expanded);
  referralToggleButton.setAttribute("aria-expanded", String(expanded));
  referralToggleButton.setAttribute("aria-label", expanded ? "추천 프로모션 혜택 접기" : "추천 프로모션 혜택 보기");
  referralDetails.hidden = !expanded;
}

function setReferralNotice(code) {
  if (!referralNotice || !referralCodeOutput || !code) return;

  let dismissed = false;
  try {
    dismissed = window.sessionStorage.getItem("recar_referral_notice_dismissed") === code;
  } catch {
    dismissed = false;
  }
  if (dismissed) return;

  referralCodeOutput.textContent = code;
  setReferralNoticeExpanded(false);
  referralNotice.hidden = false;
  referralNotice.classList.add("is-visible");
}

async function copyReferralCode() {
  if (!activeReferralCode || !referralCopyButton) return;

  try {
    await navigator.clipboard.writeText(activeReferralCode);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = activeReferralCode;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }

  referralCopyButton.classList.add("is-copied");
  referralCopyButton.setAttribute("aria-label", "추천 코드 복사됨");
  window.setTimeout(() => {
    referralCopyButton.classList.remove("is-copied");
    referralCopyButton.setAttribute("aria-label", "추천 코드 복사");
  }, 1800);
}

function initializeReferral() {
  const params = new URLSearchParams(window.location.search);
  const queryCode = normalizeReferralCode(params.get("ref"));
  const routeCode = normalizeReferralCode(window.location.pathname.match(/^\/r\/(RC-[A-Z0-9]{4,16})\/?$/i)?.[1]);
  activeReferralCode = routeCode || queryCode || readStoredReferralCode();
  if (!activeReferralCode) return;

  writeStoredReferralCode(activeReferralCode);
  if (routeCode) {
    try {
      window.sessionStorage.setItem(referralEntryPathKey, window.location.pathname);
    } catch {
      // The referral code remains available on the current page.
    }
  } else if (queryCode) {
    try {
      window.sessionStorage.removeItem(referralEntryPathKey);
    } catch {
      // Query attribution still takes precedence over stored route attribution.
    }
  }
  setReferralNotice(activeReferralCode);
  if (routeCode || queryCode) trackReferralVisit(activeReferralCode);
}

function isValidPhone(value) {
  return /^01[016789]\d{7,8}$/.test(normalizePhone(value));
}

function setFormStatus(message, type = "success") {
  const status = quoteForm?.querySelector(".form-status");
  if (!status) return;

  status.textContent = message;
  status.hidden = false;
  status.classList.toggle("is-error", type === "error");
}

function parseContextNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeLeadContext(context = {}) {
  return {
    ...defaultLeadContext,
    leadSource: context.leadSource || defaultLeadContext.leadSource,
    campaign: context.campaign || defaultLeadContext.campaign,
    campaignLabel: context.campaignLabel || defaultLeadContext.campaignLabel,
    // Legacy URL/data attributes are not evidence of an actual discount.
    timeDealOriginalMonthlyPayment: null,
    timeDealMonthlyPayment: null,
    timeDealDiscount: null,
  };
}

function setPendingLeadContext(context = {}) {
  pendingLeadContext = normalizeLeadContext(context);
  if (quoteForm) {
    quoteForm.dataset.leadCampaign = pendingLeadContext.campaign || "";
    quoteForm.dataset.leadSource = pendingLeadContext.leadSource || "";
  }
}

function getLeadPayload() {
  const leadContext = normalizeLeadContext(pendingLeadContext);
  const contextSource = leadContext.campaignLabel || leadContext.leadSource;
  let referralEntryPath = "";
  try {
    referralEntryPath = window.sessionStorage.getItem(referralEntryPathKey) || "";
  } catch {
    // The code itself still travels with the inquiry.
  }
  if (normalizeReferralCode(referralEntryPath.match(/^\/r\/(RC-[A-Z0-9]{4,16})\/?$/i)?.[1]) !== (activeReferralCode || readStoredReferralCode())) {
    referralEntryPath = "";
  }

  return {
    id: makeLeadId(),
    createdAt: new Date().toISOString(),
    vehicle: vehicleWishInput?.value.trim() || "",
    phone: contactPhoneInput?.value.trim() || "",
    customerName: customerNameInput?.value.trim() || "",
    requestNote: requestNoteInput?.value.trim() || "",
    privacyConsent: privacyConsentInput?.checked || false,
    consentedAt: privacyConsentInput?.checked ? new Date().toISOString() : "",
    policyVersion: "2026-05-10",
    termsConsent: termsConsentInput?.checked || false,
    termsAcceptedAt: termsConsentInput?.checked ? new Date().toISOString() : "",
    termsVersion: "2026-05-10",
    page: window.location.href,
    source: contextSource || document.querySelector(".hero-slide.is-active h1")?.textContent.trim() || "RE:CAR",
    entryPoint: referralEntryPath ? "크루 전용 링크" : quoteForm?.dataset.entryPoint || "홈페이지 상담 폼",
    leadSource: leadContext.leadSource,
    campaign: leadContext.campaign,
    campaignLabel: leadContext.campaignLabel,
    referralCode: activeReferralCode || readStoredReferralCode(),
    referralEntryPath,
    timeDealOriginalMonthlyPayment: leadContext.timeDealOriginalMonthlyPayment,
    timeDealMonthlyPayment: leadContext.timeDealMonthlyPayment,
    timeDealDiscount: leadContext.timeDealDiscount,
  };
}

function saveLocalLead(lead) {
  window.sessionStorage.setItem("recarLastLeadId", lead.id);
}

function requestJson(url, options = {}) {
  if (typeof window.fetch === "function") {
    return window.fetch(url, options).then(async (response) => ({
      ok: response.ok,
      status: response.status,
      data: await response.json(),
    }));
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(options.method || "GET", url, true);
    Object.entries(options.headers || {}).forEach(([key, value]) => {
      request.setRequestHeader(key, value);
    });
    request.onload = () => {
      let data = null;
      try {
        data = request.responseText ? JSON.parse(request.responseText) : null;
      } catch (error) {
        reject(error);
        return;
      }
      resolve({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        data,
      });
    };
    request.onerror = () => reject(new Error("network_request_failed"));
    request.send(options.body || null);
  });
}

const firebaseConfig = {
  apiKey: "AIzaSyDwBr5ftgJID4cGt45N23eVCTiLWt5M2PE",
  authDomain: "recarauto-88950.firebaseapp.com",
  projectId: "recarauto-88950",
  storageBucket: "recarauto-88950.firebasestorage.app",
  messagingSenderId: "851749593786",
  appId: "1:851749593786:web:f114ba96d32dafcf261883",
  measurementId: "G-CT2RF1RFNQ",
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((script) => script.src === src)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function getFirebaseDb() {
  if (!window.firebase?.firestore) {
    await loadScript("https://www.gstatic.com/firebasejs/8.6.8/firebase-app.js");
    await loadScript("https://www.gstatic.com/firebasejs/8.6.8/firebase-firestore.js");
  }

  if (!window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
  }

  return window.firebase.firestore();
}

async function sendLeadToServer(lead) {
  if (window.location.protocol === "file:") {
    return { stored: "browser" };
  }

  const response = await requestJson("/api/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(lead),
  });

  if (!response.ok) {
    throw new Error("lead_request_failed");
  }

  return response.data;
}

async function sendLeadToFirebase(lead) {
  const db = await getFirebaseDb();
  const cleanLead = {
    ...lead,
    storage: "firebase-client",
    progressStatus: "미배정",
    assignedAdminId: "",
    assignedAdminName: "",
    assignedAdminUsername: "",
    groupId: "",
    adminMemo: "",
    dbManager: "",
  };

  await db.collection("leads").doc(lead.id).set(cleanLead, { merge: false });

  return { stored: "firebase", id: lead.id };
}

async function submitLead(lead) {
  saveLocalLead(lead);

  let serverResult = null;
  try {
    serverResult = await sendLeadToServer(lead);
  } catch (error) {
    serverResult = null;
  }

  if (serverResult?.firebase?.stored || serverResult?.stored === "firebase") {
    return {
      stored: "firebase",
      firebase: serverResult.firebase,
      server: serverResult,
    };
  }

  if (window.location.protocol !== "file:") {
    const firebaseResult = await sendLeadToFirebase(lead);
    return {
      stored: "firebase",
      firebase: firebaseResult,
      server: serverResult,
    };
  }

  return {
    stored: serverResult?.stored || "server",
    firebaseError: serverResult?.firebase?.error || "",
    server: serverResult,
  };
}

quoteForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector(".submit-button");
  const buttonText = event.currentTarget.querySelector(".submit-button span");
  if (!button || !buttonText) return;
  if (button.disabled) return;

  const lead = getLeadPayload();

  if (!lead.vehicle) {
    setFormStatus("상담받을 차량을 입력해 주세요. 아직 정하지 못했다면 '미정'이라고 적어도 괜찮습니다.", "error");
    vehicleWishInput?.focus();
    return;
  }

  if (!isValidPhone(lead.phone)) {
    setFormStatus("연락처 형식을 확인해 주세요. 예: 010-0000-0000", "error");
    contactPhoneInput?.focus();
    return;
  }

  if (!lead.customerName) {
    setFormStatus("상담 받으실 분의 이름을 입력해 주세요.", "error");
    customerNameInput?.focus();
    return;
  }

  if (!lead.privacyConsent) {
    setFormStatus("개인정보 수집·이용에 동의하지 않으면 문의 접수가 불가합니다.", "error");
    privacyConsentInput?.focus();
    return;
  }

  if (!lead.termsConsent) {
    setFormStatus("상담 유의사항 확인에 동의하지 않으면 문의 접수가 불가합니다.", "error");
    termsConsentInput?.focus();
    return;
  }

  const original = buttonText.textContent;
  button.disabled = true;
  event.currentTarget.setAttribute("aria-busy", "true");
  buttonText.textContent = "확인 중";
  event.currentTarget.classList.add("is-submitted");

  Promise.resolve()
    .then(() => submitLead(lead))
    .then((submitResult) => {
      quoteForm.dataset.lastSubmitStorage = submitResult?.stored || "";
      quoteForm.dataset.lastFirebaseError = submitResult?.firebaseError || "";
      setFormStatus("문의가 접수되었습니다. 가능한 조건을 확인해 연락드리겠습니다.");
      buttonText.textContent = "접수 완료";
    })
    .catch((error) => {
      console.error("lead_submit_failed", error);
      setFormStatus("문의 접수 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.", "error");
      buttonText.textContent = "다시 시도";
    })
    .finally(() => {
      quoteForm.setAttribute("aria-busy", "false");
      window.setTimeout(() => {
        button.disabled = false;
        buttonText.textContent = original;
      }, 1400);
    });
});

const vehicleWishInput = document.querySelector("#vehicleWish");
const contactPhoneInput = document.querySelector("#contactPhone");
const customerNameInput = document.querySelector("#customerName");
const requestNoteInput = document.querySelector("#requestNote");
const quoteSection = document.querySelector("#quote");
const bestTabs = [...document.querySelectorAll(".best-tabs button[data-filter]")];
const vehicleGrid = document.querySelector(".vehicle-grid");
const vehicleError = document.querySelector("#vehicleError");
const vehicleDetailPanel = document.querySelector("#vehicleDetailPanel");
const floatingContact = document.querySelector(".floating-contact");
const inquiryStickyCta = document.querySelector(".inquiry-sticky-cta");
const vehicleMode = vehicleGrid?.dataset.vehicleMode || "home";
const defaultVehicleFilter = vehicleGrid?.dataset.defaultFilter || "all";
const vehicleConditions = {
  term: 60,
  depositPct: 0,
  guaranteePct: 0,
  productType: "RENTAL",
  mileageLimit: 10000,
};
let activeVehicleFilter = defaultVehicleFilter;
let vehicleCards = [...document.querySelectorAll(".vehicle-card[data-category]")];
let currentDetailVehicle = null;
let currentTrimId = "";
let currentOptionIds = new Set();
let detailGeneration = 0;
let detailAbortController;

function getHashTarget() {
  const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  if (!id) return null;
  return document.getElementById(id);
}

function scrollToHashTarget(behavior = "auto") {
  const target = getHashTarget();
  if (!target) return;
  target.scrollIntoView({ behavior, block: "start" });
}

function stabilizeHashScroll() {
  if (!window.location.hash) return;

  window.requestAnimationFrame(() => {
    scrollToHashTarget();
    window.setTimeout(() => scrollToHashTarget(), 160);
    window.setTimeout(() => scrollToHashTarget(), 720);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatWon(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "상담 후 안내";
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(number))}원`;
}

function formatSignedWon(value) {
  const number = Math.round(Number(value) || 0);
  if (!number) return "변동 없음";
  return `${number > 0 ? "+" : "-"}${formatWon(Math.abs(number))}`;
}

function formatPercent(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  return `${(number * 100).toFixed(digits)}%`;
}

function formatOptionMeta(option) {
  if (option?.isDefault || option?.badge === "기본") return "기본";
  if (Number(option?.price) > 0) return `+${formatWon(option.price)}`;
  return option?.badge || "선택";
}

function refreshVehicleCards() {
  vehicleCards = [...document.querySelectorAll(".vehicle-card[data-category]")];
}

function buildVehicleName(vehicle) {
  return [vehicle.brandLabel || vehicle.brand, vehicle.name].filter(Boolean).join(" ").trim() || "차량";
}

function setVehicleFilter(filter) {
  activeVehicleFilter = filter;
  refreshVehicleCards();

  bestTabs.forEach((tab) => {
    const isActive = tab.dataset.filter === filter;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  });

  vehicleCards.forEach((card) => {
    const categories = (card.dataset.category || "").split(" ");
    const isVisible = categories.includes(filter);
    card.hidden = !isVisible;
    const rank = Number(card.getAttribute(`data-rank-${filter}`) || 999);
    card.style.order = String(rank);
  });

  vehicleGrid?.classList.toggle("is-filtered", filter !== defaultVehicleFilter);
}

function renderImageMarkup(vehicle, index = 0) {
  const label = escapeHtml(buildVehicleName(vehicle));
  const imageUrl = vehicle.imageUrl || vehicle.fallbackImageUrl;

  if (!imageUrl) {
    return `<div class="vehicle-image-wrap"><div class="vehicle-image-placeholder">이미지 준비중</div></div>`;
  }

  const fallback = vehicle.fallbackImageUrl && vehicle.fallbackImageUrl !== imageUrl ? ` data-fallback-src="${escapeHtml(vehicle.fallbackImageUrl)}"` : "";
  const loading = index < 2 && vehicleMode === "all" ? "eager" : "lazy";
  const priority = loading === "eager" ? ' fetchpriority="high"' : "";
  return `<div class="vehicle-image-wrap"><img src="${escapeHtml(imageUrl)}" alt="${label}" loading="${loading}" decoding="async"${priority}${fallback} /></div>`;
}

function renderOptionChips(options = [], limit = 4) {
  const visibleOptions = options.filter((option) => option?.name).slice(0, limit);
  if (!visibleOptions.length) return `<div class="option-chip-row is-empty" aria-hidden="true"></div>`;

  return `
    <div class="option-chip-row">
      ${visibleOptions
        .map(
          (option) => `
            <span class="option-chip">
              ${option.category ? `<em>${escapeHtml(option.category)}</em>` : ""}
              ${escapeHtml(option.name)}
              <small>${escapeHtml(formatOptionMeta(option))}</small>
            </span>
          `,
        )
        .join("")}
    </div>
  `;
}

function getVehicleConditionSummary(vehicle) {
  return window.recarPublicPrice.monthly(vehicle)
    ? "장기렌트 · 60개월 · 선납금 0% · 연 10,000km"
    : "장기렌트 · 가격 확인 필요";
}

function renderVehicleCard(vehicle, index = 0) {
  if (!window.recarPublicPrice.isRental(vehicle)) return "";
  const name = buildVehicleName(vehicle);
  const category = window.recarPublicPrice.categories(vehicle).join(" ");
  const ranks = vehicle.categoryRanks || {};
  const rankAttributes = Object.entries(ranks).filter(([key]) => key !== "time")
    .map(([key, value]) => `data-rank-${escapeHtml(key)}="${escapeHtml(value)}"`).join(" ");
  const amount = window.recarPublicPrice.monthly(vehicle);
  const trim = vehicle.trim || "대표 트림";
  const quoteVehicleName = `${name} ${trim}`.trim();
  return `<article class="vehicle-card" data-category="${escapeHtml(category)}" data-vehicle-id="${escapeHtml(vehicle.id)}" ${rankAttributes}>
    ${renderImageMarkup(vehicle, index)}
    <div class="vehicle-body"><div class="badge-row"><span>장기렌트</span><span>${amount ? "조건 근거 확인" : "가격 확인 필요"}</span></div>
      <h3><span>${escapeHtml(vehicle.brandLabel || vehicle.brand || "브랜드")}</span>${escapeHtml(vehicle.name || "차량")}</h3>
      <p class="vehicle-specs">${escapeHtml(getVehicleConditionSummary(vehicle))}</p>
      ${vehicle.trimCount ? `<div class="vehicle-meta"><span>트림 ${escapeHtml(vehicle.trimCount)}종</span></div>` : ""}
      <div class="price">${amount ? `<small>월</small> ${escapeHtml(formatWon(amount))}` : "가격 확인 필요"}</div>
      <p class="vehicle-price-note">선택 조건 근거가 확인된 예상 월납입니다. 보증금 원본 기재 여부와 최종 계약 조건은 별도로 확인해 주세요.</p>
      <div class="vehicle-actions"><a class="vehicle-quote-button" href="#quote" data-vehicle="${escapeHtml(quoteVehicleName)}">이 조건 받아보기</a></div>
    </div></article>`;
}

function renderVehicleError() {
  if (vehicleError) {
    vehicleError.hidden = false;
  }
  if (vehicleGrid) {
    vehicleGrid.setAttribute("aria-busy", "false");
    vehicleGrid.innerHTML = "";
  }
}

async function loadVehicles() {
  if (!vehicleGrid) return;
  if (document.body.classList.contains("public-home") && window.recarHome) {
    return window.recarHome.loadCatalog();
  }
  vehicleGrid.setAttribute("aria-busy", "true");
  vehicleGrid.innerHTML = '<p class="vehicle-detail-loading">차량 정보를 불러오는 중입니다.</p>';
  try {
    const catalog = await window.recarCatalog.load();
    if (!Array.isArray(catalog)) throw new Error("vehicle_load_failed");
    const items = catalog.filter(window.recarPublicPrice.isRental);
    if (vehicleError) vehicleError.hidden = true;
    vehicleGrid.setAttribute("aria-busy", "false");
    vehicleGrid.innerHTML = items.length
      ? items.map((item, index) => renderVehicleCard(item, index)).join("")
      : '<p class="vehicle-detail-loading">현재 확인 가능한 장기렌트 차량이 없습니다.</p>';
    refreshVehicleCards();
    setVehicleFilter(activeVehicleFilter);
  } catch {
    renderVehicleError();
  }
}

function renderDetailImage(vehicle) {
  const imageUrl = vehicle.imageUrl || vehicle.fallbackImageUrl;
  if (!imageUrl) return `<div class="vehicle-image-placeholder">이미지 준비중</div>`;

  const fallback = vehicle.fallbackImageUrl && vehicle.fallbackImageUrl !== imageUrl ? ` data-fallback-src="${escapeHtml(vehicle.fallbackImageUrl)}"` : "";
  return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(buildVehicleName(vehicle))}" loading="lazy"${fallback} />`;
}

function getDetailTrims(vehicle) {
  return (vehicle.trims || []).filter((trim) => trim?.isAvailable !== false);
}

function getSelectedTrim(vehicle) {
  const trims = getDetailTrims(vehicle);
  return trims.find((trim) => trim.id === currentTrimId) || trims[0] || null;
}

function renderTrimChoices(vehicle, trims) {
  if (!trims.length) return `<p class="vehicle-calculator-empty">선택 가능한 트림 정보가 준비 중입니다.</p>`;

  return trims
    .map((trim, index) => {
      const checked = trim.id === currentTrimId ? " checked" : "";
      return `
        <label class="trim-choice">
          <input type="radio" name="vehicleTrim" value="${escapeHtml(trim.id)}"${checked} />
          <span>
            <strong>${escapeHtml(trim.name || `트림 ${index + 1}`)}</strong>
            ${trim.description ? `<small>${escapeHtml(trim.description)}</small>` : ""}
          </span>
          <em>${escapeHtml(formatWon(trim.price))}</em>
        </label>
      `;
    })
    .join("");
}

function renderOptionChoices(trim) {
  const options = (trim?.options || []).filter((option) => option?.name);
  if (!options.length) return `<p class="vehicle-calculator-empty">이 트림은 선택 가능한 옵션 정보가 준비 중입니다.</p>`;

  return options
    .map((option) => {
      const isIncluded = option.isDefault || option.badge === "기본";
      const checked = isIncluded || currentOptionIds.has(option.id) ? " checked" : "";
      const disabled = isIncluded ? " disabled" : "";
      return `
        <label class="option-choice${isIncluded ? " is-included" : ""}">
          <input type="checkbox" value="${escapeHtml(option.id)}"${checked}${disabled} />
          <span>
            <strong>${escapeHtml(option.name)}</strong>
            <small>${escapeHtml(option.category || "옵션")}${isIncluded ? " · 기본 포함" : ""}</small>
          </span>
          <em>${isIncluded ? "포함" : escapeHtml(formatSignedWon(option.price))}</em>
        </label>
      `;
    })
    .join("");
}

function renderVehicleCalculator() {
  if (!currentDetailVehicle || !vehicleDetailPanel) return;
  const trims = getDetailTrims(currentDetailVehicle);
  const selectedTrim = getSelectedTrim(currentDetailVehicle);
  const calculator = vehicleDetailPanel.querySelector("#vehicleCalculator");
  if (!calculator) return;
  calculator.innerHTML = `<div class="vehicle-calculator-head"><div><h4>트림·옵션 선택</h4><p>선택한 트림과 옵션의 월 납입료는 정식 견적에서 확인해 주세요.</p></div>
    <div class="estimate-price"><span>선택 조건 월 납입료</span><strong>가격 확인 필요</strong></div></div>
    <div class="vehicle-calculator-grid"><div><h5>트림 선택</h5><div class="trim-choice-list">${renderTrimChoices(currentDetailVehicle, trims)}</div></div>
    <div><h5>옵션 추가</h5><div class="option-choice-list">${renderOptionChoices(selectedTrim)}</div></div></div>
    <div class="calculation-box"><strong>선택 조건 확인</strong><p>선택 조건의 월 납입료는 가격 근거 확인 후 안내합니다. 정식 견적을 확인하거나 담당자에게 문의해 주세요.</p></div>
    <button class="calculator-quote-button quote-focus-button" type="button" data-vehicle="${escapeHtml(`${buildVehicleName(currentDetailVehicle)} ${selectedTrim?.name || ""}`.trim())}">이 조건으로 문의하기</button>`;
}

function renderVehicleDetail(vehicle) {
  const name = buildVehicleName(vehicle);
  const amount = window.recarPublicPrice.monthly(vehicle);
  const summaryMeta = [vehicle.trimCount ? `트림 ${vehicle.trimCount}종` : "", vehicle.badge || ""].filter(Boolean);
  const trims = getDetailTrims(vehicle);
  const paymentLabel = "기본 조건 월 납입료";

  currentDetailVehicle = vehicle;
  currentTrimId = trims[0]?.id || "";
  currentOptionIds = new Set();

  vehicleDetailPanel.hidden = false;
  vehicleDetailPanel.innerHTML = `
    <div class="vehicle-detail-head">
      <div>
        <h3>${escapeHtml(name)}</h3>
        <p>트림과 옵션을 선택하고 정확한 조건의 견적을 문의하세요.</p>
      </div>
      <button class="vehicle-detail-close" type="button">닫기</button>
    </div>
    <div class="vehicle-detail-layout">
      <div class="vehicle-detail-media">${renderDetailImage(vehicle)}</div>
      <div>
        <dl class="vehicle-detail-grid">
          <div><dt>브랜드</dt><dd>${escapeHtml(vehicle.brandLabel || vehicle.brand || "-")}</dd></div>
          <div><dt>차량명</dt><dd>${escapeHtml(vehicle.name || "-")}</dd></div>
          <div><dt>대표 트림</dt><dd>${escapeHtml(vehicle.trim || "-")}</dd></div>
          <div><dt>연식</dt><dd>${vehicle.year ? `${escapeHtml(vehicle.year)}년식` : "-"}</dd></div>
          ${summaryMeta.length ? `<div><dt>등급</dt><dd>${summaryMeta.map((item) => `<span class="detail-pill">${escapeHtml(item)}</span>`).join("")}</dd></div>` : ""}
          <div><dt>기본 조건</dt><dd>${escapeHtml(getVehicleConditionSummary(vehicle))}</dd></div>
          <div><dt>${paymentLabel}</dt><dd><strong>${amount ? `월 ${escapeHtml(formatWon(amount))}` : "가격 확인 필요"}</strong></dd></div>
        </dl>
      </div>
    </div>
    <div class="vehicle-calculator" id="vehicleCalculator"></div>
  `;
  renderVehicleCalculator();
  vehicleDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function showVehicleDetail(vehicleId) {
  if (!vehicleDetailPanel || !vehicleId) return;

  vehicleDetailPanel.hidden = false;
  vehicleDetailPanel.innerHTML = `<p class="vehicle-detail-loading">차량 상세 정보를 불러오는 중입니다.</p>`;
  vehicleDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });

  const generation = ++detailGeneration;
  detailAbortController?.abort();
  detailAbortController = new AbortController();
  try {
    const vehicle = await window.recarCatalog.detail(vehicleId, detailAbortController.signal);
    if (generation !== detailGeneration) return;
    if (!vehicle || vehicle.id !== vehicleId || !window.recarPublicPrice.isRental(vehicle)) throw new Error("vehicle_detail_failed");
    renderVehicleDetail(vehicle);
  } catch {
    if (generation !== detailGeneration) return;
    vehicleDetailPanel.innerHTML = `<p class="vehicle-error">차량 정보를 불러오지 못했습니다</p>`;
  }
}

function moveToQuote(vehicleName, focusTarget = "contact", context = {}) {
  const leadContext = normalizeLeadContext(context);

  if (!quoteSection) {
    const url = new URL("./index.html", window.location.href);
    if (vehicleName) {
      url.searchParams.set("vehicle", vehicleName);
    }
    if (focusTarget === "vehicle") {
      url.searchParams.set("focus", "vehicle");
    }
    if (leadContext.campaign) {
      url.searchParams.set("campaign", leadContext.campaign);
      url.searchParams.set("leadSource", leadContext.leadSource);
      url.searchParams.set("campaignLabel", leadContext.campaignLabel);
    }
    if (leadContext.timeDealOriginalMonthlyPayment) {
      url.searchParams.set("originalMonthly", String(leadContext.timeDealOriginalMonthlyPayment));
    }
    if (leadContext.timeDealMonthlyPayment) {
      url.searchParams.set("saleMonthly", String(leadContext.timeDealMonthlyPayment));
    }
    if (leadContext.timeDealDiscount) {
      url.searchParams.set("discount", String(leadContext.timeDealDiscount));
    }
    url.hash = "quote";
    window.location.href = url.toString();
    return;
  }

  setPendingLeadContext(leadContext);

  if (vehicleWishInput && vehicleName) {
    vehicleWishInput.value = vehicleName;
  }

  if (window.history?.replaceState) {
    const url = new URL(window.location.href);
    url.hash = "quote";
    window.history.replaceState(null, "", url.toString());
  }

  const quoteTop = quoteSection.getBoundingClientRect().top + window.scrollY - 64;
  const scrollTarget = Math.max(quoteTop, 0);
  window.scrollTo({ top: scrollTarget, behavior: "smooth" });
  document.scrollingElement?.scrollTo({ top: scrollTarget, behavior: "smooth" });

  window.setTimeout(() => {
    const target = focusTarget === "vehicle" ? vehicleWishInput : contactPhoneInput;
    try {
      target?.focus({ preventScroll: true });
    } catch {
      target?.focus();
    }
  }, 520);
}

function applyQuoteFromUrl() {
  if (!quoteSection) return;

  const params = new URLSearchParams(window.location.search);
  setPendingLeadContext({
    campaign: params.get("campaign") || "",
    leadSource: params.get("leadSource") || "",
    campaignLabel: params.get("campaignLabel") || "",
    timeDealOriginalMonthlyPayment: params.get("originalMonthly"),
    timeDealMonthlyPayment: params.get("saleMonthly"),
    timeDealDiscount: params.get("discount"),
  });

  const vehicleName = params.get("vehicle");
  if (vehicleName && vehicleWishInput) {
    vehicleWishInput.value = vehicleName;
  }

  if (params.get("focus") === "vehicle" && window.location.hash === "#quote") {
    window.setTimeout(() => vehicleWishInput?.focus(), 620);
  }
}

referralToggleButton?.addEventListener("click", () => {
  const expanded = referralToggleButton.getAttribute("aria-expanded") === "true";
  setReferralNoticeExpanded(!expanded);
});
referralCopyButton?.addEventListener("click", copyReferralCode);
referralCloseButton?.addEventListener("click", () => {
  if (!referralNotice) return;
  referralNotice.classList.remove("is-visible");
  setReferralNoticeExpanded(false);
  referralNotice.hidden = true;
  try {
    window.sessionStorage.setItem("recar_referral_notice_dismissed", activeReferralCode);
  } catch {
    // Dismissal only lasts for the current page when storage is blocked.
  }
});
document.addEventListener("click", (event) => {
  if (!referralNotice?.classList.contains("is-expanded") || referralNotice.contains(event.target)) return;
  setReferralNoticeExpanded(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setReferralNoticeExpanded(false);
});

function setFloatingContactState() {
  if (!floatingContact) return;
  const revealPoint = Math.max(420, window.innerHeight * 0.72);
  floatingContact.classList.toggle("is-visible", window.scrollY > revealPoint);
}

bestTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setVehicleFilter(tab.dataset.filter || "all");
  });
});

vehicleGrid?.addEventListener("click", (event) => {
  const quoteButton = event.target.closest(".vehicle-quote-button");
  if (quoteButton) {
    event.preventDefault();
    moveToQuote(quoteButton.dataset.vehicle || "", "contact", {
      campaign: quoteButton.dataset.campaign || "",
      leadSource: quoteButton.dataset.leadSource || "",
      campaignLabel: quoteButton.dataset.campaignLabel || "",
      timeDealOriginalMonthlyPayment: quoteButton.dataset.originalMonthly,
      timeDealMonthlyPayment: quoteButton.dataset.saleMonthly,
      timeDealDiscount: quoteButton.dataset.discount,
    });
    return;
  }

  const detailButton = event.target.closest(".vehicle-detail-button");
  if (detailButton) {
    showVehicleDetail(detailButton.dataset.vehicleId || "");
  }
});

function showVehicleImagePlaceholder(event) {
  if (event.target.tagName !== "IMG") return;
  const fallbackSrc = event.target.dataset.fallbackSrc;
  if (fallbackSrc) {
    event.target.dataset.fallbackSrc = "";
    event.target.src = fallbackSrc;
    return;
  }

  const wrapper = event.target.closest(".vehicle-image-wrap, .vehicle-detail-media");
  if (wrapper) {
    wrapper.innerHTML = `<div class="vehicle-image-placeholder">이미지 준비중</div>`;
  }
}

vehicleGrid?.addEventListener("error", showVehicleImagePlaceholder, true);
vehicleDetailPanel?.addEventListener("error", showVehicleImagePlaceholder, true);

vehicleDetailPanel?.addEventListener("click", (event) => {
  const closeButton = event.target.closest(".vehicle-detail-close");
  if (closeButton) {
    detailGeneration += 1;
    detailAbortController?.abort();
    vehicleDetailPanel.hidden = true;
    vehicleDetailPanel.innerHTML = "";
    currentDetailVehicle = null;
    return;
  }

  const quoteButton = event.target.closest(".calculator-quote-button");
  if (quoteButton) {
    event.preventDefault();
    const selectedTrim = currentDetailVehicle ? getSelectedTrim(currentDetailVehicle) : null;
    const selectedOptions = (selectedTrim?.options || []).filter((option) => !option.isDefault && option.badge !== "기본" && currentOptionIds.has(option.id));
    const optionText = selectedOptions.length ? ` / 옵션: ${selectedOptions.map((option) => option.name).join(", ")}` : "";
    moveToQuote(`${quoteButton.dataset.vehicle || ""}${optionText}`.trim());
  }
});

vehicleDetailPanel?.addEventListener("change", (event) => {
  if (!currentDetailVehicle) return;

  const trimInput = event.target.closest("input[name='vehicleTrim']");
  if (trimInput) {
    currentTrimId = trimInput.value;
    currentOptionIds = new Set();
    renderVehicleCalculator();
    return;
  }

  const optionInput = event.target.closest(".option-choice input[type='checkbox']");
  if (!optionInput || optionInput.disabled) return;

  if (optionInput.checked) currentOptionIds.add(optionInput.value);
  else currentOptionIds.delete(optionInput.value);
  renderVehicleCalculator();
});

document.querySelectorAll(".business-quote-button").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    moveToQuote(button.dataset.vehicle || "RE:CAR ONUS 법인차량");
  });
});

document.querySelectorAll(".quote-focus-button").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    moveToQuote(button.dataset.vehicle || "");
  });
});

document.querySelectorAll(".vehicle-search-button").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    moveToQuote("", "vehicle");
  });
});

window.addEventListener(
  "scroll",
  () => {
    setHeaderState();
    setFloatingContactState();
    updateActiveNavigation();
  },
  { passive: true },
);
showSlide(0);
startSlider();
window.setTimeout(() => ensureSlideImage((activeSlide + 1) % slides.length), 2200);
setHeaderState();
setFloatingContactState();
updateActiveNavigation();
initializeReferral();
applyQuoteFromUrl();
loadVehicles().then(stabilizeHashScroll);

window.addEventListener("hashchange", () => {
  window.setTimeout(stabilizeHashScroll, 50);
});

if (inquiryStickyCta && quoteSection && "IntersectionObserver" in window) {
  const inquiryCtaObserver = new IntersectionObserver(
    (entries) => {
      const isQuoteVisible = entries.some((entry) => entry.isIntersecting);
      inquiryStickyCta.classList.toggle("is-hidden", isQuoteVisible);
    },
    {
      rootMargin: "-18% 0px -26% 0px",
      threshold: 0.05,
    },
  );
  inquiryCtaObserver.observe(quoteSection);
}

if (window.lucide) {
  window.lucide.createIcons();
}
