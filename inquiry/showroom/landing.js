/* 문의 첫 화면의 상담 폼과 차량 취향 테스트. 접수와 차량 목록은 runtime.mjs에서 연결해요. */
(function () {
  const C = window.RECAR, R = window.RC, H = window.RC_HOME, M = window.RC_MATCH;
  if (!document.body.classList.contains('lp') || !H || !M) return;
  const { $, $$, esc, won, I } = R;
  const pm = M.monthlyOf;
  const logo = b => (b.logo ? `<img src="/inquiry/landing-assets/assets/brands/${b.logo}" alt="">` : '');
  const smooth = () => (R.reduceMotion ? 'auto' : 'smooth');
  const phoneOk = v => /^01[016789]\d{7,8}$/.test(String(v || '').replace(/\D/g, ''));
  const conditionNote = `${C.defaults.term}개월 · 보증금 0% · 선납금 ${C.defaults.depositPct}% · 연 ${C.defaults.mileage / 10000}만km · 대표 등급 · 부가세 포함`;
  const official = (path) => {
    const url = new URL(path, 'https://recarplan.com');
    if (R.code || R.explicitRef) url.searchParams.set('ref', R.code);
    return url;
  };
  const stepHref = (useEntry = false) => new URL(useEntry ? R.selectedStepHref : R.stepHref, location.origin);
  function vehicleInquiry(v) {
    const url = stepHref();
    if (!v.sample && !String(v.id || '').startsWith('sample-') && v.brand && v.model_name) {
      url.searchParams.set('brand', v.brand);
      url.searchParams.set('model', v.model_name);
    }
    return esc(url.href);
  }

  /* ---------- 설정값 · 아이콘 ---------- */
  $$('[data-consent]').forEach(el => { el.innerHTML = R.consentHTML(true); });
  $$('[data-site-tel]').forEach(a => { a.href = R.telHref; });
  $$('[data-ic]').forEach(el => { el.innerHTML = I[el.dataset.ic] || ''; });
  $('#lpFoot').innerHTML = (() => {
    const s = C.site, t = C.trust || {};
    return `<nav><a href="https://recarplan.com/terms.html">이용약관</a><a href="https://recarplan.com/privacy.html">개인정보처리방침</a><a href="https://recarplan.com/company/">회사 소개</a><a href="https://recarplan.com/">전체 사이트</a></nav>
      <p class="lp-foot__co"><b>${esc(s.company)}</b> · 대표 ${esc(s.ceo)} · 사업자등록번호 ${esc(s.bizNo)}</p>
      <p>${esc(s.address)}</p>
      <p>${esc(s.tel)} · ${esc(s.email)} · ${esc(s.hours)}</p>
      ${t.loanBrokerNo ? `<p>대출성 금융상품판매대리 · 중개업 등록번호 ${esc(t.loanBrokerNo)}</p>` : ''}
      ${t.antiFraud ? `<p class="lp-foot__safe">${esc(t.antiFraud)}</p>` : ''}
      <p>월 납입료는 ${esc(conditionNote)} 예상 금액이며, 실제 금액은 심사 결과에 따라 달라질 수 있어요.</p>
      <small>© ${new Date().getFullYear()} RE:CAR. All rights reserved.</small>`;
  })();
  $$('a[href^="https://recarplan.com/"]').forEach(link => {
    link.href = new URL(link.href).pathname === '/inquiry/steps.html' ? stepHref(true).href : official(link.href).href;
  });

  const replay = $('#lpHeroReplay');
  const backdrop = $('.lp-hero__backdrop');
  const motionSource = $('source', backdrop);
  const motionImage = $('img', backdrop);
  const motionPreference = matchMedia(motionSource.media);
  const originalMotion = new URL(motionSource.srcset, location.href);
  const syncReplay = () => { replay.hidden = !motionPreference.matches; };
  syncReplay();
  motionPreference.addEventListener('change', syncReplay);
  motionImage.addEventListener('load', () => { motionImage.hidden = false; });
  motionImage.addEventListener('error', () => { motionImage.hidden = true; });
  if (motionImage.complete && !motionImage.naturalWidth) motionImage.hidden = true;
  replay.addEventListener('click', () => {
    const url = new URL(originalMotion);
    url.searchParams.set('replay', String(Date.now()));
    motionSource.srcset = url.href;
  });

  // 동의 처리 순서에 상관없이 하위 체크를 먼저 맞춘 뒤 폼이 버튼 상태를 검사하게 해요.
  function syncConsent(form, target) {
    const all = $('[data-agree-all]', form), checks = $$('[data-agree]', form);
    if (!all || !checks.length) return;
    if (target === all) checks.forEach(input => { input.checked = all.checked; });
    all.checked = checks.every(input => input.checked);
    all.indeterminate = !all.checked && checks.some(input => input.checked);
  }
  document.addEventListener('change', event => {
    const target = event.target;
    if (!target.matches?.('[data-agree-all], [data-agree]')) return;
    const form = target.closest('#lpFunnel, #tPhone');
    if (form) syncConsent(form, target);
  }, true);

  /* ---------- 왼쪽 상담: 차종 → 이름 → 연락처 → 필수 동의 ---------- */
  const funnel = (() => {
    const form = $('#lpFunnel'), bar = $('#lpBar'), count = $('#lpCount'), err = $('#lpErr');
    const nextBtn = $('#lpNext'), backBtn = $('#lpBack'), picked = $('#lpPicked'), carInput = $('#lpCarInput');
    // 단계 이동과 최종 접수는 이 화면에서 맡아요. 공통 폼 바인딩의 중복 접수를 피하고 유입 표시는 유지해요.
    form.dataset.inquiry = form.dataset.landingInquiry;
    R.prefill(form);
    form.addEventListener('focusin', () => R.prefill(form), { once: true });
    const STEPS = ['car', 'name', 'phone', 'agree'];
    const S = { i: 0, carName: '', car: null, undecided: false };
    const stepEl = k => $(`.lp-step[data-step="${k}"]`, form);
    const ready = () => {
      const k = STEPS[S.i];
      if (k === 'car') return !!(S.carName || S.undecided);
      if (k === 'name') return !!form.elements.name.value.trim();
      if (k === 'phone') return phoneOk(form.elements.phone.value);
      return $$('input[required][type=checkbox]', form).every(c => c.checked);
    };
    const sync = () => { nextBtn.disabled = !ready(); };
    const show = (focus = true) => {
      STEPS.forEach((k, n) => { stepEl(k).hidden = n !== S.i; });
      bar.style.width = ((S.i + 1) / STEPS.length * 100) + '%';
      count.textContent = `${S.i + 1} / ${STEPS.length}`;
      backBtn.hidden = S.i === 0;
      nextBtn.textContent = S.i === STEPS.length - 1 ? '비교 상담 신청하기' : '다음';
      picked.hidden = S.i === 0 || !(S.carName || S.undecided);
      picked.innerHTML = `<small>상담 차종</small><span>${esc(S.carName || '상담 때 추천받기')}</span>`;
      err.textContent = '';
      sync();
      if (focus) { const inp = $('input:not([type=checkbox])', stepEl(STEPS[S.i])); if (inp) inp.focus({ preventScroll: true }); }
    };
    const setCar = (car, name, fromInput = false) => {
      S.car = car; S.carName = name; S.undecided = false;
      if (!fromInput) carInput.value = name;
    };
    const go = n => { S.i = Math.max(0, Math.min(STEPS.length - 1, n)); show(); };

    carInput.addEventListener('input', () => {
      // 직접 쓴 차종을 카탈로그 차량으로 추정하지 않아요. 이전에 고른 차량의 금액도 이어 붙이지 않아요.
      setCar(null, carInput.value.trim(), true);
      err.textContent = '';
      sync();
    });
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    backBtn.addEventListener('click', () => go(S.i - 1));
    $('#lpUndecided').addEventListener('click', () => { setCar(null, ''); S.undecided = true; go(1); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const k = STEPS[S.i];
      if (!ready()) {
        err.textContent = k === 'phone' ? '연락처를 정확히 입력해 주세요.' : k === 'agree' ? '필수 동의 항목에 체크해 주세요.' : '입력해 주세요.';
        return;
      }
      if (S.i < STEPS.length - 1) { go(S.i + 1); return; }
      const name = form.elements.name.value.trim();
      const res = await R.submitInquiry(form, {
        vehicle_name: S.carName || '상담 시 안내',
        condition_summary: '문의 첫 화면 · 빠른 상담'
      });
      if (!res) return;
      form.hidden = true;
      const done = $('#lpDone');
      done.hidden = false;
      done.innerHTML = doneHTML(res, name, S.carName);
    });
    show(false);
    return {
      // 다른 곳에서 차를 골라 상담으로 넘어올 때
      pick(v) {
        const f = $('#lpFunnel');
        if (f.hidden) return;
        setCar(v, R.carName(v));
        go(1);
      }
    };
  })();

  function doneHTML(res, name, car) {
    const unsent = !!(res && res.preview);
    return `<div class="lp-done__ic">${I.check}</div>
      <p class="lp-done__t">${unsent ? '입력 내용을 확인했어요' : '상담 신청을 받았어요'}</p>
      ${unsent ? '<p>이 화면에서는 상담 신청이 전송되지 않았어요.<br>실제 상담은 리카 공식 페이지에서 신청해 주세요.</p>' : `<p>${esc(name)}님, ${car ? `<b>${esc(car)}</b> ` : ''}금융사별 조건을 확인해 연락드릴게요.<br><small>상담 시간 ${esc(C.site.hours)}</small></p>`}
      ${!unsent && res && (res.inquiry_no || res.id || res.inquiry_id) ? `<p class="lp-done__no">접수번호 <b>${esc(res.inquiry_no || res.id || res.inquiry_id)}</b></p>` : ''}
      <div class="lp-done__cta">${unsent ? `<a href="${esc(stepHref().href)}">리카에서 상담 신청하기</a>` : `<a href="${R.telHref}">전화하기</a>`}<a class="is-kakao" href="${C.site.kakao}" target="_blank" rel="noopener">카카오톡 상담</a></div>`;
  }

  /* ---------- 상담 폼으로 이동 ---------- */
  function toCard() {
    const card = $('#lpCard');
    card.scrollIntoView({ behavior: smooth(), block: 'start' });
    const inp = $('.lp-step:not([hidden]) input:not([type=checkbox])', card);
    if (inp) inp.focus({ preventScroll: true });
  }
  $('#lpFocusForm').addEventListener('click', toCard);
  $('#lpMbarAsk').addEventListener('click', toCard);
  // 상담 칸이 보이지 않을 때만 아래 막대를 보여요.
  if ('IntersectionObserver' in window) {
    const bar = $('#lpMbar');
    new IntersectionObserver(([e]) => { bar.hidden = e.isIntersecting; }, { threshold: .15 }).observe($('#lpCard'));
  }

  /* ---------- 공통: 돌아가는 슬라이드 ---------- */
  function rotator(items, dots, onShow, ms = 5000, hoverEl) {
    let cur = 0, timer;
    dots.innerHTML = items.map((_, i) => `<button type="button" aria-label="${i + 1}번째 보기"${i === 0 ? ' class="is-on"' : ''}></button>`).join('');
    const go = n => {
      cur = (n + items.length) % items.length;
      $$('button', dots).forEach((b, i) => b.classList.toggle('is-on', i === cur));
      onShow(cur);
    };
    const play = () => { clearInterval(timer); if (!R.reduceMotion) timer = setInterval(() => { if (!document.hidden) go(cur + 1); }, ms); };
    dots.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { go([...dots.children].indexOf(b)); play(); } });
    if (hoverEl) { hoverEl.addEventListener('mouseenter', () => clearInterval(timer)); hoverEl.addEventListener('mouseleave', play); }
    go(0); play();
  }
  (() => {
    const list = $$('#lpBanners .lp-banner');
    rotator(list, $('#lpBannerDots'), i => list.forEach((el, n) => {
      el.classList.toggle('is-on', n === i);
      el.tabIndex = n === i ? 0 : -1;
    }), 4500, $('#lpBanners'));
  })();

  /* ---------- 오른쪽 첫 화면: 추천 차량 (판매 순위 자료가 없어서 순위는 적지 않아요) ---------- */
  function hero(d) {
    const cars = d.ranked.filter(v => R.carImg(v)).slice(0, 5);
    const stage = $('#lpHeroStage'), chip = $('#lpHeroChip'), cta = $('#lpHeroCta');
    if (!cars.length) { stage.innerHTML = R.errorHTML('차량 정보를 불러오지 못했어요.'); return; }
    stage.innerHTML = cars.map((v, i) => {
      const b = R.brandOf(v.brand);
      return `<a class="lp-slide${i === 0 ? ' is-on' : ''}" href="${vehicleInquiry(v)}" aria-hidden="${i !== 0}" tabindex="${i === 0 ? 0 : -1}">
        <img src="${esc(R.carImg(v))}" alt="">
        <span class="lp-slide__brand">${esc(b.en || b.name)}</span>
        <span class="lp-slide__name">${esc(v.model_name)}</span>
        <span class="lp-slide__price">${pm(v) ? `월 <b>${won(pm(v))}</b>원부터` : '금액은 상담 때 안내'}</span>
      </a>`;
    }).join('');
    cta.hidden = false;
    let cur = 0;
    rotator(cars, $('#lpHeroDots'), i => {
      cur = i;
      $$('.lp-slide', stage).forEach((el, n) => { el.classList.toggle('is-on', n === i); el.setAttribute('aria-hidden', n !== i); el.tabIndex = n === i ? 0 : -1; });
      chip.innerHTML = `<span>${esc(R.brandOf(cars[i].brand).name)}</span><em>리카 추천</em>`;
      cta.textContent = `${cars[i].model_name} 상담 신청`;
    }, 5000, $('.lp-hero'));
    cta.addEventListener('click', () => { funnel.pick(cars[cur]); toCard(); });
  }

  /* ---------- 12문항 추천 ---------- */
  const test = (() => {
    const box = $('#lpTest');
    const T = { i: 0, answers: [], result: null, d: null, target: null, targetName: '', customCarName: '', view: 'q', editing: false, pending: false, sent: false };
    const Q = M.QUESTIONS;
    let lastFocus = null;

    const close = () => {
      box.hidden = true;
      document.documentElement.classList.remove('is-locked');
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    };
    const open = () => {
      lastFocus = document.activeElement;
      box.hidden = false;
      document.documentElement.classList.add('is-locked');
      render();
    };
    // formAttr 를 주면 본문과 아래 버튼을 한 form 으로 묶어요(공통 접수 코드가 form 안의 제출 버튼을 찾아요)
    const frame = (head, body, foot = '', formAttr = '') => {
      const inner = `<div class="lp-test__body" tabindex="-1">${body}</div>${foot ? `<div class="lp-test__foot">${foot}</div>` : ''}`;
      box.innerHTML = `<div class="lp-test__box">
        <div class="lp-test__head">${head}<button type="button" class="lp-test__x" data-t="close" aria-label="닫기">${I.close}</button></div>
        ${formAttr ? `<form class="lp-test__form" ${formAttr} novalidate>${inner}</form>` : inner}
      </div>`;
      const b = $('.lp-test__body', box);
      b.scrollTop = 0;
      b.focus({ preventScroll: true });
    };
    const headBack = label => `<button type="button" class="lp-test__back" data-t="back" aria-label="이전">${I.chevL}</button><span class="lp-test__count">${label}</span>`;

    function renderQ() {
      const q = Q[T.i], pct = (T.i / Q.length) * 100;
      frame(headBack(`${T.i + 1} / ${Q.length}`),
        `<div class="lp-q__bar" aria-hidden="true"><i style="width:${Math.max(pct, 4)}%"></i></div>
         <p class="lp-q__no">${q.stage === 'conditions' ? '내 일상 한 장면' : '내 취향 알아보기'} · Q${q.id}</p>
         <h2 class="lp-q__t">${esc(q.text)}</h2>
         ${q.note ? `<p class="lp-q__note">${esc(q.note)}</p>` : ''}
         <div class="lp-q__opts${q.options.length > 2 ? ' is-many' : ''}">
           ${q.options.map((o, k) => `<button type="button" data-a="${k}" class="${T.answers[T.i] === k ? 'is-on' : ''}" aria-pressed="${T.answers[T.i] === k}"><span>${esc(o.label)}</span>${o.detail ? `<small>${esc(o.detail)}</small>` : ''}</button>`).join('')}
         </div>`);
    }

    function compute() {
      const d = T.d;
      T.result = M.match(T.answers, d ? d.ranked : [], d ? v => H.stockOf(d, v) : null);
      const c = T.result.car;
      T.target = c; T.targetName = c ? R.carName(c) : '';
    }

    function priceCells(v) {
      const cell = (label, ok, n) => `<div class="lp-pc"><small>${label}</small>${ok && n ? `<span>월 <b>${won(n)}</b>원</span>` : '<span class="is-na">견적 없음</span>'}</div>`;
      return cell('장기렌트', v.canRent, v.rent);
    }

    function renderResult() {
      const r = T.result, p = r.profile, v = r.car;
      const axes = p.axes.map(a => `<li><span>${esc(a.label)}</span><i aria-hidden="true"><u style="width:${a.pct}%"></u></i><b>${a.votes}/${a.total}</b></li>`).join('');
      const b = v && R.brandOf(v.brand);
      const stock = v && T.d ? H.stockOf(T.d, v) : 0;
      const car = v ? `
        <section class="lp-r__car">
          <div class="lp-r__photo">${R.carImg(v) ? `<img src="${esc(R.carImg(v))}" alt="">` : ''}${stock ? '<em>즉시출고</em>' : ''}<p class="lp-r__brand">${logo(b)}${esc(b.name)}</p></div>
          <p class="lp-r__name"><small>취향으로 고른 차량 후보</small>${esc(v.model_name)}</p>
          <div class="lp-r__price">
            <div class="lp-r__total"><small>차량 금액</small><span>${v.price_from ? `<b>${won(v.price_from)}</b>원부터` : '<b>상담 때 안내</b>'}</span></div>
            <p class="lp-r__reference">현재 목록의 기본 조건 참고 금액</p><div class="lp-pcs">${priceCells(v)}</div>
            <p class="lp-r__cond">${esc(conditionNote)} 기준이에요. 답변한 초기 예산·주행거리를 반영한 견적은 아니에요.</p>
          </div>
          <ul class="lp-r__why">${r.reasons.map(x => `<li>${I.check}<span>${esc(x)}</span></li>`).join('')}</ul>
          <a class="lp-r__more" href="${vehicleInquiry(v)}">리카에서 차량과 견적 조건 보기</a>
        </section>` : `
        <section class="lp-r__car"><p class="lp-r__empty">현재 목록의 기본 조건 참고 금액과 충전 환경으로 추릴 수 있는 후보가 없어요. 아래 답변으로 상담받을 수 있어요.</p></section>`;
      frame(headBack('나의 결과'),
        `<div class="lp-r__type">
           <p class="lp-r__label">차 고를 때 나오는 내 모습 <b>${esc(p.code)}</b></p>
           <h2 class="lp-r__tname">${esc(p.type.name)}</h2>
           <p class="lp-r__desc">${esc(p.type.desc)}</p>
         </div>
         ${v ? '<p class="lp-r__matchnote">취향·충전 환경과 기본 조건의 참고 금액으로 추린 후보예요. 실제 예산·인원·주차 적합은 확인이 필요해요.</p>' : ''}
         ${car}
         <section class="lp-r__answers"><h3>내 일상은 이렇게 이해했어요</h3><p>잘못 고른 답변은 눌러서 바꿀 수 있어요.</p>
           ${M.summary(p).map(x => `<button type="button" data-edit="${x.questionIndex}" aria-label="${esc(x.label)} 바꾸기"><small>${esc(x.label)}</small><span>${esc(x.value)}</span>${I.chevR}</button>`).join('')}
         </section>
         <div class="lp-r__checks"><b>상담에서 확인할 부분</b>${r.checks.map(x => `<p>${esc(x)}</p>`).join('')}</div>
         <div class="lp-r__axbox"><p class="lp-r__label">내 답변은 이쪽에 가까워요</p><ul class="lp-r__axes">${axes}</ul><p class="lp-r__axisnote">각 취향을 물은 세 질문 중, 이쪽을 고른 답변 수예요.</p></div>
         <button type="button" class="lp-r__again" data-t="restart">다른 선택도 궁금해요</button>
         <p class="lp-r__fine">성격 진단이 아닌, 재미로 보는 자동차 취향이에요.</p>`,
        v ? `<button type="button" class="lp-t-main" data-t="ask">이 차량 문의하기</button><button type="button" class="lp-t-sub" data-t="others">다른 차량 상담받기</button>`
          : `<button type="button" class="lp-t-main" data-t="others">상담받기</button>`);
    }

    function renderOthers() {
      const others = T.result.others || [];
      frame(headBack('다른 차량 상담'),
        `<label class="lp-q__t" for="tOtherCarIn">어떤 차로 상담받으시겠어요?</label>
         <input class="lp-ask__in" id="tOtherCarIn" type="text" maxlength="100" autocomplete="off" placeholder="예: 쏘렌토, 그랜저, BMW 5시리즈" value="${esc(T.customCarName)}" required>
         <p class="lp-err lp-err--dark" role="alert"></p>
         ${others.length ? `<p class="lp-o__label">다른 추천 차량</p>
         <div class="lp-o__list">${others.map(v => `<button type="button" data-car="${esc(v.id)}">${R.carImg(v) ? `<img src="${esc(R.carImg(v))}" alt="">` : ''}<span><small>${esc(R.brandOf(v.brand).name)}</small><b>${esc(v.model_name)}</b><em>${pm(v) ? `월 ${won(pm(v))}원부터` : '상담 때 안내'}</em></span>${I.chevR}</button>`).join('')}</div>` : ''}
         <button type="button" class="lp-o__none" data-t="undecided">아직 못 정했어요. 상담 때 추천받을게요</button>`,
        `<button type="submit" class="lp-t-main"${T.customCarName.trim() ? '' : ' disabled'}>이 차종으로 상담받기</button>`, 'id="tOtherCar"');
      const input = $('#tOtherCarIn', box), button = $('#tOtherCar button[type=submit]', box);
      input.addEventListener('input', () => {
        T.customCarName = input.value;
        button.disabled = !input.value.trim();
        $('.lp-err', box).textContent = '';
      });
    }

    // 이름 → 연락처(필수 동의 포함). 입력값은 화면을 오가도 유지해요
    const field = { name: '', phone: '', agree: false, agree3: false, marketing: false };
    function renderAsk(step) {
      const chip = `<p class="lp-ask__car"><small>상담 차종</small><span>${esc(T.targetName || '상담 때 추천받기')}</span></p>`;
      if (step === 'name') {
        frame(headBack('1 / 2'),
          `<div class="lp-ask">${chip}
             <label class="lp-q__t" for="tNameIn">성함을 알려 주세요</label>
             <input class="lp-ask__in" id="tNameIn" autocomplete="name" placeholder="이름" value="${esc(field.name)}">
             <p class="lp-err lp-err--dark" role="alert"></p></div>`,
          `<button type="submit" class="lp-t-main">다음</button>`, 'id="tName"');
        $('#tNameIn', box).focus({ preventScroll: true });
        return;
      }
      frame(headBack('2 / 2'),
        `<div class="lp-ask">${chip}
           <input type="hidden" name="name" value="${esc(field.name)}">
           <label class="lp-q__t" for="tPhoneIn">연락받을 번호를 알려 주세요</label>
           <input class="lp-ask__in" id="tPhoneIn" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="휴대폰 번호" value="${esc(field.phone)}">
           <div class="lp-consent lp-consent--dark">${R.consentHTML(true)}</div>
           <p class="lp-err lp-err--dark" role="alert"></p></div>`,
        `<button type="submit" class="lp-t-main">상담 신청</button>`, 'id="tPhone" data-inquiry="랜딩 차량 추천 테스트"');
      const f = $('#tPhone', box);
      R.phoneMask(f);
      ['agree', 'agree3', 'marketing'].forEach(k => { if (f.elements[k]) f.elements[k].checked = field[k]; });
      syncConsent(f);
      $('#tPhoneIn', box).focus({ preventScroll: true });
    }

    function renderDone(res) {
      frame(`<span class="lp-test__count">${res && res.preview ? '입력 확인' : '신청 완료'}</span>`,
        `<div class="lp-done lp-done--dark">${doneHTML(res, field.name, T.targetName)}</div>`,
        `<button type="button" class="lp-t-main" data-t="close">닫기</button>`);
    }

    function render() {
      if (T.view === 'q') renderQ();
      else if (T.view === 'result') renderResult();
      else if (T.view === 'others') renderOthers();
      else if (T.view === 'name') renderAsk('name');
      else if (T.view === 'phone') renderAsk('phone');
    }
    function savePhone() {
      const f = $('#tPhone', box); if (!f) return;
      field.phone = f.elements.phone.value;
      ['agree', 'agree3', 'marketing'].forEach(k => { if (f.elements[k]) field[k] = f.elements[k].checked; });
    }
    function back() {
      if (T.view === 'q') { if (T.editing) { T.editing = false; T.view = 'result'; render(); } else if (T.i === 0) close(); else { T.i--; render(); } return; }
      if (T.view === 'result') { T.view = 'q'; T.i = Q.length - 1; render(); return; }
      if (T.view === 'others') { T.view = 'result'; render(); return; }
      if (T.view === 'name') { T.view = T.came === 'others' ? 'others' : 'result'; render(); return; }
      if (T.view === 'phone') { savePhone(); T.view = 'name'; render(); }
    }
    function restart() {
      Object.assign(T, { i: 0, answers: [], result: null, target: null, targetName: '', customCarName: '', view: 'q', editing: false, pending: false, sent: false, came: null });
      Object.assign(field, { agree: false, agree3: false, marketing: false });  // 동의는 신청할 때마다 새로 받아요
      render();
    }

    box.addEventListener('click', e => {
      if (e.target === box) { close(); return; }
      const a = e.target.closest('[data-a]');
      if (a) {
        if (T.pending) return;
        T.pending = true;
        const questionIndex = T.i;
        T.answers[T.i] = +a.dataset.a;
        $$('[data-a]', box).forEach(b => { const on = b === a; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
        setTimeout(() => {
          T.pending = false;
          if (box.hidden || T.view !== 'q' || T.i !== questionIndex) return;
          if (T.editing) { T.editing = false; compute(); T.view = 'result'; render(); return; }
          if (T.i < Q.length - 1) { T.i++; renderQ(); return; }
          compute(); T.view = 'result'; render();
        }, R.reduceMotion ? 0 : 160);
        return;
      }
      const edit = e.target.closest('[data-edit]');
      if (edit) { T.i = +edit.dataset.edit; T.editing = true; T.view = 'q'; render(); return; }
      const carBtn = e.target.closest('[data-car]');
      if (carBtn) {
        const v = T.d && T.d.all.find(x => x.id === carBtn.dataset.car);
        if (v) { T.target = v; T.targetName = R.carName(v); T.came = 'others'; T.view = 'name'; render(); }
        return;
      }
      const t = e.target.closest('[data-t]');
      if (!t) return;
      const act = t.dataset.t;
      if (act === 'close') close();
      else if (act === 'back') back();
      else if (act === 'restart') restart();
      else if (act === 'ask') { T.target = T.result.car; T.targetName = T.target ? R.carName(T.target) : ''; T.came = 'result'; T.view = 'name'; render(); }
      else if (act === 'others') { T.came = 'others'; T.view = 'others'; render(); }
      else if (act === 'undecided') { T.target = null; T.targetName = ''; T.came = 'others'; T.view = 'name'; render(); }
    });
    box.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const err = $('.lp-err', f);
      if (f.id === 'tOtherCar') {
        const name = $('#tOtherCarIn', box).value.trim();
        if (!name) { err.textContent = '상담받고 싶은 차종을 입력해 주세요.'; return; }
        T.target = null; T.targetName = name; T.came = 'others'; T.view = 'name'; render();
        return;
      }
      if (f.id === 'tName') {
        const val = $('#tNameIn', box).value.trim();
        if (!val) { err.textContent = '이름을 입력해 주세요.'; return; }
        field.name = val; T.view = 'phone'; render();
        return;
      }
      if (f.id === 'tPhone') {
        savePhone();
        if (!phoneOk(field.phone)) { err.textContent = '연락처를 정확히 입력해 주세요.'; return; }
        if ($$('input[required][type=checkbox]', f).some(c => !c.checked)) { err.textContent = '필수 동의 항목에 체크해 주세요.'; return; }
        err.textContent = '';
        const r = T.result, p = r.profile;
        const res = await R.submitInquiry(f, {
          vehicle_name: T.targetName || '상담 시 안내',
          quoted_monthly_payment: null,  // 답변 조건의 견적을 계산한 금액이 아니므로 확정 요청값으로 보내지 않아요.
          condition_summary: [`추천 테스트 ${p.code}(${p.type.name})`, r.car ? '취향 후보 ' + R.carName(r.car) : '', ...M.summary(p).map(x => x.label + ': ' + x.value), '개인 조건의 견적·정원·주차 적합 미확인'].filter(Boolean).join(' · ')
        });
        if (res) { T.sent = true; renderDone(res); }
      }
    });
    // 안내창(개인정보 등)이 열려 있으면 Esc 는 안내창만 닫아요. 공통 코드보다 먼저 확인하려고 capture 로 받아요
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden && !$('.modal')) close(); }, true);
    document.addEventListener('click', e => {
      if (e.target.closest('[data-test-open]')) {
        if (T.sent) restart();
        open();
      }
    });
    return { setData(d) { T.d = d; if (T.view !== 'q' && T.result && !T.result.car) { compute(); if (!box.hidden && T.view === 'result') render(); } } };
  })();

  /* ---------- 데이터 ---------- */
  (async () => {
    let d;
    try { d = await H.data; } catch { $('#lpHeroStage').innerHTML = R.errorHTML('차량 정보를 불러오지 못했어요.'); return; }
    hero(d);
    test.setData(d);
  })();
})();
