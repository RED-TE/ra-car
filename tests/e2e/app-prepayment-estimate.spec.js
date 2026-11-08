// SYNTHETIC ONLY. Every API response is local; no customer data or upstream request.
const { test, expect } = require("@playwright/test");
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, "../..");
const original = require(root + '/web_app/test/fixtures/new3_catalog_20261015.json');
const legacy = require("../../web_app/test/fixtures/synthetic_selection_prepayment_api.json");
const conditions0 = require("../../web_app/test/fixtures/conditions_24m_40000km_advance0.json");
const conditions20 = require("../../web_app/test/fixtures/conditions_24m_40000km_advance20.json");
const unavailable = require("../../web_app/test/fixtures/prepayment_unavailable_recovery.json");
const cases = [
 {name: 'v2 unsupported advance recovers after customer reduces it', contract: {quote_request: unavailable.error_request, quote_data: unavailable.recovery_response.data}, recovery: unavailable, term: 24, km: 10000, pct: 30, amount: '49,100'},
 {name: 'legacy 48m 20pct response compatibility', contract: legacy, term: 48, km: 10000, pct: 20, amount: '536,600'},
 {name: 'v2 24m 40000km zero advance', contract: {...conditions0, quote_data: conditions0.quote_response.data}, term: 24, km: 40000, pct: 0, amount: '1,115,200'},
 {name: 'v2 24m 40000km 20pct advance', contract: {...conditions20, quote_data: conditions20.quote_response.data}, term: 24, km: 40000, pct: 20, amount: '714,300'},
];
for (const sample of cases) {
const {contract, term, km, pct, amount} = sample;
const vid = contract.quote_request.vehicle_id;
const tid = contract.quote_request.selection.vehicle_trim_id;
const catalog = { ...original.catalog[0], id: vid, price_from: 45000000, monthly_payment: 750000, representative_monthly_price: 750000, default_vehicle_trim_id: tid, base_monthly_payment: 750000 };
const detail = { ...original.details[0], id: vid, base_price: 45000000, monthly_payment: 750000, representative_monthly_price: 750000, default_vehicle_trim_id: tid, base_monthly_payment: 750000, options: [], danawa_trims: [], danawa_colors: [], trims: [{ id: tid, name: '합성 기본', base_price: 45000000, price: 45000000, is_available: true, options: [], colors: [] }], trim_selection: { mode: 'FLAT', default_vehicle_trim_id: tid, flat_grades: [{ vehicle_trim_id: tid, name: '합성 기본', display_name: '합성 기본', base_price: 45000000, is_active: true }], groups: [] } };

test(`SYNTHETIC compiled app requests policy and displays ${sample.name}`, async ({ page }, info) => {
 const requests = []; const blocked = []; const consoleErrors = [];
 page.on('pageerror', error => consoleErrors.push(String(error)));
 await page.setViewportSize({ width: 390, height: 844 });
 await page.route('**/*', route => {
  const url = new URL(route.request().url());
  if (['127.0.0.1','localhost'].includes(url.hostname)) return route.fallback();
  blocked.push(url.origin); return route.abort();
 });
 await page.route('https://www.gstatic.com/flutter-canvaskit/**', route => {
  const suffix = new URL(route.request().url()).pathname.split('/').slice(3).join('/');
  const file = path.join(root, 'app/canvaskit', suffix);
  if (!file.startsWith(path.join(root,'app/canvaskit')+path.sep) || !fs.existsSync(file)) return route.abort();
  return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:file.endsWith('.wasm')?'application/wasm':'text/javascript',body:fs.readFileSync(file)});
 });
 // Material fallback fonts are fulfilled from the existing local Korean font;
 // no CDN access is needed to paint and physically click the action label.
 await page.route('https://fonts.gstatic.com/**', route => route.fulfill({
  status:200,headers:{'access-control-allow-origin':'*'},contentType:'font/ttf',
  body:fs.readFileSync(path.join(root,'app/assets/assets/fonts/pretendard/PretendardVariable.ttf')),
 }));
 await page.route('https://api.recarplan.com/**', route => {
  const request = route.request(); const url = new URL(request.url());
  const headers = {'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'*'};
  if (request.method()==='OPTIONS') return route.fulfill({status:204,headers});
  if (request.method()==='POST') {
   const body=request.postDataJSON(); requests.push({path:url.pathname,body});
   if (sample.recovery && url.pathname==='/api/v1/quotes/instant' && body.vehicle_id===vid && body.term===term && body.mileage_limit===km && body.prepayment_pct===20) {
    return route.fulfill({status:200,headers,json:sample.recovery.recovery_response});
   }
   if (url.pathname==='/api/v1/quotes/instant' && body.vehicle_id===vid && body.term===term && body.mileage_limit===km && body.prepayment_pct===pct) {
    if (sample.recovery) return route.fulfill({status:422,headers,json:sample.recovery.error_response});
    return route.fulfill({status:200,headers,json:{data:contract.quote_data,meta:{trace_id:'SYNTHETIC'}}});
   }
   return route.fulfill({status:422,headers,json:{error:{code:'PRICE_UNAVAILABLE',message:'Synthetic unprovided condition'}}});
  }
  if (request.method()!=='GET') return route.abort();
  let json=[];
  if (/\/vehicles\/?$/.test(url.pathname)) json={items:[catalog],total:1,page:1,size:100,pages:1};
  else if (url.pathname===`/api/v1/vehicles/${vid}`) json=detail;
  else if (url.pathname===`/api/v1/vehicles/${vid}/trims`) json=detail.trims;
  else if (url.pathname==='/api/v1/home-pick') json={enabled:false,items:[]};
  return route.fulfill({status:200,headers,json});
 });
 try {
  await page.goto('/app/');
  await page.waitForSelector('flt-semantics-placeholder',{state:'attached'});
  await page.evaluate(()=>document.querySelector('flt-semantics-placeholder').click());
  await expect(page.getByRole('button',{name:'전체 차량',exact:true})).toBeAttached({timeout:30000});
  await page.getByRole('button',{name:'전체 차량',exact:true}).click();
  await page.getByRole('button',{name:/^제네시스 GV80 Hybrid, 월/}).click();
  await page.getByRole('button',{name: `${term / 12}년`,exact:true}).click();
  if (km === 40000) await page.getByRole('button',{name:'4만',exact:true}).click();
  await page.getByRole('button',{name: `${pct}%`,exact:true}).click();
  if (sample.recovery) {
   await expect(page.getByText('선납금을 낮춰 다시 계산해 주세요.',{exact:true})).toBeAttached({timeout:20000});
   await expect(page.locator('flt-semantics span').filter({hasText:new RegExp(`^${amount}$`)})).toHaveCount(0);
   const rejected=requests.filter(x=>x.path==='/api/v1/quotes/instant' && x.body.term===term && x.body.mileage_limit===km && x.body.prepayment_pct===30);
   expect(rejected.length).toBeGreaterThan(0);
   expect(rejected.at(-1).body.estimate_policy_version).toBe('zero_source_conditions_delta_v1');
   // No automatic condition substitution; recovery requires the customer's tap.
   const rejectedIndex=requests.indexOf(rejected.at(-1));
   expect(requests.slice(rejectedIndex+1).filter(x=>x.path==='/api/v1/quotes/instant' && x.body.prepayment_pct===20)).toHaveLength(0);
   const recoveryNotice=page.getByText('선납금을 낮춰 다시 계산해 주세요.',{exact:true});
   // Use real wheel input: scrolling the semantics DOM alone does not move CanvasKit.
   await page.mouse.move(200,400);
   await page.mouse.wheel(0,-3000);
   await page.waitForTimeout(400);
   await expect(recoveryNotice).toBeInViewport();
   await page.screenshot({path:info.outputPath('SYNTHETIC-unsupported-advance30.png'),fullPage:true});
   const change=page.getByRole('button',{name:'선납금 변경',exact:true});
   const changeBox=await change.boundingBox();
   expect(changeBox).not.toBeNull();
   await page.mouse.click(changeBox.x+changeBox.width/2,changeBox.y+changeBox.height/2);
   await expect(page.getByText('조건 설정',{exact:true})).toBeVisible();
   await page.waitForTimeout(400);
   await page.screenshot({path:info.outputPath('SYNTHETIC-condition-sheet-before-change.png'),fullPage:true});
   const advance=page.getByRole('button',{name:'20%',exact:true}).last();
   const advanceBox=await advance.boundingBox();
   expect(advanceBox).not.toBeNull();
   await page.mouse.click(advanceBox.x+advanceBox.width/2,advanceBox.y+advanceBox.height/2);
   const apply=page.getByRole('button',{name:'조건 적용하기',exact:true});
   const applyBox=await apply.boundingBox();
   expect(applyBox).not.toBeNull();
   await page.mouse.click(applyBox.x+applyBox.width/2,applyBox.y+applyBox.height/2);
   await expect(page.getByText('조건 설정',{exact:true})).toHaveCount(0);
   await info.attach('physical-recovery-clicks',{body:Buffer.from(JSON.stringify({changeBox,advanceBox,applyBox})),contentType:'application/json'});
  }
  await expect(page.locator('flt-semantics span').filter({hasText:new RegExp(`^${amount}$`)})).toBeAttached({timeout:20000});
  const expectedPct=sample.recovery ? 20 : pct;
  const matched=requests.filter(x=>x.path==='/api/v1/quotes/instant' && x.body.term===term && x.body.mileage_limit===km && x.body.prepayment_pct===expectedPct);
  expect(matched.length).toBeGreaterThan(0);
  expect(matched.at(-1).body.estimate_policy_version).toBe('zero_source_conditions_delta_v1');
  expect(matched.at(-1).body.selection.vehicle_trim_id).toBe(tid);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  // Target visible Flutter semantics, excluding the duplicated live announcement.
  const visiblePrice = page.locator('flt-semantics span').filter({hasText:new RegExp(`^${amount}$`)});
  await page.mouse.move(200,400);
  await page.mouse.wheel(0,-3000);
  await page.waitForTimeout(400);
  await expect(visiblePrice).toBeInViewport();
  await page.screenshot({path:info.outputPath(`SYNTHETIC-${term}m-${km}km-${expectedPct}pct.png`),fullPage:true});
  await page.getByRole('button',{name:'3년',exact:true}).click();
  await expect(page.locator('flt-semantics span').filter({hasText:amount})).toHaveCount(0,{timeout:10000});
  // Offline verification intentionally blocks Firebase CDN module loading.
  expect(consoleErrors.filter(error => !error.startsWith('TypeError: Failed to fetch dynamically imported module: https://www.gstatic.com/firebasejs/'))).toEqual([]);
 } finally {
  await info.attach('synthetic-requests',{body:Buffer.from(JSON.stringify({requests,blocked,consoleErrors},null,2)),contentType:'application/json'});
  if (!page.isClosed()) {
   const semantics = await page.locator('body').ariaSnapshot({timeout:2000}).catch(() => 'Page closed during failure capture');
   await info.attach('semantics',{body:Buffer.from(semantics),contentType:'text/plain'});
  }
 }
});

}
