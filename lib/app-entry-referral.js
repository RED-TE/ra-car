(() => {
  try {
    const url = new URL(window.location.href);
    const legacySections = new Set(["#quote", "#special", "#vehicles", "#guide", "#process", "#benefits", "#faq", "#top"]);
    let changed = false;
    if (legacySections.has(url.hash)) {
      url.hash = "";
      changed = true;
    }
    try {
      // Keep an existing app attribution; migrate only a valid legacy website code.
      if (!url.searchParams.has("ref") && !window.localStorage.getItem("flutter.recar_referral_code")) {
        const code = (window.localStorage.getItem("recar_referral_code") || "").trim().toUpperCase();
        if (/^RC-[A-Z0-9]{4,16}$/.test(code)) {
          url.searchParams.set("ref", code);
          changed = true;
        }
      }
    } catch (_) {
      // Anchor cleanup still works when browser storage is disabled.
    }
    if (changed) window.history.replaceState(window.history.state, "", url.href);
  } catch (_) {
    // Restricted browser history must never prevent the app from starting.
  }
})();
