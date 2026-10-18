(function () {
  "use strict";
  const TOKEN_KEY = "recar_friends_access_token";
  const API_BASE = "https://api.recarplan.com";
  const RESUME_KEY = "recar_crew_auto_navigation";
  const RESUME_WINDOW_MS = 30000;
  const MAX_AUTO_NAVIGATIONS = 2;
  const notices = {
    PENDING: "가입 신청이 접수되어 승인 대기 중입니다. 운영팀 확인 후 신청하신 연락처로 안내드립니다.",
    REJECTED: "신청을 승인하지 못했습니다. 보완 또는 재신청 안내는 운영팀에 문의해 주세요.",
    SUSPENDED: "크루 계정 이용이 제한되어 있습니다. 운영팀에 문의해 주세요.",
    NOT_APPLIED: "가입 신청 내역을 확인하지 못했습니다. 크루 신청 또는 운영팀 문의를 이용해 주세요.",
    EXPIRED: "로그인 시간이 만료됐습니다. 다시 로그인해 주세요.",
    LOGGED_OUT: "로그아웃했습니다.",
  };

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${API_BASE}${path}`, { ...options, cache: "no-store", signal: controller.signal });
      // Keep the timeout until the JSON body has arrived without consuming the caller's response.
      await response.clone().text();
      return response;
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") throw new Error("응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
      throw new Error("서버에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      clearTimeout(timeout);
    }
  }

  async function errorMessage(response, fallback) {
    let body;
    try { body = await response.json(); } catch { /* Use the status-specific fallback. */ }
    const candidates = [body?.error?.message, body?.error?.detail, body?.message, body?.detail?.message, body?.detail];
    const message = candidates.find(value => typeof value === "string" && value.trim());
    if (message) return message;
    if (response.status >= 500) return "서비스에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.";
    if (response.status === 429) return "요청이 많아 잠시 기다려야 합니다. 잠시 후 다시 시도해 주세요.";
    return fallback;
  }

  function dateKey(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type).value).join("-");
  }

  function referralUrl(code) {
    const value = String(code || "").trim().toUpperCase();
    return /^RC-[A-Z0-9]{4,16}$/.test(value) ? `https://recarplan.com/app/?ref=${encodeURIComponent(value)}` : "";
  }

  function resetAutoNavigation() {
    try { window.sessionStorage.removeItem(RESUME_KEY); } catch { /* Manual login remains available. */ }
  }

  function resumeDashboard() {
    // A tab-local budget also stops cycles introduced by a stale entry document.
    try {
      const now = Date.now();
      const previous = JSON.parse(window.sessionStorage.getItem(RESUME_KEY) || "null");
      const recent = previous && Number.isFinite(previous.startedAt) && previous.startedAt <= now
        && now - previous.startedAt < RESUME_WINDOW_MS && Number.isInteger(previous.count) && previous.count >= 0;
      if (recent && previous.count >= MAX_AUTO_NAVIGATIONS) return false;
      window.sessionStorage.setItem(RESUME_KEY, JSON.stringify({
        startedAt: recent ? previous.startedAt : now,
        count: recent ? previous.count + 1 : 1,
      }));
    } catch { return false; }
    window.location.replace("./index.html");
    return true;
  }

  window.RecarCrew = Object.freeze({ TOKEN_KEY, request, errorMessage, dateKey, referralUrl, notices, resumeDashboard, resetAutoNavigation });
})();
