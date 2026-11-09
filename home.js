(() => {
  "use strict";
  if (!document.body.classList.contains("public-home")) return;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const appEntry = new URL("/app/", location.href);
  const campaignKeys = /^(ref|utm_(source|medium|campaign|term|content|id)|gclid|fbclid|msclkid|n_keyword|n_campaign_type|NaPm)$/;
  for (const [key, value] of new URLSearchParams(location.search)) {
    if (campaignKeys.test(key) && value.length <= 2048) appEntry.searchParams.set(key, value);
  }
  $$('[data-app-entry]').forEach(link => { link.href = appEntry.pathname + appEntry.search; });
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = matchMedia("(max-width: 600px)");
  const behavior = () => reducedMotion.matches ? "instant" : "smooth";
  const grid = $(".vehicle-grid");
  const state = { items: [], market: "domestic", brand: "all", body: "all", product: "all", query: "", sort: "default", loading: false };
  const domestic = ["현대", "기아", "제네시스", "르노", "KGM", "쉐보레"];
  const logoBrands = new Set(["현대", "기아", "제네시스", "르노", "KGM", "쉐보레", "테슬라", "벤츠", "BMW", "아우디", "볼보", "렉서스", "랜드로버", "미니", "폴스타", "포르쉐", "페라리"]);
  const brandNames = { Hyundai: "현대", Kia: "기아", Genesis: "제네시스", Chevrolet: "쉐보레", Renault: "르노", "Mercedes-Benz": "벤츠", Volvo: "볼보", Tesla: "테슬라", Lexus: "렉서스", Audi: "아우디" };
  const brandOf = (item) => brandNames[item.brandLabel || item.brand] || item.brandLabel || item.brand || "";
  const productOf = (item) => item.productType === "RENTAL" ? "rent" : null;
  const conditionSummary = (item) => priceOf(item)
    ? "장기렌트 · 60개월 · 선납금 0% · 연 10,000km"
    : "장기렌트 · 가격 확인 필요";
  const nameOf = (item) => [brandOf(item), item.name, item.trim].filter(Boolean).join(" ");
  const inquiryData = item => `data-inquiry-brand="${escape(brandOf(item))}" data-inquiry-model="${escape(item.name)}" data-inquiry-product="RENTAL" data-inquiry-term="60" data-inquiry-mileage="10000"`;
  const logo = (brand) => logoBrands.has(brand) ? `<img src="/assets/danawa/brands/${encodeURIComponent(brand)}/logo.png" alt="${escape(brand)}" width="40" height="26" loading="lazy" />` : `<b>${escape(brand.slice(0, 3))}</b>`;
  const safeImage = (value) => {
    if (!value) return "";
    try {
      const url = new URL(value, new URL("/", location.href));
      return ["http:", "https:", "file:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  };
  const priceOf = (item) => window.recarPublicPrice.monthly(item)?.toLocaleString("ko-KR") || "";
  const imageOf = (item) => {
    const src = safeImage(item.imageUrl);
    return src ? `<img src="${escape(src)}" alt="${escape([brandOf(item), item.name].join(" "))}" width="360" height="240" loading="lazy" />` : '<span class="image-missing">이미지 준비 중</span>';
  };
  // Retain the archived card rail without manufacturing a timed offer.
  function renderTimeDeals() {
    const dealGrid = $("#timeDealGrid");
    if (!dealGrid) return;
    const section = dealGrid.closest(".home-time-deals");
    section?.removeAttribute("data-window-hours");
    if ($("#timeDealTitle")) $("#timeDealTitle").textContent = "장기렌트 조건 확인";
    if (section?.querySelector(".time-deal-kicker")) section.querySelector(".time-deal-kicker").textContent = "확인된 기본 조건";
    if (section?.querySelector(".time-deal-heading p")) section.querySelector(".time-deal-heading p").textContent = "선택 조건에 맞는 가격 근거가 확인된 차량입니다.";
    if (section?.querySelector(".time-deal-clock")) section.querySelector(".time-deal-clock").hidden = true;
    if (section?.querySelector(".time-deal-note")) section.querySelector(".time-deal-note").textContent = "장기렌트 · 60개월 · 선납금 0% · 연 10,000km. 보증금 원본 기재 여부와 최종 계약 조건은 별도 확인이 필요합니다.";
    const items = state.items.filter(item => priceOf(item)).slice(0, 3);
    dealGrid.innerHTML = items.length ? items.map(item => `<article class="time-deal-card" data-vehicle-id="${escape(item.id)}" ${inquiryData(item)}>
      <div class="time-deal-image">${imageOf(item)}<span>장기렌트</span></div>
      <div class="time-deal-copy"><h3><small>${escape(brandOf(item))}</small>${escape(item.name)}</h3>
        <div class="time-deal-prices"><strong><span>예상 월납</span> 월 ${priceOf(item)}<small>원</small></strong></div>
        <a href="#quote" data-home-quote="${escape(nameOf(item))}">이 조건 견적 문의 <span aria-hidden="true">→</span></a>
      </div></article>`).join("") : '<p class="time-deal-loading">현재 가격 근거를 확인한 차량이 없습니다. 원하는 조건을 문의해 주세요.</p>';
    dealGrid.setAttribute("aria-busy", "false");
  }

  function card(item) {
    const price = priceOf(item);
    const quoteClass = price ? "예상 월납 · 보증금과 최종 조건 별도 확인" : "가격 근거 확인 전";
    return `<article class="home-vehicle" data-vehicle-id="${escape(item.id)}" ${inquiryData(item)}>
      <a class="home-vehicle-link" href="#quote" data-home-quote="${escape(nameOf(item))}">
        <div class="home-car-image">${imageOf(item)}</div>
        <div class="home-car-copy"><div class="home-car-title">${logo(brandOf(item))}<h3>${escape(item.name)}</h3></div>
        <p class="home-car-trim">${escape(conditionSummary(item))}</p>
        <div class="home-car-price">${price ? `<span>월</span><strong>${price}</strong><small>원</small>` : '<strong>가격 확인 필요</strong>'}</div>
        <p class="home-car-type">${escape(quoteClass)}</p></div>
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
        (state.body === "all" || window.recarPublicPrice.categories(item).includes(state.body)) &&
        (state.product === "all" || productOf(item) === state.product) &&
        (!query || `${nameOf(item)} ${item.brand || ""}`.toLocaleLowerCase().replace(/\s/g, "").includes(query));
    });
    if (state.sort === "price") items.sort((a, b) => (window.recarPublicPrice.monthly(a) || Infinity) - (window.recarPublicPrice.monthly(b) || Infinity));
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
    const seen = new Set();
    const items = state.items.filter(item => {
      const key = `${brandOf(item)}:${item.name}`;
      if (!window.recarPublicPrice.categories(item).includes("suv") || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
    $("#suvCollection").innerHTML = items.length ? items.map(item => `<a class="collection-card" href="#quote" data-home-quote="${escape(nameOf(item))}" ${inquiryData(item)}><h3>${escape(brandOf(item))} ${escape(item.name)}</h3><p>${escape(conditionSummary(item))}</p><strong>${priceOf(item) ? `<small>월 </small>${priceOf(item)}<small> 원</small>` : '가격 확인 필요'}</strong>${imageOf(item)}<span>견적 문의</span></a>`).join("") : '<p>등록된 SUV 차량이 없습니다. 전체 차량에서 확인해 주세요.</p>';
  }

  async function loadCatalog() {
    if (state.loading) return;
    state.loading = true;
    state.items = [];
    grid.setAttribute("aria-busy", "true");
    grid.innerHTML = '<div class="catalog-loading" role="status">차량 정보를 불러오고 있습니다.</div>';
    $("#suvCollection").innerHTML = '<p>차량 정보를 불러오고 있습니다.</p>';
    renderTimeDeals();
    $("#vehicleError").hidden = true;
    $("#catalogEmpty").hidden = true;
    try {
      const items = await window.recarCatalog.load();
      if (!Array.isArray(items)) throw new Error("catalog_unavailable");
      state.items = items.filter(item => window.recarPublicPrice.isRental(item) && typeof item.id === "string" && typeof item.name === "string");
      $("#catalogDate").textContent = "장기렌트 · 가격 근거 확인된 조건만 표시";
      renderBrands();
      renderCatalog();
      renderCollection();
      renderTimeDeals();
    } catch {
      state.items = [];
      grid.innerHTML = "";
      grid.setAttribute("aria-busy", "false");
      $("#vehicleError").hidden = false;
      $("#catalogCount").textContent = "";
      $("#catalogDate").textContent = "정보 확인 필요";
      $("#suvCollection").innerHTML = '<p>차량 정보를 불러오지 못했습니다. 차량 목록에서 다시 불러오기를 눌러주세요.</p>';
      if ($("#timeDealGrid")) {
        $("#timeDealGrid").innerHTML = '<p class="time-deal-loading">차량 가격 근거를 확인하지 못했습니다.</p>';
        $("#timeDealGrid").setAttribute("aria-busy", "false");
      }
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
    if (quote) {
      event.preventDefault();
      window.moveToQuote(quote.dataset.homeQuote, "contact", {
        campaign: quote.dataset.campaign || "",
        leadSource: quote.dataset.leadSource || "",
        campaignLabel: quote.dataset.campaignLabel || "",
      });
    }
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
  $("#catalogProduct").innerHTML = '<option value="all">장기렌트 전체</option><option value="rent">장기렌트</option>';
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
  const catalogBasis = $(".catalog-basis");
  if (catalogBasis) catalogBasis.innerHTML = '<span><b>구매방식</b> 장기렌트</span><span><b>초기비용</b> 선납금 0% · 보증금 별도 확인</span><span><b>계약기간</b> 60개월</span><span><b>연간 주행거리</b> 10,000km</span>';
  if ($(".home-price-note")) $(".home-price-note").textContent = "금액은 선택 조건 근거가 확인된 예상 월납입니다. 보증금 원본 기재 여부와 최종 계약 조건은 별도 확인이 필요합니다.";
  if ($(".collection-note")) $(".collection-note").textContent = "장기렌트 · 60개월 · 선납금 0% · 연 10,000km. 보증금과 최종 계약 조건 별도 확인";
  renderTimeDeals();
  window.recarHome = { loadCatalog, renderTimeDeals };
  if (!form) return;
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
  window.recarHome = { loadCatalog, renderTimeDeals };
})();
