// SYNTHETIC ONLY. Every API response is local; no customer data or upstream request.
const { test, expect } = require("@playwright/test");
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, "../..");
const original = require(root + '/web_app/test/fixtures/new3_catalog_20261015.json');
const contract = require("../../web_app/test/fixtures/synthetic_selection_prepayment_api.json");
const vid = contract.quote_request.vehicle_id;
const tid = contract.quote_request.selection.vehicle_trim_id;
const catalog = { ...original.catalog[0], id: vid, price_from: 45000000, monthly_payment: 750000, representative_monthly_price: 750000, default_vehicle_trim_id: tid, base_monthly_payment: 750000 };
const detail = { ...original.details[0], id: vid, base_price: 45000000, monthly_payment: 750000, representative_monthly_price: 750000, default_vehicle_trim_id: tid, base_monthly_payment: 750000, options: [], danawa_trims: [], danawa_colors: [], trims: [{ id: tid, name: '합성 기본', base_price: 45000000, price: 45000000, is_available: true, options: [], colors: [] }], trim_selection: { mode: 'FLAT', default_vehicle_trim_id: tid, flat_grades: [{ vehicle_trim_id: tid, name: '합성 기본', display_name: '합성 기본', base_price: 45000000, is_active: true }], groups: [] } };

test('SYNTHETIC compiled app requests policy and displays 48m 20pct quote', async ({ page }, info) => {
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
 await page.route('https://api.recarplan.com/**', route => {
  const request = route.request(); const url = new URL(request.url());
  const headers = {'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'*'};
  if (request.method()==='OPTIONS') return route.fulfill({status:204,headers});
  if (request.method()==='POST') {
   const body=request.postDataJSON(); requests.push({path:url.pathname,body});
   if (url.pathname==='/api/v1/quotes/instant' && body.vehicle_id===vid && body.term===48 && body.mileage_limit===10000 && body.prepayment_pct===20) {
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
  await page.getByRole('button',{name:'4년',exact:true}).click();
  await page.getByRole('button',{name:'20%',exact:true}).click();
  await expect(page.locator('flt-semantics span').filter({hasText:/^536,600$/})).toBeAttached({timeout:20000});
  const matched=requests.filter(x=>x.path==='/api/v1/quotes/instant' && x.body.term===48 && x.body.prepayment_pct===20);
  expect(matched.length).toBeGreaterThan(0);
  expect(matched.at(-1).body.estimate_policy_version).toBe('zero_prepayment_delta_v1');
  expect(matched.at(-1).body.selection.vehicle_trim_id).toBe(tid);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  // Target visible Flutter semantics, excluding the duplicated live announcement.
  const visiblePrice = page.locator('flt-semantics span').filter({hasText:/^536,600$/});
  await visiblePrice.scrollIntoViewIfNeeded();
  await expect(visiblePrice).toBeInViewport();
  await page.screenshot({path:info.outputPath('SYNTHETIC-48m-20pct.png'),fullPage:true});
  await page.getByRole('button',{name:'3년',exact:true}).click();
  await expect(page.locator('flt-semantics span').filter({hasText:'536,600'})).toHaveCount(0,{timeout:10000});
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
