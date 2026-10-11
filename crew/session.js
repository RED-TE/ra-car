(function () {
  "use strict";
  const TOKEN_KEY = "recar_friends_access_token";
  const API_BASE = "https://api.recarplan.com";
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
      return await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal });
    } catch (error) {
      if (error.name === "AbortError") throw new Error("응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
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

  window.RecarCrew = Object.freeze({ TOKEN_KEY, request, errorMessage, dateKey, referralUrl, notices });
})();
