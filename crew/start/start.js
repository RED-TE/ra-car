const API_BASE_URL = "https://api.recarplan.com";
const TOKEN_KEY = "recar_friends_access_token";
const CHECKLIST_KEY = "recar_crew_start_checklist_v1";
const POLL_INTERVAL_MS = 30000;

const previewPathPattern = /^\/crew\/start\/preview\/?$/;
const isPreview = previewPathPattern.test(window.location.pathname);
const numberFormatter = new Intl.NumberFormat("ko-KR");

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const previewStatus = {
  applied: true,
  status: "APPROVED",
  name: "리카 크루",
  crew_type: "REFERRAL",
};

const previewDashboard = {
  referral_code: "RECAR24",
  public_slug: "recar-crew",
  web_consultation_link: "https://recarplan.com/crew/recar-crew",
  crew_metrics: {
    app_referral_count: 3,
    web_inquiry_count: 5,
    link_visit_count: 12,
  },
};

const state = {
  status: null,
  dashboard: null,
  code: "",
  consultationLink: "",
  refreshing: false,
};

function select(selector) {
  return document.querySelector(selector);
}

function setText(selector, value) {
  const element = select(selector);
  if (element) element.textContent = String(value);
}

function firstText(values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function getPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function firstNumber(source, paths) {
  for (const path of paths) {
    const rawValue = getPath(source, path);
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    const value = Number(rawValue);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function statusValue(status) {
  return String(status?.status || "").trim().toUpperCase();
}

function accountState(status) {
  const value = statusValue(status);
  if (status?.applied === false || ["PENDING", "WAITING", "APPLIED"].includes(value)) return "pending";
  if (["APPROVED", "ACTIVE"].includes(value)) return "approved";
  if (["INACTIVE", "SUSPENDED", "DEACTIVATED", "DISABLED", "REJECTED"].includes(value)) return "inactive";
  return "error";
}

function resolveReferralCode(dashboard) {
  return firstText([
    dashboard?.referral_code,
    dashboard?.referral?.code,
    dashboard?.code,
  ]);
}

function resolveConsultationLink(status, dashboard) {
  const directLink = firstText([
    dashboard?.web_consultation_link,
    dashboard?.consultation_link,
    dashboard?.public_consultation_url,
    dashboard?.public_link,
    dashboard?.web?.consultation_link,
    status?.web_consultation_link,
    status?.consultation_link,
  ]);
  if (directLink) return directLink;

  const slug = firstText([
    dashboard?.public_slug,
    dashboard?.slug,
    dashboard?.referral?.public_slug,
    status?.public_slug,
    status?.slug,
  ]);
  return slug ? `https://recarplan.com/crew/${encodeURIComponent(slug)}` : "";
}

function guideUrl() {
  return new URL("/guide/rent-lease/", window.location.origin).href;
}

async function apiJson(path, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new ApiError("운영 정보를 불러오지 못했습니다.", response.status);
  }

  return response.json();
}

function formatMetric(value) {
  return value === null ? "-" : numberFormatter.format(value);
}

function setActionEnabled(selector, enabled) {
  const button = select(selector);
  if (button instanceof HTMLButtonElement) button.disabled = !enabled;
}

function renderAccount(status, dashboard) {
  const currentState = accountState(status);
  const crewName = firstText([status?.name, dashboard?.name, "크루"]);
  const accountChip = select("#accountChip");
  const accountNotice = select("#accountNotice");

  setText("#crewName", crewName);
  if (accountChip) accountChip.dataset.tone = currentState;
  if (accountNotice) accountNotice.dataset.tone = currentState;

  if (currentState === "approved") {
    setText("#accountChip", "승인 크루");
    setText("#accountNotice", "승인된 크루 계정입니다. 아래 실제 활동 도구를 사용할 수 있습니다.");
  } else if (currentState === "pending") {
    setText("#accountChip", "승인 대기");
    setText("#accountNotice", "크루 승인 대기 중입니다. 승인 후 추천 코드와 상담 링크가 활성화됩니다.");
  } else if (currentState === "inactive") {
    setText("#accountChip", "활동 비활성");
    setText(
      "#accountNotice",
      "현재 크루 활동이 비활성화되어 신규 접수용 링크를 사용할 수 없습니다. 기존 이력은 유지됩니다.",
    );
  } else {
    setText("#accountChip", "확인 필요");
    setText("#accountNotice", "계정 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }

  const canUseTools = currentState === "approved";
  state.code = canUseTools ? resolveReferralCode(dashboard) : "";
  state.consultationLink = canUseTools ? resolveConsultationLink(status, dashboard) : "";

  setText("#referralCode", state.code || (canUseTools ? "운영 API 연결 대기" : "승인 후 표시"));
  setText(
    "#consultationLink",
    state.consultationLink || (canUseTools ? "운영 API 연결 대기" : "승인 후 표시"),
  );
  const consultationElement = select("#consultationLink");
  if (consultationElement instanceof HTMLElement) {
    consultationElement.title = state.consultationLink || "";
  }
  setActionEnabled("#copyCodeButton", Boolean(state.code));
  setActionEnabled("#copyConsultationButton", Boolean(state.consultationLink));
}

function renderMetrics(dashboard) {
  const appReferralCount = firstNumber(dashboard, [
    "crew_metrics.app_referral_count",
    "app_referral_count",
    "signup_count",
    "metrics.app_referrals",
  ]);
  const webInquiryCount = firstNumber(dashboard, [
    "crew_metrics.web_inquiry_count",
    "web_inquiry_count",
    "web_consultation_count",
    "web_consultations.count",
    "metrics.web_inquiries",
  ]);
  const linkVisitCount = firstNumber(dashboard, [
    "crew_metrics.link_visit_count",
    "crew_metrics.unique_code_click_count",
    "link_visit_count",
    "unique_click_count",
    "click_count",
    "metrics.link_visits",
  ]);

  setText("#appReferralCount", formatMetric(appReferralCount));
  setText("#webInquiryCount", formatMetric(webInquiryCount));
  setText("#linkVisitCount", formatMetric(linkVisitCount));

  const unavailable = [
    appReferralCount === null ? "앱 추천 유입" : "",
    webInquiryCount === null ? "웹 상담 문의" : "",
    linkVisitCount === null ? "링크 방문" : "",
  ].filter(Boolean);

  setText(
    "#metricsNote",
    unavailable.length
      ? `${unavailable.join(", ")} 항목은 현재 운영 API 응답에 없어 대시로 표시합니다.`
      : "수치는 운영 API에서 불러오며 앱 추천과 웹 상담을 합산하지 않습니다.",
  );
}

function renderUnavailableMetrics(message) {
  setText("#appReferralCount", "-");
  setText("#webInquiryCount", "-");
  setText("#linkVisitCount", "-");
  setText("#metricsNote", message);
}

function renderUpdatedTime() {
  const now = new Date();
  setText(
    "#lastUpdated",
    `최근 상태 확인 ${now.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}`,
  );
}

function render(status, dashboard) {
  state.status = status;
  state.dashboard = dashboard;
  renderAccount(status, dashboard);
  if (accountState(status) === "approved" && dashboard) {
    renderMetrics(dashboard);
  } else {
    renderUnavailableMetrics("승인된 활성 크루의 운영 데이터만 표시합니다.");
  }
  renderUpdatedTime();
}

async function loadCrewData(options = {}) {
  if (state.refreshing) return;
  state.refreshing = true;
  const refreshButton = select("#refreshButton");
  if (refreshButton instanceof HTMLButtonElement) {
    refreshButton.disabled = true;
    refreshButton.textContent = "확인 중";
  }

  try {
    if (isPreview) {
      render(previewStatus, previewDashboard);
      return;
    }

    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      window.location.replace("/crew/login.html?next=%2Fcrew%2Fstart%2F");
      return;
    }

    const status = await apiJson("/api/v1/friends/status", token);
    let dashboard = null;
    if (accountState(status) === "approved") {
      dashboard = await apiJson("/api/v1/friends/dashboard", token);
    }
    render(status, dashboard);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.location.replace("/crew/login.html?next=%2Fcrew%2Fstart%2F");
      return;
    }

    if (!options.silent) {
      const fallbackStatus = state.status || { applied: true, status: "UNKNOWN", name: "크루" };
      renderAccount(fallbackStatus, state.dashboard);
      renderUnavailableMetrics("운영 API에 연결하지 못했습니다. 잠시 후 다시 확인해 주세요.");
      setText("#lastUpdated", "상태 확인 실패");
    }
  } finally {
    state.refreshing = false;
    if (refreshButton instanceof HTMLButtonElement) {
      refreshButton.disabled = false;
      refreshButton.textContent = "지금 새로고침";
    }
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function copyText(text, successMessage) {
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }
  } catch {
    fallbackCopy(text);
  }
  setText("#copyStatus", successMessage);
}

function setupCopyActions() {
  select("#copyCodeButton")?.addEventListener("click", () => {
    copyText(state.code, `추천인 코드 ${state.code}가 복사되었습니다.`);
  });

  select("#copyConsultationButton")?.addEventListener("click", () => {
    copyText(state.consultationLink, "개별 웹 상담 링크가 복사되었습니다.");
  });

  select("#copyGuideButton")?.addEventListener("click", () => {
    copyText(guideUrl(), "모두가 볼 수 있는 고객용 비교 가이드 링크가 복사되었습니다.");
  });
}

function setupPhraseBoard() {
  document.querySelectorAll(".phrase-switch").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.addEventListener("click", () => {
      const isSafe = button.getAttribute("aria-pressed") !== "true";
      const text = button.querySelector(".phrase-text");
      const label = button.querySelector(".phrase-state");
      if (!text || !label) return;

      if (!button.dataset.bannedText) button.dataset.bannedText = text.textContent || "";
      button.setAttribute("aria-pressed", String(isSafe));
      label.textContent = isSafe ? "권장 표현" : "사용 금지";
      text.textContent = isSafe ? button.dataset.safe || "" : button.dataset.bannedText;
      setText(
        "#phraseStatus",
        isSafe ? `권장 표현: ${button.dataset.safe}` : `금지 표현: ${button.dataset.bannedText}`,
      );
    });
  });
}

