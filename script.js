const header = document.querySelector(".site-header");
const navLinks = [...document.querySelectorAll(".nav-left a[href^='#'], .nav-right a[href='#business']")];
const mobileNavLinks = [...document.querySelectorAll(".mobile-bottom a[href^='#']")];
const slides = [...document.querySelectorAll(".hero-slide")];
const dots = [...document.querySelectorAll(".hero-dot")];
let activeSlide = 0;
let slideTimer;

function setHeaderState() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 40);
}

function showSlide(index) {
  if (!slides.length) return;

  activeSlide = (index + slides.length) % slides.length;

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
    link.classList.toggle("is-active", link.getAttribute("href") === `#${sectionId}`);
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

function getLeadPayload() {
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
    source: document.querySelector(".hero-slide.is-active h1")?.textContent.trim() || "RE:CAR",
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
    progressStatus: "선택",
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

  if (!serverResult || window.location.hostname === "recarplan.com") {
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

  const lead = getLeadPayload();

  if (!lead.vehicle) {
    setFormStatus("상담받을 차량을 입력해 주세요. 아직 정하지 못했다면 '미정'이라고 적어도 괜찮습니다.", "error");
    vehicleWishInput?.focus();
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

  if (!isValidPhone(lead.phone)) {
    setFormStatus("연락처 형식을 확인해 주세요. 예: 010-0000-0000", "error");
    contactPhoneInput?.focus();
    return;
  }

  const original = buttonText.textContent;
  button.disabled = true;
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
const vehicleMode = vehicleGrid?.dataset.vehicleMode || "home";
const defaultVehicleFilter = vehicleGrid?.dataset.defaultFilter || (vehicleMode === "all" ? "all" : "time");
const vehicleConditions = {
  term: 60,
  depositPct: 0,
  mileageLimit: 10000,
};
let activeVehicleFilter = defaultVehicleFilter;
let vehicleCards = [...document.querySelectorAll(".vehicle-card[data-category]")];
let currentDetailVehicle = null;
let currentTrimId = "";
let currentOptionIds = new Set();

const fallbackVehicles = [
  {
    id: "fallback-sorento",
    brand: "기아",
    brandLabel: "기아",
    name: "쏘렌토",
    trim: "하이브리드",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 397300,
    imageUrl: "./assets/danawa/vehicles/기아/쏘렌토/model_360.png",
    fallbackImageUrl: "./assets/vehicle-suv.jpg",
    categories: ["all", "time", "suv", "domestic"],
    categoryRanks: { all: 1, time: 1, suv: 1, domestic: 1 },
    badge: "가솔린",
    trimCount: 5,
  },
  {
    id: "fallback-carnival",
    brand: "기아",
    brandLabel: "기아",
    name: "카니발",
    trim: "프레스티지",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 440200,
    imageUrl: "./assets/danawa/vehicles/기아/카니발/model_360.png",
    fallbackImageUrl: "./assets/hero-family-suv.png",
    categories: ["all", "time", "suv", "domestic"],
    categoryRanks: { all: 2, time: 2, suv: 2, domestic: 2 },
    badge: "패밀리",
    trimCount: 5,
  },
  {
    id: "fallback-s-class",
    brand: "Mercedes-Benz",
    brandLabel: "Mercedes-Benz",
    name: "S-Class",
    trim: "S350d 4MATIC",
    fuel: "디젤",
    year: 2026,
    monthlyPayment: 1857300,
    imageUrl: "./assets/danawa/vehicles/벤츠/S-Class/model_360.png",
    fallbackImageUrl: "./assets/vehicle-premium.jpg",
    categories: ["all", "time", "sedan", "imported"],
    categoryRanks: { all: 3, time: 3, sedan: 5, imported: 1 },
    badge: "의전",
    trimCount: 3,
  },
  {
    id: "fallback-x6",
    brand: "BMW",
    brandLabel: "BMW",
    name: "X6",
    trim: "xDrive",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 1269000,
    imageUrl: "./assets/danawa/vehicles/BMW/X6/model_360.png",
    fallbackImageUrl: "./assets/hero-bmw.png",
    categories: ["all", "time", "suv", "imported"],
    categoryRanks: { all: 4, time: 4, suv: 5, imported: 2 },
    badge: "수입",
    trimCount: 4,
  },
  {
    id: "fallback-sportage",
    brand: "기아",
    brandLabel: "기아",
    name: "스포티지",
    trim: "시그니처",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 347800,
    imageUrl: "./assets/danawa/vehicles/기아/스포티지/model_360.png",
    fallbackImageUrl: "./assets/vehicle-suv.jpg",
    categories: ["all", "time", "suv", "domestic"],
    categoryRanks: { all: 5, time: 5, suv: 3, domestic: 3 },
    badge: "가솔린",
    trimCount: 4,
  },
  {
    id: "fallback-grandeur",
    brand: "현대",
    brandLabel: "현대",
    name: "그랜저",
    trim: "프리미엄",
    fuel: "하이브리드",
    year: 2025,
    monthlyPayment: 459000,
    imageUrl: "./assets/danawa/vehicles/현대/그랜저/model_360.png",
    fallbackImageUrl: "./assets/vehicle-sedan.jpg",
    categories: ["all", "sedan", "domestic"],
    categoryRanks: { all: 6, sedan: 1, domestic: 4 },
    badge: "세단",
    trimCount: 5,
  },
  {
    id: "fallback-g80",
    brand: "제네시스",
    brandLabel: "제네시스",
    name: "G80",
    trim: "2.5 터보",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 684000,
    imageUrl: "./assets/danawa/vehicles/제네시스/G80/model_360.png",
    fallbackImageUrl: "./assets/vehicle-sedan.jpg",
    categories: ["all", "sedan", "domestic"],
    categoryRanks: { all: 7, sedan: 2, domestic: 5 },
    badge: "프리미엄",
    trimCount: 4,
  },
  {
    id: "fallback-k8",
    brand: "기아",
    brandLabel: "기아",
    name: "K8",
    trim: "노블레스",
    fuel: "하이브리드",
    year: 2025,
    monthlyPayment: 432000,
    imageUrl: "./assets/danawa/vehicles/기아/K8/model_360.png",
    fallbackImageUrl: "./assets/vehicle-sedan.jpg",
    categories: ["all", "sedan", "domestic"],
    categoryRanks: { all: 8, sedan: 3, domestic: 6 },
    badge: "세단",
    trimCount: 4,
  },
  {
    id: "fallback-5-series",
    brand: "BMW",
    brandLabel: "BMW",
    name: "5 Series",
    trim: "530i",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 819000,
    imageUrl: "./assets/danawa/vehicles/BMW/5 Series/model_360.png",
    fallbackImageUrl: "./assets/hero-bmw.png",
    categories: ["all", "sedan", "imported"],
    categoryRanks: { all: 9, sedan: 4, imported: 3 },
    badge: "수입",
    trimCount: 5,
  },
  {
    id: "fallback-model-y",
    brand: "Tesla",
    brandLabel: "Tesla",
    name: "Model Y",
    trim: "Long Range",
    fuel: "전기",
    year: 2025,
    monthlyPayment: 699000,
    imageUrl: "./assets/danawa/vehicles/테슬라/Model Y/model_360.png",
    fallbackImageUrl: "./assets/hero-tesla.png",
    categories: ["all", "suv", "imported"],
    categoryRanks: { all: 10, suv: 4, imported: 4 },
    badge: "전기차",
    trimCount: 3,
  },
];

function getAppApiBase() {
  return window.location.protocol === "file:" ? "http://localhost:5173" : "";
}

const curatedFallbackVehicles = [
  {
    id: "curated-sorento",
    brand: "기아",
    brandLabel: "기아",
    name: "쏘렌토",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 518000,
    imageUrl: "./assets/danawa/vehicles/기아/쏘렌토/model_360.png",
    fallbackImageUrl: "./assets/vehicle-suv.jpg",
    categories: ["all", "suv", "domestic"],
    categoryRanks: { all: 1, suv: 1, domestic: 1 },
    badge: "장기렌트",
    trimCount: 5,
  },
  {
    id: "curated-carnival",
    brand: "기아",
    brandLabel: "기아",
    name: "카니발",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 540140,
    imageUrl: "./assets/danawa/vehicles/기아/카니발/model_360.png",
    fallbackImageUrl: "./assets/hero-family-suv.png",
    categories: ["all", "suv", "domestic"],
    categoryRanks: { all: 2, suv: 2, domestic: 2 },
    badge: "패밀리",
    trimCount: 5,
  },
  {
    id: "curated-sportage",
    brand: "기아",
    brandLabel: "기아",
    name: "스포티지",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 440300,
    imageUrl: "./assets/danawa/vehicles/기아/스포티지/model_360.png",
    fallbackImageUrl: "./assets/vehicle-suv.jpg",
    categories: ["all", "suv", "domestic"],
    categoryRanks: { all: 3, suv: 3, domestic: 3 },
    badge: "장기렌트",
    trimCount: 4,
  },
  {
    id: "curated-x7",
    brand: "BMW",
    brandLabel: "BMW",
    name: "X7",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 1751500,
    imageUrl: "./assets/danawa/vehicles/BMW/X7/model_360.png",
    fallbackImageUrl: "./assets/hero-bmw.png",
    categories: ["all", "suv", "imported"],
    categoryRanks: { all: 4, suv: 4, imported: 5 },
    badge: "리스",
    trimCount: 4,
  },
  {
    id: "curated-niro",
    brand: "기아",
    brandLabel: "기아",
    name: "니로",
    trim: "하이브리드",
    fuel: "하이브리드",
    year: 2025,
    monthlyPayment: 465400,
    imageUrl: "./assets/danawa/vehicles/기아/더 뉴 니로/model_360.png",
    fallbackImageUrl: "./assets/vehicle-suv.jpg",
    categories: ["all", "suv", "domestic"],
    categoryRanks: { all: 5, suv: 5, domestic: 4 },
    badge: "장기렌트",
    trimCount: 4,
  },
  {
    id: "curated-tucson",
    brand: "현대",
    brandLabel: "현대",
    name: "투싼",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 435030,
    imageUrl: "./assets/danawa/vehicles/현대/투싼/model_360.png",
    fallbackImageUrl: "./assets/vehicle-suv.jpg",
    categories: ["all", "suv", "domestic"],
    categoryRanks: { all: 6, suv: 6, domestic: 5 },
    badge: "장기렌트",
    trimCount: 4,
  },
  {
    id: "curated-grandeur",
    brand: "현대",
    brandLabel: "현대",
    name: "그랜저",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 621500,
    imageUrl: "./assets/danawa/vehicles/현대/그랜저/model_360.png",
    fallbackImageUrl: "./assets/vehicle-sedan.jpg",
    categories: ["all", "sedan", "domestic"],
    categoryRanks: { all: 7, sedan: 1, domestic: 6 },
    badge: "장기렌트",
    trimCount: 5,
  },
  {
    id: "curated-g90",
    brand: "제네시스",
    brandLabel: "제네시스",
    name: "G90",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 1445100,
    imageUrl: "./assets/danawa/vehicles/제네시스/G90/model_360.png",
    fallbackImageUrl: "./assets/vehicle-sedan.jpg",
    categories: ["all", "sedan", "domestic"],
    categoryRanks: { all: 8, sedan: 2, domestic: 7 },
    badge: "의전",
    trimCount: 4,
  },
  {
    id: "curated-g80",
    brand: "제네시스",
    brandLabel: "제네시스",
    name: "G80",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 826800,
    imageUrl: "./assets/danawa/vehicles/제네시스/G80/model_360.png",
    fallbackImageUrl: "./assets/vehicle-sedan.jpg",
    categories: ["all", "sedan", "domestic"],
    categoryRanks: { all: 9, sedan: 3, domestic: 8 },
    badge: "장기렌트",
    trimCount: 4,
  },
  {
    id: "curated-s-class",
    brand: "Mercedes-Benz",
    brandLabel: "Mercedes-Benz",
    name: "S-Class",
    trim: "최저등급",
    fuel: "디젤",
    year: 2026,
    monthlyPayment: 1775900,
    imageUrl: "./assets/danawa/vehicles/벤츠/S-Class/model_360.png",
    fallbackImageUrl: "./assets/vehicle-premium.jpg",
    categories: ["all", "sedan", "imported"],
    categoryRanks: { all: 10, sedan: 4, imported: 6 },
    badge: "리스",
    trimCount: 3,
  },
  {
    id: "curated-7-series",
    brand: "BMW",
    brandLabel: "BMW",
    name: "7 Series",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 1926800,
    imageUrl: "./assets/danawa/vehicles/BMW/7 Series/model_360.png",
    fallbackImageUrl: "./assets/hero-bmw.png",
    categories: ["all", "sedan", "imported"],
    categoryRanks: { all: 11, sedan: 5, imported: 7 },
    badge: "리스",
    trimCount: 4,
  },
  {
    id: "curated-k8",
    brand: "기아",
    brandLabel: "기아",
    name: "K8",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 587050,
    imageUrl: "./assets/danawa/vehicles/기아/K8/model_360.png",
    fallbackImageUrl: "./assets/vehicle-sedan.jpg",
    categories: ["all", "sedan", "domestic"],
    categoryRanks: { all: 12, sedan: 6, domestic: 9 },
    badge: "장기렌트",
    trimCount: 4,
  },
  {
    id: "curated-e-class",
    brand: "Mercedes-Benz",
    brandLabel: "Mercedes-Benz",
    name: "E-Class",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 811600,
    imageUrl: "./assets/danawa/vehicles/벤츠/E-Class/model_360.png",
    fallbackImageUrl: "./assets/vehicle-premium.jpg",
    categories: ["all", "imported"],
    categoryRanks: { all: 13, imported: 1 },
    badge: "리스",
    trimCount: 4,
  },
  {
    id: "curated-5-series",
    brand: "BMW",
    brandLabel: "BMW",
    name: "5 Series",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 793000,
    imageUrl: "./assets/danawa/vehicles/BMW/5 Series/model_360.png",
    fallbackImageUrl: "./assets/hero-bmw.png",
    categories: ["all", "imported"],
    categoryRanks: { all: 14, imported: 2 },
    badge: "리스",
    trimCount: 5,
  },
  {
    id: "curated-model-y",
    brand: "Tesla",
    brandLabel: "Tesla",
    name: "Model Y",
    trim: "최저등급",
    fuel: "전기",
    year: 2025,
    monthlyPayment: 794020,
    imageUrl: "./assets/danawa/vehicles/테슬라/Model Y/model_360.png",
    fallbackImageUrl: "./assets/hero-tesla.png",
    categories: ["all", "imported"],
    categoryRanks: { all: 15, imported: 3 },
    badge: "장기렌트",
    trimCount: 3,
  },
  {
    id: "curated-x5",
    brand: "BMW",
    brandLabel: "BMW",
    name: "X5",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 1349100,
    imageUrl: "./assets/danawa/vehicles/BMW/X5/model_360.png",
    fallbackImageUrl: "./assets/hero-bmw.png",
    categories: ["all", "imported"],
    categoryRanks: { all: 16, imported: 4 },
    badge: "리스",
    trimCount: 4,
  },
  {
    id: "curated-gle",
    brand: "Mercedes-Benz",
    brandLabel: "Mercedes-Benz",
    name: "GLE",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 1360800,
    imageUrl: "./assets/danawa/vehicles/벤츠/GLE-Class/model_360.png",
    fallbackImageUrl: "./assets/vehicle-premium.jpg",
    categories: ["all", "imported"],
    categoryRanks: { all: 17, imported: 5 },
    badge: "리스",
    trimCount: 4,
  },
  {
    id: "curated-a6",
    brand: "Audi",
    brandLabel: "Audi",
    name: "A6",
    trim: "최저등급",
    fuel: "가솔린",
    year: 2025,
    monthlyPayment: 906400,
    imageUrl: "./assets/danawa/vehicles/아우디/A6/model_360.png",
    fallbackImageUrl: "./assets/vehicle-premium.jpg",
    categories: ["all", "imported"],
    categoryRanks: { all: 18, imported: 6 },
    badge: "리스",
    trimCount: 3,
  },
];

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

function renderImageMarkup(vehicle) {
  const label = escapeHtml(buildVehicleName(vehicle));
  const imageUrl = vehicle.imageUrl || vehicle.fallbackImageUrl;

  if (!imageUrl) {
    return `<div class="vehicle-image-wrap"><div class="vehicle-image-placeholder">이미지 준비중</div></div>`;
  }

  const fallback = vehicle.fallbackImageUrl && vehicle.fallbackImageUrl !== imageUrl ? ` data-fallback-src="${escapeHtml(vehicle.fallbackImageUrl)}"` : "";
  return `<div class="vehicle-image-wrap"><img src="${escapeHtml(imageUrl)}" alt="${label}" loading="eager" decoding="async" fetchpriority="high"${fallback} /></div>`;
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

function renderVehicleCard(vehicle) {
  const name = buildVehicleName(vehicle);
  const category = (vehicle.categories || [defaultVehicleFilter]).join(" ");
  const ranks = vehicle.categoryRanks || {};
  const rankAttributes = Object.entries(ranks)
    .map(([key, value]) => `data-rank-${escapeHtml(key)}="${escapeHtml(value)}"`)
    .join(" ");
  const monthly = formatWon(vehicle.monthlyPayment);
  const trim = vehicle.trim || "대표 트림";
  const year = vehicle.year ? `${vehicle.year}년식` : "연식 확인";
  const subtitle = vehicle.subtitle || [vehicle.fuel, year].filter(Boolean).join(" · ");
  const meta = [vehicle.trimCount ? `트림 ${vehicle.trimCount}종` : ""].filter(Boolean);
  const quoteBadge = vehicle.calculation?.isSpreadsheetPrice ? "기준가격" : vehicle.calculation?.isEstimated ? "예상견적" : vehicle.usedQuoteFallback ? "대표견적" : "최저견적";
  const badges = [vehicle.badge || vehicle.fuel, vehicle.instantDeliveryAvailable ? "즉시출고" : "", quoteBadge]
    .filter(Boolean)
    .slice(0, 3);
  return `
    <article class="vehicle-card" data-category="${escapeHtml(category)}" data-vehicle-id="${escapeHtml(vehicle.id)}" ${rankAttributes}>
      ${renderImageMarkup(vehicle)}
      <div class="vehicle-body">
        <div class="badge-row">
          ${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
        </div>
        <h3><span>${escapeHtml(vehicle.brandLabel || vehicle.brand || "브랜드")}</span>${escapeHtml(vehicle.name || "차량")}</h3>
        <p class="vehicle-specs">${escapeHtml(trim)}${subtitle ? ` · ${escapeHtml(subtitle)}` : ""}</p>
        ${meta.length ? `<div class="vehicle-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        <div class="price"><small>월</small> ${escapeHtml(monthly)}</div>
        <div class="vehicle-actions">
          <a class="vehicle-quote-button" href="#quote" data-vehicle="${escapeHtml(`${name} ${trim}`.trim())}">문의하기</a>
        </div>
      </div>
    </article>
  `;
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

function getTimeDealWindow() {
  const duration = 48 * 60 * 60 * 1000;
  const startedAt = Math.floor(Date.now() / duration) * duration;

  return {
    seed: Math.floor(startedAt / duration),
    endsAt: startedAt + duration,
  };
}

function seededShuffle(items, seed) {
  const result = [...items];
  let value = seed || 1;

  for (let index = result.length - 1; index > 0; index -= 1) {
    value = (value * 9301 + 49297) % 233280;
    const swapIndex = value % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function decorateFallbackVehiclesForTimeDeals(vehicles) {
  const { seed } = getTimeDealWindow();
  const dealIds = new Set(
    seededShuffle(
      vehicles.filter((vehicle) => vehicle.imageUrl || vehicle.fallbackImageUrl),
      seed,
    )
      .slice(0, 6)
      .map((vehicle) => vehicle.id),
  );

  return vehicles.map((vehicle) => {
    const categories = new Set(vehicle.categories || []);
    const categoryRanks = { ...(vehicle.categoryRanks || {}) };
    if (dealIds.has(vehicle.id)) {
      categories.add("time");
      categoryRanks.time = [...dealIds].indexOf(vehicle.id) + 1;
    } else {
      categories.delete("time");
      delete categoryRanks.time;
    }

    return {
      ...vehicle,
      categories: [...categories],
      categoryRanks,
    };
  });
}

function formatTimeLeft(ms) {
  const safeMs = Math.max(0, ms);
  const hours = Math.floor(safeMs / (60 * 60 * 1000));
  const minutes = Math.floor((safeMs % (60 * 60 * 1000)) / (60 * 1000));
  return `${String(hours).padStart(2, "0")}시간 ${String(minutes).padStart(2, "0")}분`;
}

function updateTimeDealTimer() {
  const condition = document.querySelector(".vehicle-condition");
  if (!condition || vehicleMode !== "home") return;

  const { endsAt } = getTimeDealWindow();
  const left = endsAt - Date.now();
  condition.innerHTML = `60개월 · 선납금 0% · 연 10,000km 기준입니다. <strong class="time-deal-timer">타임특가 갱신까지 ${formatTimeLeft(left)}</strong>`;
}

function renderFallbackVehicles() {
  if (vehicleError) vehicleError.hidden = true;
  if (!vehicleGrid) return;

  const decoratedVehicles = decorateFallbackVehiclesForTimeDeals(curatedFallbackVehicles);
  const items = vehicleMode === "all" ? decoratedVehicles : decoratedVehicles.filter((vehicle) => vehicle.categories?.includes(defaultVehicleFilter));
  vehicleGrid.setAttribute("aria-busy", "false");
  vehicleGrid.innerHTML = items.map(renderVehicleCard).join("");
  refreshVehicleCards();
  setVehicleFilter(activeVehicleFilter);
  updateTimeDealTimer();
}

async function loadVehicles() {
  if (!vehicleGrid) return;

  try {
    const params = new URLSearchParams({
      term: String(vehicleConditions.term),
      deposit_pct: String(vehicleConditions.depositPct),
      mileage_limit: String(vehicleConditions.mileageLimit),
      page: "1",
      size: "100",
    });
    if (vehicleMode === "all") {
      params.set("mode", "all");
    }
    const response = await requestJson(`${getAppApiBase()}/api/recar/vehicles?${params.toString()}`);
    const payload = response.data;

    if (!response.ok || !payload.ok || !Array.isArray(payload.items) || !payload.items.length) {
      throw new Error(payload.error || "vehicle_load_failed");
    }

    if (vehicleError) vehicleError.hidden = true;
    vehicleGrid.setAttribute("aria-busy", "false");
    vehicleGrid.innerHTML = payload.items.map(renderVehicleCard).join("");
    refreshVehicleCards();
    setVehicleFilter(activeVehicleFilter);
  } catch (error) {
    renderFallbackVehicles();
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

function getVehicleBasePrice(vehicle, trims = getDetailTrims(vehicle)) {
  return Number(vehicle.basePrice || vehicle.priceFrom || trims[0]?.price || 0);
}

function getResidualRatio(vehicle, basePrice) {
  const quoteRatio = Number(vehicle.bestQuote?.residualRatio ?? vehicle.calculation?.residualRatio);
  if (Number.isFinite(quoteRatio) && quoteRatio > 0 && quoteRatio < 1) return quoteRatio;

  const residualValue = Number(vehicle.bestQuote?.residualValue ?? vehicle.calculation?.residualValue);
  if (Number.isFinite(residualValue) && residualValue > 0 && basePrice > 0) {
    return Math.min(0.75, Math.max(0.2, residualValue / basePrice));
  }

  return 0.45;
}

function getAnnualIrr(vehicle) {
  const annualIrr = Number(vehicle.bestQuote?.annualIrr ?? vehicle.calculation?.annualIrr);
  return Number.isFinite(annualIrr) && annualIrr > 0 ? annualIrr : 0.076;
}

function calculateLeaseLikeMonthly(price, residualRatio, annualIrr, term, depositPct, isImported) {
  if (!price || price <= 0) return 0;

  const prepayRatio = Math.max(0, 1 - depositPct / 100);
  const capCost = price * prepayRatio;
  const residualValue = price * residualRatio;
  const depreciation = Math.max(0, (capCost - residualValue) / term);
  const financeCharge = ((capCost + residualValue) / 2) * (annualIrr / 12);
  const serviceFeeRate = isImported ? 0.00065 : 0.00048;
  const operationFee = Math.max(18000, price * serviceFeeRate);

  return Math.max(0, Math.round((depreciation + financeCharge + operationFee) / 100) * 100);
}

function calculateVehicleEstimate(vehicle, trim, selectedOptions) {
  const trims = getDetailTrims(vehicle);
  const basePrice = getVehicleBasePrice(vehicle, trims);
  const trimPrice = Number(trim?.price || basePrice || 0);
  const optionTotal = selectedOptions.reduce((sum, option) => sum + Number(option.price || 0), 0);
  const selectedPrice = trimPrice + optionTotal;
  const baseMonthly = Number(vehicle.monthlyPayment || 0);
  const term = Number(vehicle.conditions?.term || vehicleConditions.term || 60);
  const depositPct = Number(vehicle.conditions?.depositPct || vehicleConditions.depositPct || 0);
  const residualRatio = getResidualRatio(vehicle, basePrice);
  const annualIrr = getAnnualIrr(vehicle);
  const priceDelta = selectedPrice - basePrice;
  const payableRatio = Math.max(0, 1 - residualRatio);
  const prepayRatio = Math.max(0, 1 - depositPct / 100);
  const isImported = (vehicle.categories || []).includes("imported");
  const deltaFinanceFactor = ((1 + residualRatio) / 2) * (annualIrr / 12);
  const usesInternalEstimate = vehicle.calculation?.quoteSource === "estimated";
  const deltaOperationFactor = usesInternalEstimate ? (isImported ? 0.00065 : 0.00048) : 0;
  const monthlyDelta = Math.round((priceDelta * prepayRatio * (payableRatio / term + deltaFinanceFactor + deltaOperationFactor)) / 100) * 100;
  const estimatedMonthly = usesInternalEstimate
    ? calculateLeaseLikeMonthly(selectedPrice, residualRatio, annualIrr, term, depositPct, isImported)
    : Math.max(0, Math.round((baseMonthly + monthlyDelta) / 100) * 100);

  return {
    basePrice,
    trimPrice,
    optionTotal,
    selectedPrice,
    baseMonthly,
    term,
    depositPct,
    residualRatio,
    annualIrr,
    priceDelta,
    monthlyDelta,
    estimatedMonthly,
    isEstimated: Boolean(vehicle.calculation?.isEstimated),
    isSpreadsheetPrice: Boolean(vehicle.calculation?.isSpreadsheetPrice),
  };
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
  const selectedOptions = (selectedTrim?.options || []).filter((option) => !option.isDefault && option.badge !== "기본" && currentOptionIds.has(option.id));
  const estimate = calculateVehicleEstimate(currentDetailVehicle, selectedTrim, selectedOptions);
  const bestQuote = currentDetailVehicle.bestQuote || {};
  const calculator = vehicleDetailPanel.querySelector("#vehicleCalculator");
  if (!calculator) return;
  const basePaymentLabel = estimate.isSpreadsheetPrice ? "가격표 기준 월납" : estimate.isEstimated ? "예상 기준 월납" : "API 최저 월납";
  const irrText = estimate.annualIrr ? ` · IRR ${formatPercent(estimate.annualIrr)}` : "";
  const spreadsheetText = currentDetailVehicle.calculation?.spreadsheetPricing
    ? ` · ${new Intl.NumberFormat("ko-KR").format(currentDetailVehicle.calculation.spreadsheetPricing.requestedAnnualKm || 10000)}km 기준`
    : "";

  calculator.innerHTML = `
    <div class="vehicle-calculator-head">
      <div>
        <h4>트림·옵션 선택</h4>
        <p>선택한 차량가 차액에 잔존가치와 IRR 기준금리를 함께 반영한 예상 금액입니다.</p>
      </div>
      <div class="estimate-price">
        <span>예상 월 납입료</span>
        <strong>월 ${escapeHtml(formatWon(estimate.estimatedMonthly))}</strong>
        <small>${escapeHtml(formatSignedWon(estimate.monthlyDelta))}</small>
      </div>
    </div>
    <div class="vehicle-calculator-grid">
      <div>
        <h5>트림 선택</h5>
        <div class="trim-choice-list">${renderTrimChoices(currentDetailVehicle, trims)}</div>
      </div>
      <div>
        <h5>옵션 추가</h5>
        <div class="option-choice-list">${renderOptionChoices(selectedTrim)}</div>
      </div>
    </div>
    <div class="calculation-box">
      <strong>계산 기준</strong>
      <p>${basePaymentLabel} ${escapeHtml(formatWon(estimate.baseMonthly))} + 선택차액 ${escapeHtml(formatSignedWon(estimate.priceDelta))} × 잔가율 ${formatPercent(estimate.residualRatio)} × 선납 반영 ${(1 - estimate.depositPct / 100).toFixed(2)}${irrText}${spreadsheetText} = 예상 월납 ${escapeHtml(formatWon(estimate.estimatedMonthly))}</p>
      <small>엑셀 가격표가 있는 차량은 해당 기준 금액을 우선 적용합니다. 주행거리, 옵션, 실제 심사, 프로모션, 보험 조건에 따라 최종 금액은 달라질 수 있습니다.</small>
    </div>
    <button class="calculator-quote-button quote-focus-button" type="button" data-vehicle="${escapeHtml(`${buildVehicleName(currentDetailVehicle)} ${selectedTrim?.name || ""}`.trim())}">이 조건으로 문의하기</button>
    ${
      bestQuote.financeCompanyKr
        ? `<p class="calculator-finance">${bestQuote.isSpreadsheetPrice ? "가격표 기준" : bestQuote.isEstimated ? "참고 계산 기준" : "현재 최저 금융사 기준"}: ${escapeHtml(bestQuote.financeCompanyKr)}</p>`
        : ""
    }
  `;
}

function renderVehicleDetail(vehicle) {
  const name = buildVehicleName(vehicle);
  const bestQuote = vehicle.bestQuote || {};
  const quotes = (vehicle.quotes || []).slice(0, 5);
  const summaryMeta = [vehicle.trimCount ? `트림 ${vehicle.trimCount}종` : "", vehicle.badge || ""].filter(Boolean);
  const trims = getDetailTrims(vehicle);
  const paymentLabel = vehicle.calculation?.isSpreadsheetPrice ? "가격표 기준 월납" : vehicle.calculation?.isEstimated ? "예상 월납" : "API 최저 월납";
  const basisItems = [
    vehicle.calculation?.isSpreadsheetPrice ? "엑셀 가격표 우선" : "",
    vehicle.calculation?.spreadsheetPricing?.productLabel ? vehicle.calculation.spreadsheetPricing.productLabel : "",
    vehicle.calculation?.spreadsheetPricing?.requestedAnnualKm ? `연 ${new Intl.NumberFormat("ko-KR").format(vehicle.calculation.spreadsheetPricing.requestedAnnualKm)}km` : "",
    vehicle.calculation?.residualRatio ? `잔가율 ${formatPercent(vehicle.calculation.residualRatio)}` : "",
    vehicle.calculation?.annualIrr ? `IRR ${formatPercent(vehicle.calculation.annualIrr)}` : "",
    vehicle.calculation?.isEstimated && !vehicle.calculation?.isSpreadsheetPrice ? "예상 산식" : "",
  ].filter(Boolean);

  currentDetailVehicle = vehicle;
  currentTrimId = trims[0]?.id || "";
  currentOptionIds = new Set();

  vehicleDetailPanel.hidden = false;
  vehicleDetailPanel.innerHTML = `
    <div class="vehicle-detail-head">
      <div>
        <h3>${escapeHtml(name)}</h3>
        <p>트림과 옵션을 선택해 예상 월 납입료 변화를 확인하세요.</p>
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
          <div><dt>기본 조건</dt><dd>${vehicle.conditions?.term || 60}개월 · 선납금 ${vehicle.conditions?.depositPct || 0}% · 연 ${new Intl.NumberFormat("ko-KR").format(vehicle.conditions?.mileageLimit || 10000)}km</dd></div>
          <div><dt>${paymentLabel}</dt><dd><strong>월 ${escapeHtml(formatWon(vehicle.monthlyPayment))}</strong>${bestQuote.financeCompanyKr ? ` · ${escapeHtml(bestQuote.financeCompanyKr)}` : ""}</dd></div>
          ${basisItems.length ? `<div><dt>계산 기준</dt><dd>${basisItems.map((item) => `<span class="detail-pill">${escapeHtml(item)}</span>`).join("")}</dd></div>` : ""}
        </dl>
      </div>
    </div>
    <div class="vehicle-calculator" id="vehicleCalculator"></div>
    ${
      quotes.length
        ? `<h4 class="vehicle-detail-subtitle">금융사 견적</h4><ul class="vehicle-detail-list">${quotes
            .map((quote) => `<li><strong>${escapeHtml(quote.financeCompanyKr || quote.financeCompany || "견적")}</strong> · 월 ${escapeHtml(formatWon(quote.monthlyPayment))}${quote.isSpreadsheetPrice ? " · 기준표" : quote.isEstimated ? " · 참고" : ""}</li>`)
            .join("")}</ul>`
        : ""
    }
  `;
  renderVehicleCalculator();
  vehicleDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function showVehicleDetail(vehicleId) {
  if (!vehicleDetailPanel || !vehicleId) return;

  vehicleDetailPanel.hidden = false;
  vehicleDetailPanel.innerHTML = `<p class="vehicle-detail-loading">차량 상세 정보를 불러오는 중입니다.</p>`;
  vehicleDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const params = new URLSearchParams({
      term: String(vehicleConditions.term),
      deposit_pct: String(vehicleConditions.depositPct),
      mileage_limit: String(vehicleConditions.mileageLimit),
    });
    const response = await requestJson(`${getAppApiBase()}/api/recar/vehicles/${encodeURIComponent(vehicleId)}?${params.toString()}`);
    const payload = response.data;

    if (!response.ok || !payload.ok || !payload.vehicle) {
      throw new Error(payload.error || "vehicle_detail_failed");
    }

    renderVehicleDetail(payload.vehicle);
  } catch (error) {
    vehicleDetailPanel.innerHTML = `<p class="vehicle-error">차량 정보를 불러오지 못했습니다</p>`;
  }
}

function moveToQuote(vehicleName, focusTarget = "contact") {
  if (!quoteSection) {
    const url = new URL("./index.html", window.location.href);
    if (vehicleName) {
      url.searchParams.set("vehicle", vehicleName);
    }
    if (focusTarget === "vehicle") {
      url.searchParams.set("focus", "vehicle");
    }
    url.hash = "quote";
    window.location.href = url.toString();
    return;
  }

  if (vehicleWishInput && vehicleName) {
    vehicleWishInput.value = vehicleName;
  }

  quoteSection?.scrollIntoView({ behavior: "smooth", block: "start" });

  window.setTimeout(() => {
    const target = focusTarget === "vehicle" ? vehicleWishInput : contactPhoneInput;
    target?.focus();
  }, 520);
}

function applyQuoteFromUrl() {
  if (!quoteSection) return;

  const params = new URLSearchParams(window.location.search);
  const vehicleName = params.get("vehicle");
  if (vehicleName && vehicleWishInput) {
    vehicleWishInput.value = vehicleName;
  }

  if (params.get("focus") === "vehicle" && window.location.hash === "#quote") {
    window.setTimeout(() => vehicleWishInput?.focus(), 620);
  }
}

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
    moveToQuote(quoteButton.dataset.vehicle || "");
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
setHeaderState();
setFloatingContactState();
updateActiveNavigation();
applyQuoteFromUrl();
loadVehicles();
updateTimeDealTimer();
if (vehicleMode === "home") {
  window.setInterval(updateTimeDealTimer, 60 * 1000);
}

if (window.lucide) {
  window.lucide.createIcons();
}
