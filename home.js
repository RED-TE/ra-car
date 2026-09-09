(() => {
  "use strict";
  if (!document.body.classList.contains("public-home")) return;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = matchMedia("(max-width: 600px)");
  const behavior = () => reducedMotion.matches ? "instant" : "smooth";
  const grid = $(".vehicle-grid");
  const state = { items: [], market: "domestic", brand: "all", body: "all", product: "all", query: "", sort: "default", loading: false };
  const domestic = ["현대", "기아", "제네시스", "르노", "KGM", "쉐보레"];
  const logoBrands = new Set(["현대", "기아", "제네시스", "르노", "KGM", "쉐보레", "테슬라", "벤츠", "BMW", "아우디", "볼보", "렉서스", "랜드로버", "미니", "폴스타", "포르쉐", "페라리"]);
  const brandNames = { Renault: "르노", "Mercedes-Benz": "벤츠", Volvo: "볼보", Tesla: "테슬라", Lexus: "렉서스", Audi: "아우디" };
  const brandOf = (item) => brandNames[item.brandLabel || item.brand] || item.brandLabel || item.brand || "";
  const productOf = (item) => item.calculation?.product || (item.fuel === "리스" ? "lease" : "rent");
  const productLabel = (item) => productOf(item) === "lease" ? "리스" : "장기렌트";
  const nameOf = (item) => [brandOf(item), item.name, item.trim].filter(Boolean).join(" ");
  const logo = (brand) => logoBrands.has(brand) ? `<img src="./assets/danawa/brands/${encodeURIComponent(brand)}/logo.png" alt="${escape(brand)}" width="40" height="26" loading="lazy" />` : `<b>${escape(brand.slice(0, 3))}</b>`;
  const safeImage = (value) => {
    if (!value) return "";
    try {
      const url = new URL(value, location.href);
      return ["http:", "https:", "file:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  };
  const priceOf = (item) => Number.isFinite(Number(item.monthlyPayment)) && Number(item.monthlyPayment) > 0 ? Number(item.monthlyPayment).toLocaleString("ko-KR") : "";
  const imageOf = (item) => {
    const src = safeImage(item.imageUrl);
    return src ? `<img src="${escape(src)}" alt="${escape([brandOf(item), item.name].join(" "))}" width="360" height="240" loading="lazy" />` : '<span class="image-missing">이미지 준비 중</span>';
  };

  function card(item) {
    const price = priceOf(item);
    const quoteClass = item.calculation?.isEstimated || item.usedQuoteFallback ? "예상 월 납입료" : "상담 전 안내 가격";
    return `<article class="home-vehicle" data-vehicle-id="${escape(item.id)}">
      <a class="home-vehicle-link" href="#quote" data-home-quote="${escape(nameOf(item))}">
        <div class="home-car-image">${imageOf(item)}</div>
        <div class="home-car-copy"><div class="home-car-title">${logo(brandOf(item))}<h3>${escape(item.name)}</h3></div>
        <p class="home-car-trim">${escape(item.trim || "세부 조건 상담")}</p>
        <div class="home-car-price">${price ? `<span>월</span><strong>${price}</strong><small>원</small>` : '<strong>상담 문의</strong>'}</div>
        <p class="home-car-type">${productLabel(item)} · ${escape(quoteClass)}</p></div>
      </a><a class="vehicle-quote-button" href="#quote" data-vehicle="${escape(nameOf(item))}">이 조건 견적 문의</a>
    </article>`;
  }

  function renderBrands() {
    const brands = [...new Set(state.items.map(brandOf).filter(Boolean))];
    for (const market of ["domestic", "imported"]) {
      const choices = brands.filter(brand => domestic.includes(brand) === (market === "domestic"));
      const row = $(`#${market}Brands`);
      row.innerHTML = `<button type="button" data-brand="all" data-brand-market="${market}" aria-label="${market === "domestic" ? "국산차" : "수입차"} 전체" aria-pressed="false"><b>All</b><span>전체</span></button>` + choices.map(brand => `<button type="button" data-brand="${escape(brand)}" data-brand-market="${market}" aria-pressed="false">${logo(brand)}<span>${escape(brand)}</span></button>`).join("");
    }
  }

  function syncControls() {
    $$("[data-market]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.market === state.market)));
    $$("[data-brand]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.brand === state.brand && (state.market === "all" || button.dataset.brandMarket === state.market))));
    $$("[data-brand-group]").forEach(row => { row.hidden = mobile.matches && state.market !== "all" && state.market !== row.dataset.brandGroup; });
    $$("[data-body]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.body === state.body)));
  }

  function arrows() {
    $("[data-catalog-prev]").disabled = grid.scrollLeft <= 2;
    $("[data-catalog-next]").disabled = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 2;
  }

  function renderCatalog() {
    const query = state.query.toLocaleLowerCase().replace(/\s/g, "");
    const items = state.items.filter(item => {
      const brand = brandOf(item);
      return (state.market === "all" || domestic.includes(brand) === (state.market === "domestic")) &&
        (state.brand === "all" || brand === state.brand) &&
        (state.body === "all" || (item.categories || []).includes(state.body)) &&
        (state.product === "all" || productOf(item) === state.product) &&
        (!query || `${nameOf(item)} ${item.brand || ""}`.toLocaleLowerCase().replace(/\s/g, "").includes(query));
    });
    if (state.sort === "price") items.sort((a, b) => (Number(a.monthlyPayment) || Infinity) - (Number(b.monthlyPayment) || Infinity));
    if (state.sort === "name") items.sort((a, b) => nameOf(a).localeCompare(nameOf(b), "ko"));
    const limit = mobile.matches ? 3 : 24;
    grid.innerHTML = items.slice(0, limit).map(card).join("");
    grid.setAttribute("aria-busy", "false");
    grid.scrollLeft = 0;
    $("#catalogEmpty").hidden = items.length > 0;
    $("#catalogCount").textContent = `${items.length}개 차량`;
    syncControls();
    requestAnimationFrame(arrows);
  }

  function renderCollection() {
    const featuredIds = [
      "static-기아셀토스",
      "static-쉐보레트레일블레이저",
      "static-기아스포티지",
      "static-현대투싼",
      "static-기아쏘렌토",
      "static-현대싼타페",
      "static-현대팰리세이드",
      "static-제네시스gv70",
      "static-제네시스gv80",
      "static-teslamodely",
      "static-volvoxc40",
      "static-bmwx3"
    ];
    const byId = new Map(state.items.filter(item => item.categories?.includes("suv")).map(item => [item.id, item]));
    const items = featuredIds.map(id => byId.get(id)).filter(Boolean);
    $("#suvCollection").innerHTML = items.length ? items.map(item => `<a class="collection-card" href="#quote" data-home-quote="${escape(nameOf(item))}"><h3>${escape(brandOf(item))} ${escape(item.name)}</h3><p>${escape(item.trim || "세부 조건 상담")}</p><strong>${priceOf(item) ? `<small>월 </small>${priceOf(item)}<small> 원</small>` : '상담 문의'}</strong>${imageOf(item)}<span>견적 문의</span></a>`).join("") : '<p>등록된 SUV 차량이 없습니다. 전체 차량에서 확인해 주세요.</p>';
  }

  async function loadCatalog(request) {
    if (state.loading) return;
    state.loading = true;
    grid.setAttribute("aria-busy", "true");
    grid.innerHTML = '<div class="catalog-loading" role="status">차량 정보를 불러오고 있습니다.</div>';
    $("#vehicleError").hidden = true;
    $("#catalogEmpty").hidden = true;
    try {
      // The existing public catalog is already priced. Never derive a new quote in this view.
      let response;
      try {
        response = await request("./data/vehicle-static-catalog.json?v=20260909-margin-v1");
      } catch { response = null; }
      if (!response?.ok || !Array.isArray(response.data?.items)) {
        response = await request("/api/recar/vehicles?term=60&deposit_pct=0&mileage_limit=10000&page=1&size=100&mode=all");
      }
      if (!response.ok || response.data?.ok === false || !Array.isArray(response.data?.items)) throw new Error("catalog_unavailable");
      state.items = response.data.items.filter(item => item && typeof item.id === "string" && typeof item.name === "string");
      const date = response.data.generatedAt ? new Date(response.data.generatedAt) : null;
      $("#catalogDate").textContent = date && !Number.isNaN(date.getTime()) ? `카탈로그 기준 ${date.toLocaleDateString("ko-KR")}` : "상담 전 안내 가격";
      renderBrands();
      renderCatalog();
      renderCollection();
    } catch {
      state.items = [];
      grid.innerHTML = "";
      grid.setAttribute("aria-busy", "false");
      $("#vehicleError").hidden = false;
      $("#catalogCount").textContent = "";
      $("#catalogDate").textContent = "정보 확인 필요";
      $("#suvCollection").innerHTML = '<p>차량 정보를 불러오지 못했습니다. 차량 목록에서 다시 불러오기를 눌러주세요.</p>';
      arrows();
    } finally { state.loading = false; }
  }

  document.addEventListener("click", event => {
    const market = event.target.closest("[data-market]");
    const brand = event.target.closest("[data-brand]");
    const body = event.target.closest("[data-body]");
    const reset = event.target.closest("[data-filter-reset]");
    if (market) { state.market = market.dataset.market; state.brand = "all"; }
    if (brand) { state.brand = brand.dataset.brand; state.market = brand.dataset.brandMarket; }
    if (body) state.body = body.dataset.body;
    if (reset) { state.market = "all"; state.brand = "all"; state.body = "all"; state.product = "all"; state.query = ""; $("#homeSearch").value = ""; $("#catalogProduct").value = "all"; }
    if (market || brand || body || reset) renderCatalog();
    const quote = event.target.closest("[data-home-quote]");
    if (quote) { event.preventDefault(); window.moveToQuote(quote.dataset.homeQuote); }
    const guide = event.target.closest('.guide-card[href^="#"]');
    if (guide) {
      const target = $(guide.getAttribute("href"));
      if (target?.tagName === "DETAILS") target.open = true;
    }
  });
  $(".home-search").addEventListener("submit", event => {
    event.preventDefault();
    state.query = $("#homeSearch").value.trim();
    state.market = "all"; state.brand = "all"; state.body = "all";
    renderCatalog();
    $("#special").scrollIntoView({ behavior: behavior() });
  });
  $("#catalogSort").addEventListener("change", event => { state.sort = event.target.value; renderCatalog(); });
  $("#catalogProduct").addEventListener("change", event => { state.product = event.target.value; renderCatalog(); });
  $("[data-catalog-retry]").addEventListener("click", () => window.loadVehicles());
  for (const [selector, target, direction] of [["[data-catalog-prev]", grid, -1], ["[data-catalog-next]", grid, 1], ["[data-collection-prev]", $("#suvCollection"), -1], ["[data-collection-next]", $("#suvCollection"), 1]]) {
    $(selector).addEventListener("click", () => target.scrollBy({ left: (target.clientWidth + 28) * direction, behavior: behavior() }));
  }
  grid.addEventListener("scroll", arrows, { passive: true });
  mobile.addEventListener("change", () => { if (state.items.length) renderCatalog(); });
  document.addEventListener("error", event => {
    if (!(event.target instanceof HTMLImageElement)) return;
    const container = event.target.closest(".home-car-image");
    if (container) container.innerHTML = '<span class="image-missing">이미지 준비 중</span>';
    else if (event.target.closest(".collection-card")) {
      const placeholder = document.createElement("p"); placeholder.textContent = "이미지 준비 중";
      event.target.replaceWith(placeholder);
    }
  }, true);
  $$("[data-guide]").forEach(button => button.addEventListener("click", () => {
    $$("[data-guide]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    $$("[data-guide-topic]").forEach(card => { card.hidden = button.dataset.guide !== "all" && card.dataset.guideTopic !== button.dataset.guide; });
  }));

  const menu = $("#homeMenu"), menuToggle = $(".home-menu-toggle");
  const closeMenu = () => menu.close();
  menuToggle.addEventListener("click", () => { menu.showModal(); menuToggle.setAttribute("aria-expanded", "true"); });
  $("[data-close-menu]").addEventListener("click", closeMenu);
  menu.addEventListener("click", event => {
    const rect = menu.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (event.target.closest("a") || (event.target === menu && outside)) closeMenu();
  });
  menu.addEventListener("close", () => { menuToggle.setAttribute("aria-expanded", "false"); });
  $("[data-back-top]").addEventListener("click", () => window.scrollTo({ top: 0, behavior: behavior() }));

  const slides = $$(".promotion-slide");
  const pauseButton = $("[data-slide-pause]");
  let current = 0, timer, paused = reducedMotion.matches, hover = false;
  function show(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const offset = (i - current + slides.length) % slides.length;
      slide.dataset.position = offset === 0 ? "center" : offset === 1 ? "next" : offset === slides.length - 1 ? "prev" : "off";
      slide.classList.toggle("is-current", offset === 0);
      slide.inert = offset !== 0;
    });
    $(".promotion-count b").textContent = String(current + 1);
  }
  function schedule() {
    clearInterval(timer);
    if (!paused && !hover && !document.hidden && !$(".home-promotions").contains(document.activeElement)) timer = setInterval(() => show(current + 1), 5000);
  }
  function pauseState() {
    pauseButton.setAttribute("aria-label", paused ? "배너 자동 재생 시작" : "배너 자동 재생 일시정지");
    pauseButton.title = paused ? "자동 재생 시작" : "자동 재생 일시정지";
    pauseButton.innerHTML = `<i data-lucide="${paused ? "play" : "pause"}" aria-hidden="true"></i>`;
    window.lucide?.createIcons();
    schedule();
  }
  $("[data-slide-prev]").addEventListener("click", () => { show(current - 1); schedule(); });
  $("[data-slide-next]").addEventListener("click", () => { show(current + 1); schedule(); });
  pauseButton.addEventListener("click", () => { paused = !paused; pauseState(); });
  $(".promotion-stage").addEventListener("mouseenter", () => { hover = true; schedule(); });
  $(".promotion-stage").addEventListener("mouseleave", () => { hover = false; schedule(); });
  $(".home-promotions").addEventListener("focusin", schedule);
  $(".home-promotions").addEventListener("focusout", () => setTimeout(schedule, 0));
  document.addEventListener("visibilitychange", schedule);
  reducedMotion.addEventListener("change", () => { paused = reducedMotion.matches; pauseState(); });
  let touchX = null;
  $(".promotion-stage").addEventListener("touchstart", event => { touchX = event.touches[0].clientX; }, { passive: true });
  $(".promotion-stage").addEventListener("touchend", event => {
    if (touchX === null) return;
    const delta = event.changedTouches[0].clientX - touchX;
    if (Math.abs(delta) > 45) { show(current + (delta < 0 ? 1 : -1)); schedule(); }
    touchX = null;
  }, { passive: true });
  pauseState();

  const form = $(".quote-form");
  const status = $(".form-status");
  const quickQuoteDialog = $("#quickQuoteDialog");
  const quickQuoteMount = $("[data-quick-quote-mount]");
  const persistentQuoteButton = $(".persistent-quote-button");
  const mobileQuoteButton = $(".mobile-consult");
  const formHome = form.parentNode;
  const formAnchor = document.createComment("quote-form-home");
  let quickQuoteLauncher = null;
  let quickQuoteTimer = 0;
  formHome.insertBefore(formAnchor, form);

  const restoreQuoteForm = () => {
    if (form.parentNode !== formHome) formHome.insertBefore(form, formAnchor.nextSibling);
    delete form.dataset.entryPoint;
    document.body.classList.remove("quick-quote-open");
  };
  const closeQuickQuote = () => {
    if (!quickQuoteDialog.open || quickQuoteDialog.classList.contains("is-closing")) return;
    quickQuoteDialog.classList.remove("is-opening");
    quickQuoteDialog.classList.add("is-closing");
    window.clearTimeout(quickQuoteTimer);
    quickQuoteTimer = window.setTimeout(() => quickQuoteDialog.close(), reducedMotion.matches ? 0 : 160);
  };
  const openQuickQuote = (launcher) => {
    if (quickQuoteDialog.open) return;
    quickQuoteLauncher = launcher;
    launcher.classList.add("is-launching");
    window.clearTimeout(quickQuoteTimer);
    quickQuoteTimer = window.setTimeout(() => {
      launcher.classList.remove("is-launching");
      form.dataset.entryPoint = "하단 간편 문의";
      quickQuoteMount.append(form);
      document.body.classList.add("quick-quote-open");
      quickQuoteDialog.classList.remove("is-closing");
      quickQuoteDialog.showModal();
      quickQuoteDialog.classList.add("is-opening");
      window.setTimeout(() => $("#contactPhone")?.focus(), reducedMotion.matches ? 0 : 220);
    }, reducedMotion.matches ? 0 : 220);
  };
  persistentQuoteButton.addEventListener("click", () => openQuickQuote(persistentQuoteButton));
  mobileQuoteButton.addEventListener("click", event => {
    event.preventDefault();
    openQuickQuote(mobileQuoteButton);
  });
  $("[data-close-quick-quote]").addEventListener("click", closeQuickQuote);
  quickQuoteDialog.addEventListener("cancel", event => {
    event.preventDefault();
    closeQuickQuote();
  });
  quickQuoteDialog.addEventListener("click", event => {
    const rect = quickQuoteDialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (event.target === quickQuoteDialog && outside) closeQuickQuote();
  });
  quickQuoteDialog.addEventListener("close", () => {
    quickQuoteDialog.classList.remove("is-opening", "is-closing");
    restoreQuoteForm();
    quickQuoteLauncher?.focus();
    quickQuoteLauncher = null;
  });
  status.id = "homeFormStatus";
  form.querySelectorAll("input[required]").forEach(input => {
    input.setAttribute("aria-describedby", status.id);
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
  });
  form.addEventListener("submit", () => {
    form.querySelectorAll("input[required]").forEach(input => input.removeAttribute("aria-invalid"));
    setTimeout(() => {
      if (status.classList.contains("is-error") && form.contains(document.activeElement) && document.activeElement.tagName === "INPUT") document.activeElement.setAttribute("aria-invalid", "true");
    }, 0);
  });
  window.recarHome = { loadCatalog };
})();