function readChecklist() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(CHECKLIST_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function updateChecklistCount() {
  const checked = document.querySelectorAll("#crewChecklist input:checked");
  setText("#checklistCount", checked.length);
}

function saveChecklist() {
  const checked = Array.from(document.querySelectorAll("#crewChecklist input:checked"))
    .filter((input) => input instanceof HTMLInputElement)
    .map((input) => input.value);
  window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checked));
  updateChecklistCount();
}

function setupChecklist() {
  const saved = new Set(readChecklist());
  document.querySelectorAll("#crewChecklist input").forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.checked = saved.has(input.value);
    input.addEventListener("change", saveChecklist);
  });
  updateChecklistCount();

  select("#clearChecklist")?.addEventListener("click", () => {
    document.querySelectorAll("#crewChecklist input").forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.checked = false;
    });
    window.localStorage.removeItem(CHECKLIST_KEY);
    updateChecklistCount();
  });
}

function setupRefresh() {
  select("#refreshButton")?.addEventListener("click", () => loadCrewData());

  if (!isPreview) {
    window.setInterval(() => {
      if (document.visibilityState === "visible") loadCrewData({ silent: true });
    }, POLL_INTERVAL_MS);
  }
}

function init() {
  if (isPreview) {
    const badge = select("#previewBadge");
    if (badge) badge.hidden = false;
  }
  setupCopyActions();
  setupPhraseBoard();
  setupChecklist();
  setupRefresh();
  loadCrewData();
}

init();
