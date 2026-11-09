/* 자동차 취향 테스트 — 6개 취향 + 생활 상황으로 묻는 6개 실제 조건.
   숫자·상한·구간·미정을 명시하고 여섯 답변을 그대로 상담에 전달해요.
   각 취향은 서로 다른 세 상황의 다수결이며 실제 조건은 성격 유형을 바꾸지 않아요.
   신기능 선호를 전기차 점수로 바꾸지 않아요. 충전 미확인/불가 시 전기차는 제외해요.
   기본 목록 금액의 월 상한은 완화하지 않아요. 개인 초기 예산·거리로 다시 계산한 금액은 아니에요.
   목록에는 정원·치수가 없어 인원/주차 적합을 확정하지 않아요. 기존 가격 조회·계산은 그대로예요.
*/
(function (root) {
  const AXES = [
    { key: 'space', plus: 'S', minus: 'C', plusLabel: '넉넉한 공간', minusLabel: '아담한 크기' },
    { key: 'power', plus: 'E', minus: 'G', plusLabel: '새로운 기능', minusLabel: '익숙한 편안함' },
    { key: 'value', plus: 'P', minus: 'V', plusLabel: '브랜드 · 고급감', minusLabel: '실속 · 월 납입료' },
    { key: 'style', plus: 'A', minus: 'D', plusLabel: '떠나는 즐거움', minusLabel: '편안한 드라이브' }
  ];

  // 각 취향 축은 세 상황에서 같은 무게로 판단해요. 조건 질문은 축 점수를 갖지 않아요.
  const QUESTIONS = [
    { id: 1, key: 'weekend', stage: 'taste', text: '금요일 저녁, 단톡방에 “주말에 뭐 해?”가 떴다.', options: [
      { label: '짐 싣고 다 같이 떠날 사람? 내 차로 가자', space: 1, style: 1 },
      { label: '가볍게 둘이, 도심 한 바퀴에 맛집 하나', space: -1, style: -1 }] },
    { id: 2, key: 'testdrive', stage: 'taste', text: '새 휴대폰을 산 첫 주말, 내 모습은?', options: [
      { label: '숨은 기능부터 탐험! 밖에 나가 사진도 찍어 봐야지', power: 1, style: 1 },
      { label: '쓰던 앱은 원래 자리에. 단골 카페에서 편하게 쓸래', power: -1, style: -1 }] },
    { id: 3, key: 'brag', stage: 'taste', text: '숙소 예약 탭이 12개. 끝까지 비교하는 건?', options: [
      { label: '여유로운 공간에, 마음에 드는 인테리어까지', space: 1, value: 1 },
      { label: '딱 머물 만큼이면 충분. 지출은 가볍게', space: -1, value: -1 }] },
    { id: 4, key: 'cabin', stage: 'taste', text: '차 안을 구경할 때, 내 시선이 머무는 곳은?', options: [
      { label: '큰 화면에 숨은 수납까지. 움직이는 아지트네', space: 1, power: 1 },
      { label: '딱 맞는 크기, 익숙한 버튼. 설명서 없이 가능', space: -1, power: -1 }] },
    { id: 5, key: 'decision', stage: 'taste', text: '매일 쓸 물건, 장바구니에서 못 빼는 쪽은?', options: [
      { label: '새 기능에 디자인까지 내 취향인 물건', power: 1, value: 1 },
      { label: '필요한 건 다 있고, 가격도 부담 없는 물건', power: -1, value: -1 }] },
    { id: 6, key: 'firstweekend', stage: 'taste', text: '주말 하루가 통째로 비었다. 먼저 떠오르는 건?', options: [
      { label: '좋아하는 음악 틀고, 분위기 좋은 숙소까지 훌쩍', value: 1, style: 1 },
      { label: '가까운 동네 코스로, 지출은 가볍게 드라이브는 편하게', value: -1, style: -1 }] },
    { id: 7, key: 'budget', stage: 'conditions', text: '매달 차에 주는 용돈, 통장과 합의한 선은?', note: '월 납입료의 상한이에요. 목록의 기본 조건 금액과 먼저 비교해요.', options: [
      { label: '차도 타고, 맛집도 가야지', detail: '월 40만원까지', budget: [0, 400000] },
      { label: '이 정도면 통장도 고개를 끄덕여', detail: '월 60만원까지', budget: [0, 600000] },
      { label: '마음에 드는 차에는 조금 더', detail: '월 80만원까지', budget: [0, 800000] },
      { label: '아직 통장과 회의 중', detail: '상한 미정', budget: [0, Infinity] }] },
    { id: 8, key: 'upfront', stage: 'conditions', text: '차 키 받기 전, 내 목돈의 출근 계획은?', note: '매달 내는 돈과 별도로, 처음 낼 수 있는 금액의 상한이에요.', options: [
      { label: '목돈은 집에서 쉬게 할래', detail: '초기 예산 0원', upfrontCap: 0 },
      { label: '조금만 출동해도 괜찮아', detail: '초기 예산 최대 300만원', upfrontCap: 3000000 },
      { label: '여기까지는 준비할 수 있어', detail: '초기 예산 최대 1,000만원', upfrontCap: 10000000 },
      { label: '아직 목돈과 일정 조율 중', detail: '초기 예산 미정', upfrontCap: null }] },
    { id: 9, key: 'passengers', stage: 'conditions', text: '“내 차로 가자!” 하면 몇 자리 필요해요?', note: '운전자도 한 명! 한 번에 꼭 함께 타야 하는 인원이에요.', options: [
      { label: '조용한 소수 정예', detail: '운전자 포함 1~2명', passengerMin: 1, passengerMax: 2 },
      { label: '뒷자리에도 일행이 있어', detail: '운전자 포함 3~4명', passengerMin: 3, passengerMax: 4 },
      { label: '다섯 자리, 우리 자리', detail: '운전자 포함 5명', passengerMin: 5, passengerMax: 5 },
      { label: '우리 팀은 한 줄로 안 끝나', detail: '6명 이상 · 정확한 인원은 상담 때 확인', passengerMin: 6, passengerMax: null },
      { label: '아직 탑승 명단 작성 중', detail: '인원 미정', passengerMin: null, passengerMax: null }] },
    { id: 10, key: 'mileage', stage: 'conditions', text: '내 차의 올해 일정표, 얼마나 바쁠까요?', note: '출퇴근·주말·여행을 모두 합친 1년 거리예요. 모르면 추측하지 않아도 돼요.', options: [
      { label: '일정표에 여백이 좀 있어', detail: '연 1만km 이하', annualKmCap: 10000 },
      { label: '출퇴근도, 주말 약속도 꾸준히', detail: '연 1만 초과~2만km 이하', annualKmCap: 20000 },
      { label: '달력도 바쁘고 차도 바빠', detail: '연 2만 초과~3만km 이하', annualKmCap: 30000 },
      { label: '도로 위에서 자주 만나요', detail: '연 3만km 초과', annualKmCap: null },
      { label: '거리 감각은 아직 준비 중', detail: '연간 거리 모름', annualKmCap: null }] },
    { id: 11, key: 'charging', stage: 'conditions', text: '전기차가 “배고파!” 하면 어디로 가나요?', note: '충전기를 실제로 꾸준히 쓸 수 있는지 골라 주세요.', options: [
      { label: '집이나 회사에 밥상이 있어', detail: '집·직장에서 충전 가능', charging: 'home' },
      { label: '밖에서 챙겨 줄 수 있어', detail: '공용 충전소를 꾸준히 이용 가능', charging: 'public' },
      { label: '밥 챙기기는 어려울 것 같아', detail: '충전 환경 없음 · 전기차 제외', charging: 'none' },
      { label: '우리 동네 밥집부터 찾아봐야 해', detail: '충전 환경 미확인 · 우선 전기차 제외', charging: 'unknown' }] },
    { id: 12, key: 'parking', stage: 'conditions', text: '주차장 입구에서 내 마음 상태는?', note: '기계식 주차는 실제 크기·높이·무게 제한을 따로 확인해야 해요.', options: [
      { label: '여유 있게 들어오세요', detail: '평소 주차공간에 여유가 있어요', parking: 'open' },
      { label: '들어갈 때 잠깐 숨 참는 편', detail: '좁은 공간 · 작은 차 선호', parking: 'narrow' },
      { label: '입장 규칙이 조금 까다로워', detail: '기계식 또는 크기·높이·무게 제한', parking: 'restricted' },
      { label: '내 자리와 아직 안 친해졌어', detail: '주차공간 또는 제한 미확인', parking: 'unknown' }] }

  ];

  // 별명은 재미로 보는 취향이에요. 실제 추천 차량의 성능·크기·가격을 보증하지 않아요.
  const TYPES = {
    SEPA: ['취향까지 챙긴 짐부자', '짐도 넉넉하게, 신기능도 야무지게. 주말 출동에는 실내 취향까지 챙겨요.'],
    SEPD: ['달리는 거실 디렉터', '넓은 공간에 좋은 분위기, 새로운 기능까지. 차 안에 내 거실을 꾸미고 싶어요.'],
    SEVA: ['주말 짐싸기 천재', '놀러 갈 준비는 늘 되어 있어요. 짐은 넉넉히, 새 기능과 지출은 똑똑하게 챙겨요.'],
    SEVD: ['출퇴근 효율반장', '자리도 기능도 넉넉했으면 해요. 그래도 매달 나가는 돈은 한 번 더 확인하죠.'],
    SGPA: ['트렁크 총괄팀장', '사람 태우기 전에 짐 자리부터 계산하는 편. 익숙한 조작과 좋은 실내도 포기 못 해요.'],
    SGPD: ['뒷좌석 의전실장', '“뒤에 편해?”를 먼저 묻는 당신. 익숙한 편안함에 실내 분위기까지 챙겨요.'],
    SGVA: ['주말 원정대 살림꾼', '여행 준비도 잘하고, 차에 쓰는 돈도 야무지게. 익숙한 차에 짐 싣고 떠나면 끝이에요.'],
    SGVD: ['넉넉한 현실주의자', '자리와 편안함은 넉넉하게, 필요 없는 지출은 가볍게. 오래 편하게 탈 차가 좋아요.'],
    CEPA: ['도심 취향 수집가', '차는 부담 없는 크기로, 기능과 분위기는 내 취향으로. 주말에도 가만히 있기 아쉬워요.'],
    CEPD: ['운전석 취향 확실파', '내 손에 딱 맞는 크기와 새로운 기능. 운전석에 앉는 순간 기분 좋아지는 차가 끌려요.'],
    CEVA: ['신기능 못 참지', '큰 차까지는 필요 없지만 새 기능은 그냥 못 지나쳐요. 물론 월 납입료도 보고요.'],
    CEVD: ['작은 차 큰 계산', '딱 필요한 크기에 쓸 만한 새 기능. 매일의 편안함과 월 부담을 함께 살펴요.'],
    CGPA: ['작은 차 큰 취향', '크고 거창할 필요는 없어요. 알맞은 크기 안에 좋아하는 분위기는 확실히 담고 싶어요.'],
    CGPD: ['퇴근길 연장 신청자', '익숙한 조작, 내 취향의 실내. 혼자 타는 시간이 좋아 집 가는 길이 조금 아쉬워요.'],
    CGVA: ['주차 한 칸 여행가', '큰 차는 부담스럽고, 집에만 있기는 아쉬워요. 편한 차로 가볍게 떠나면 되죠.'],
    CGVD: ['월 납입 평온주의자', '필요한 만큼의 크기와 익숙한 편안함. 납입 알림이 와도 마음 편한 차가 좋아요.']
  };

  /* 답변(문항별 고른 번호 배열) → 축 점수 · 유형 · 조건 */
  function profile(answers) {
    const p = { space: 0, power: 0, value: 0, style: 0, budget: [0, Infinity], budgetLabel: '상한 미정',
      upfrontCap: null, upfrontLabel: '초기 예산 미정', passengerMin: null, passengerMax: null, passengersLabel: '인원 미정',
      annualKmCap: null, mileageLabel: '연간 거리 모름', charging: 'unknown', chargingLabel: '충전 환경 미확인',
      parking: 'unknown', parkingLabel: '주차공간 미확인', noCharger: true, domesticOnly: false, hurry: false };
    QUESTIONS.forEach((q, i) => {
      const o = q.options[answers[i]];
      if (!o) return;
      ['space', 'power', 'value', 'style'].forEach(k => { if (o[k]) p[k] += o[k]; });
      if (o.budget) p.budget = o.budget;
      ['upfrontCap', 'passengerMin', 'passengerMax', 'annualKmCap', 'charging', 'parking'].forEach(k => {
        if (Object.prototype.hasOwnProperty.call(o, k)) p[k] = o[k];
      });
      if (q.stage === 'conditions') p[q.key + 'Label'] = o.detail || o.label;
    });
    p.noCharger = !['home', 'public'].includes(p.charging);
    p.code = AXES.map(a => (p[a.key] > 0 ? a.plus : a.minus)).join('');
    p.type = { code: p.code, name: TYPES[p.code][0], desc: TYPES[p.code][1] };
    p.axes = AXES.map(a => {
      const v = p[a.key], votes = Math.abs(v) === 3 ? 3 : 2;
      return { key: a.key, plusLabel: a.plusLabel, minusLabel: a.minusLabel, side: v > 0 ? 'plus' : 'minus', label: v > 0 ? a.plusLabel : a.minusLabel, pct: Math.round(votes / 3 * 100), votes, total: 3 };
    });
    return p;
  }

  // 상한·구간·미정을 그대로 보존해요. 초기 예산을 선납금 비율이나 보증금으로 바꾸지 않아요.
  function summary(p) {
    const labels = { budget: '월 예산', upfront: '초기 예산', passengers: '탑승 인원', mileage: '연간 거리', charging: '충전 환경', parking: '주차 환경' };
    return QUESTIONS.flatMap((q, i) => q.stage === 'conditions' ? [{ key: q.key, label: labels[q.key], value: p[q.key + 'Label'], questionIndex: i }] : []);
  }

  /* 차량 속성 */
  const EXCLUDE = /Cybertruck|\bM[25]\b|X[56] M|마그마|\bGT\b|아이오닉 6 N|SL-Class|Z4|롱휠베이스|블랙|리무진|라운지|PV5/;
  const SUV_SMALL = /베뉴|코나|셀토스|티볼리|트랙스|트레일블레이저|니로|EX30|XC40|^X1$|iX1|^X2$|iX2|GLA|EQA|^UX$|EV3|아르카나/;
  const SUV_BIG = /팰리세이드|GV80|렉스턴|EV9|아이오닉 9|XC90|^X5|^X6|^X7|GLE|Q7|Q8|^iX$|EX90|Q6/;
  const SUV_MIDBIG = /쏘렌토|싼타페|그랑 콜레오스|^RX$|필랑트|모델 ?Y|Model Y/;
  const SEDAN_SMALL = /아반떼|^A3$|CLA/;
  const SEDAN_BIG = /그랜저|K8|K9|G80|G90|S-Class|7 Series|E-Class|5시리즈|^i5$|^i7$|^A6|^A8$|S90|ES90|EQE/;
  const UPPER = /그랜저|K8|K9|팰리세이드|EV9|아이오닉 9|카니발|렉스턴/;

  function sizeOf(v) {
    const n = String(v.model_name || '');
    if (v.segment === 'van') return 3;
    if (v.segment === 'hatchback') return /EV4|1 Series|A-Class/.test(n) ? 1.5 : 1;
    if (v.segment === 'coupe') return /GV80/.test(n) ? 3 : 1.5;
    if (v.segment === 'suv') return SUV_BIG.test(n) ? 3 : SUV_MIDBIG.test(n) ? 2.5 : SUV_SMALL.test(n) ? 1.5 : 2;
    if (v.segment === 'sedan') return SEDAN_BIG.test(n) ? 3 : SEDAN_SMALL.test(n) ? 1.5 : 2;
    return 2;
  }
  const monthlyOf = v => { const a = [v.rent, v.lease].filter(x => x > 0); return a.length ? Math.min(...a) : 0; };
  // 분류 값이 비어 있는 수입차(렉서스 등)가 있어 제조사로 판단해요
  const isImport = v => !/hyundai|kia|genesis|kgm|renault|chevrolet|현대|기아|제네시스|르노|쉐보레/i.test(String(v.brand || ''));
  const isGenesis = v => /genesis|제네시스/i.test(String(v.brand || ''));
  const family = v => String(v.model_name || '').replace(/\s+(하이브리드|Hybrid|EV|EVX|일렉트릭|전동화|쿠페)$/i, '').trim();

  /* 축 값(+3, +1, -1, -3)별 점수표 */
  const BODY = {
    3: { suv: 1, van: .9, hatchback: .4, sedan: .05, coupe: .05 },
    1: { suv: 1, van: .5, hatchback: .6, sedan: .45, coupe: .3 },
    '-1': { sedan: 1, hatchback: .8, coupe: .7, suv: .5, van: .1 },
    '-3': { sedan: 1, coupe: .9, hatchback: .6, suv: .15, van: 0 }
  };
  const SIZE_TARGET = { 3: 3, 1: 2.5, '-1': 1.75, '-3': 1 };

  function valueScore(p, v, monthly) {
    const imp = isImport(v), gen = isGenesis(v), up = UPPER.test(String(v.model_name || ''));
    if (p.value === 3) return imp || gen ? 1 : up ? .4 : .15;           // 고급 + 수입도 좋음
    if (p.value === 1) return gen ? 1 : up ? .8 : imp ? .05 : .35;      // 고급 + 국산
    if (p.value === -1) return imp ? (monthly && monthly < 500000 ? 1 : .3) : gen ? .3 : .8;  // 실속 + 수입도 괜찮음
    return imp ? 0 : gen ? .1 : up ? .6 : 1;                            // 실속 + 국산
  }
  function budgetScore(p, monthly) {
    const [lo, hi] = p.budget;
    if (!monthly) return 0;
    if (monthly > hi) return Math.max(0, 1 - (monthly - hi) / (hi * .25));
    if (monthly >= lo) return 1;
    return Math.max(.2, 1 - (lo - monthly) / Math.max(lo, 1) * .8);
  }

  function score(p, v, idx, total, stocked) {
    const monthly = monthlyOf(v);
    const parts = {
      size: 26 * (1 - Math.abs(SIZE_TARGET[p.space] - sizeOf(v)) / 2),
      body: 20 * (BODY[p.style][v.segment] ?? .3),
      value: 22 * valueScore(p, v, monthly),
      budget: 30 * budgetScore(p, monthly),
      stock: p.hurry && stocked ? 14 : 0,
      pop: 4 * (1 - idx / Math.max(total, 1))
    };
    return { total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
  }

  /* 추천: cars 는 인기순으로 넘겨요. stockOf(v) 는 재고 대수(없으면 0) */
  function match(answers, cars, stockOf) {
    const p = profile(answers);
    const notEv = v => !(p.noCharger && v.fuel === 'ev');
    const domestic = v => !(p.domesticOnly && isImport(v));
    const pool = (cars || []).filter(v => monthlyOf(v) > 0 && v.segment !== 'truck' && !EXCLUDE.test(String(v.model_name || '')) && notEv(v) && domestic(v));
    const [, hi] = p.budget;
    // 현재 목록의 기본 조건 참고 금액에서만 상한을 비교해요. 후보가 적어도 상한을 넓히지 않아요.
    const list = pool.filter(v => monthlyOf(v) <= hi), relaxed = 0;
    const scored = list.map(v => ({ v, s: score(p, v, pool.indexOf(v), pool.length, stockOf ? stockOf(v) : 0) }))
      .sort((a, b) => b.s.total - a.s.total);
    const seen = new Set(), picks = [];
    scored.forEach(x => { const f = family(x.v); if (!seen.has(f)) { seen.add(f); picks.push(x); } });
    const best = picks[0] || null;
    return {
      profile: p, relaxed, referenceOnly: true,
      checks: [
        '초기 예산과 연간 거리를 반영한 월 납입료는 따로 확인해야 해요.',
        '탑승 인원은 실제 등급의 정원과, 주차 환경은 차량 크기·무게와 대조해야 해요.'
      ],
      car: best && best.v,
      others: picks.slice(1, 4).map(x => x.v),
      overBudget: !!(best && monthlyOf(best.v) > hi),
      reasons: best ? reasons(p, best.v, stockOf ? stockOf(best.v) : 0) : []
    };
  }

  /* 왜 이 차인지 — 답변과 실제로 맞아떨어진 것만 말해요 */
  function reasons(p, v, stock) {
    const out = [], size = sizeOf(v), monthly = monthlyOf(v);
    if (p.space > 0 && size >= 2.5) out.push('넉넉한 크기를 좋아하는 취향을 참고했어요');
    else if (p.space < 0 && size <= 1.5) out.push('아담한 크기를 좋아하는 취향을 참고했어요');
    else if (size === 2) out.push('크지도 작지도 않은 중간 크기예요');
    if (v.fuel === 'ev') out.push('충전해서 타는 전기차예요');
    else if (v.fuel === 'hybrid') out.push('하이브리드로 분류된 차량이에요');
    else if (p.power < 0) out.push('충전 걱정 없이 주유해서 타요');
    if (p.value > 0 && (isImport(v) || isGenesis(v))) out.push(isImport(v) ? '찾으시는 수입 브랜드예요' : '국산 고급 브랜드예요');
    if (Number.isFinite(p.budget[1]) && monthly && monthly <= p.budget[1]) out.push('기본 조건의 최저 참고 금액은 월 상한 이내예요');
    if (p.hurry && stock) out.push('재고가 있어 빨리 받을 수 있어요');
    return out.slice(0, 4);
  }

  const api = { QUESTIONS, TYPES, AXES, profile, summary, match, sizeOf, monthlyOf, family, isImport, EXCLUDE };
  root.RC_MATCH = api;
})(typeof window !== 'undefined' ? window : globalThis);
