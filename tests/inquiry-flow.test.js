const assert = require("node:assert/strict");
const { test } = require("node:test");
const { getEventListeners } = require("node:events");

const catalogModule = import("../inquiry/catalog.mjs");

function vehicle(id = "qa-lease", overrides = {}) {
  return {
    id, brand: "현대", model_name: "테스트 차량", available_product_types: ["LEASE"],
    monthly_payment: 987654, image_url: "", ...overrides,
  };
}

function trim(id = "qa-trim", overrides = {}) {
  return {
    id, name: "테스트 트림", display_name: "테스트 트림", is_available: true,
    colors: [
      { id: "qa-white", name: "화이트", type: "exterior", hex: "#ffffff" },
      { id: "qa-black", name: "블랙", type: "interior", hex: "#111111" },
    ], ...overrides,
  };
}

function selection() {
  const selectedTrim = trim();
  return {
    vehicle: vehicle(),
    detail: {
      id: "qa-lease", trims: [selectedTrim],
      trim_selection: { mode: "FLAT", flat_grades: [{ vehicle_trim_id: selectedTrim.id, is_active: true }] },
    },
    trim: selectedTrim, exterior: selectedTrim.colors[0], interior: selectedTrim.colors[1],
    conditions: { product: "LEASE", term: 48, mileage: 30000, deposit: 20, prepayment: 10, age: 26 },
  };
}

const contact = () => ({ name: "  로컬 테스트  ", phone: "010-0000-0000", agreed: true });

function envelope(items, overrides = {}) {
  return { items, total: items.length, page: 1, pages: 1, ...overrides };
}

function mockPages(pages) {
  const calls = [];
  return {
    calls,
    request: async pathname => {
      calls.push(pathname);
      const url = new URL(pathname, "http://localhost");
      assert.equal(url.pathname, "/api/v1/vehicles/");
      assert.equal(url.searchParams.get("size"), "100");
      assert.equal(url.searchParams.get("sort"), "display_order");
      const page = Number(url.searchParams.get("page"));
      assert.equal(page, calls.length);
      assert.ok(pages[page - 1], `unexpected catalog page ${page}`);
      return structuredClone(pages[page - 1]);
    },
  };
}

function memoryStorage() {
  const entries = new Map();
  const writes = [];
  return {
    entries, writes,
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); writes.push({ key, value }); },
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

async function cachedCatalog(storage, now = () => 1_000_000) {
  const { loadCatalog } = await catalogModule;
  return loadCatalog(mockPages([envelope([vehicle("cached")])]).request, { storage, now });
}

test("inquiry exposes exactly six ordered steps", async () => {
  const { STEPS } = await catalogModule;
  assert.deepEqual(STEPS, ["제조사", "차량", "트림·색상", "이용조건", "연락처", "최종 확인"]);
});

test("catalog loads every page and counts unsupported products without publishing them", async () => {
  const { loadCatalog } = await catalogModule;
  const source = [
    envelope([vehicle("lease"), vehicle("unknown", { available_product_types: ["CASH"] })], { total: 4, pages: 2 }),
    envelope([
      vehicle("rental", { available_product_types: ["RENTAL", "RENTAL", "UNKNOWN", "LEASE"] }),
      vehicle("none", { available_product_types: [] }),
    ], { total: 4, page: 2, pages: 2 }),
  ];
  const before = structuredClone(source);
  const mock = mockPages(source);
  const result = await loadCatalog(mock.request);
  assert.equal(mock.calls.length, 2);
  assert.deepEqual(result.map(row => [row.id, row.available_product_types]), [
    ["lease", ["LEASE"]], ["rental", ["RENTAL", "LEASE"]],
  ]);
  assert.deepEqual(source, before);
});

test("an empty catalog is a normal data result, not an invented fallback", async () => {
  const { loadCatalog } = await catalogModule;
  for (const pages of [0, 1]) {
    const mock = mockPages([envelope([], { pages })]);
    assert.deepEqual(await loadCatalog(mock.request), []);
    assert.equal(mock.calls.length, 1);
  }
});

for (const [name, pages, error] of [
  ["total changes", [envelope([vehicle("a")], { total: 2, pages: 2 }), envelope([vehicle("b")], { total: 3, page: 2, pages: 2 })], "CATALOG_CHANGED"],
  ["page count changes", [envelope([vehicle("a")], { total: 2, pages: 2 }), envelope([vehicle("b")], { total: 2, page: 2, pages: 3 })], "CATALOG_CHANGED"],
  ["missing final row", [envelope([vehicle("a")], { total: 3, pages: 2 }), envelope([vehicle("b")], { total: 3, page: 2, pages: 2 })], "CATALOG_INCOMPLETE"],
  ["too many rows", [envelope([vehicle("a"), vehicle("b")], { total: 1 })], "CATALOG_INCOMPLETE"],
  ["empty intermediate page", [envelope([], { total: 2, pages: 2 })], "CATALOG_INCOMPLETE"],
  ["duplicate on one page", [envelope([vehicle("a"), vehicle("a")])], "CATALOG_INVALID"],
  ["duplicate across pages", [envelope([vehicle("a")], { total: 2, pages: 2 }), envelope([vehicle("a")], { total: 2, page: 2, pages: 2 })], "CATALOG_INVALID"],
]) {
  test(`catalog rejects ${name} without returning a partial catalog`, async () => {
    const { loadCatalog } = await catalogModule;
    const mock = mockPages(pages);
    await assert.rejects(loadCatalog(mock.request), { message: error });
    assert.equal(mock.calls.length, pages.length);
  });
}

test("catalog rejects invalid pagination metadata", async t => {
  const { loadCatalog } = await catalogModule;
  for (const [name, changes] of [
    ["missing items", { items: null }], ["negative total", { total: -1 }],
    ["fractional total", { total: 1.5 }], ["string total", { total: "1" }],
    ["negative pages", { pages: -1 }], ["fractional pages", { pages: 1.5 }],
    ["more than twenty pages", { pages: 21 }], ["wrong page", { page: 2 }],
    ["string page", { page: "1" }], ["zero pages with nonempty total", { pages: 0 }],
    ["more than twenty full pages", { total: 2001 }],
  ]) {
    await t.test(name, async () => {
      const mock = mockPages([envelope([vehicle()], changes)]);
      await assert.rejects(loadCatalog(mock.request), { message: "CATALOG_INVALID" });
    });
  }
});

test("catalog rejects malformed identifiers and row contracts", async () => {
  const { loadCatalog } = await catalogModule;
  for (const row of [null, vehicle(""), vehicle(123), vehicle("a", { brand: "" }),
    vehicle("a", { model_name: null }), vehicle("a", { available_product_types: null })]) {
    await assert.rejects(loadCatalog(mockPages([envelope([row])]).request), { message: "CATALOG_INVALID" });
  }
});

test("catalog accepts the twentieth advertised page and stops there", async () => {
  const { loadCatalog } = await catalogModule;
  const mock = mockPages(Array.from({ length: 20 }, (_, index) =>
    envelope([vehicle(`qa-${index}`)], { total: 20, page: index + 1, pages: 20 })));
  assert.equal((await loadCatalog(mock.request)).length, 20);
  assert.equal(mock.calls.length, 20);
});

test("a later catalog network failure never falls back to earlier rows", async () => {
  const { loadCatalog } = await catalogModule;
  let calls = 0;
  await assert.rejects(loadCatalog(async () => {
    if (++calls === 1) return envelope([vehicle()], { total: 2, pages: 2 });
    throw new Error("LOCAL_OFFLINE");
  }), { message: "LOCAL_OFFLINE" });
  assert.equal(calls, 2);
});

function discoveryResult(overrides = {}) {
  return {
    contract_version: "discovery_v1", complete: true, revision: "a".repeat(64), total: 1,
    items: [{ id: "live-discovery", brand: "Genesis", model_name: "GV80 Hybrid 블랙", available_product_types: ["RENTAL"],
      image_url: "https://api.recarplan.com/assets/vehicle.png" }], ...overrides,
  };
}

test("fast discovery uses one complete price-free response, keeps canonical IDs and stores only discovery fields", async () => {
  const { loadCatalog, CATALOG_CACHE_KEY } = await catalogModule;
  const storage = memoryStorage();
  const calls = [];
  const result = await loadCatalog(async path => { calls.push(path); return discoveryResult(); }, { storage, preferDiscovery: true });
  assert.deepEqual(calls, ["/api/v1/vehicles/discovery"]);
  assert.deepEqual(result, discoveryResult().items);
  assert.deepEqual(JSON.parse(storage.getItem(CATALOG_CACHE_KEY)).items, result);
});

test("only an older API's 404 can fall back to paginated discovery", async () => {
  const { loadCatalog } = await catalogModule;
  const calls = [];
  const result = await loadCatalog(async path => {
    calls.push(path);
    if (path === "/api/v1/vehicles/discovery") throw new Error("API_HTTP_404");
    return envelope([vehicle("legacy-public")]);
  }, { storage: null, preferDiscovery: true });
  assert.equal(result[0].id, "legacy-public");
  assert.deepEqual(calls, ["/api/v1/vehicles/discovery", "/api/v1/vehicles/?page=1&size=100&sort=display_order"]);
  for (const message of ["API_HTTP_500", "API_HTTP_522", "NETWORK_ERROR", "API_HTTP_403"]) {
    let count = 0;
    await assert.rejects(loadCatalog(async () => { count++; throw new Error(message); }, { storage: null, preferDiscovery: true }), { message });
    assert.equal(count, 1);
  }
});

test("fast discovery rejects malformed or partial contracts without priced-page fallback or partial caching", async () => {
  const { loadCatalog } = await catalogModule;
  const valid = discoveryResult();
  for (const result of [
    null, discoveryResult({ complete: false }), discoveryResult({ contract_version: "catalog_v1" }),
    discoveryResult({ revision: "unknown" }), discoveryResult({ total: 2 }), discoveryResult({ total: "1" }),
    discoveryResult({ total: 2, items: [valid.items[0], valid.items[0]] }),
    discoveryResult({ items: [{ ...valid.items[0], monthly_payment: 100000 }] }),
    discoveryResult({ items: [{ ...valid.items[0], available_product_types: ["UNKNOWN"] }] }),
  ]) {
    const storage = memoryStorage();
    let calls = 0;
    await assert.rejects(loadCatalog(async () => { calls++; return result; }, { storage, preferDiscovery: true }), { message: "CATALOG_INVALID" });
    assert.equal(calls, 1);
    assert.equal(storage.writes.length, 0);
  }
});

test("parallel pages are capped at two, overlap in time and retain display order after out-of-order completion", async () => {
  const { loadCatalog, CATALOG_CACHE_KEY } = await catalogModule;
  const storage = memoryStorage();
  const gates = new Map([2, 3, 4, 5].map(page => [page, deferred()]));
  const calls = [];
  let active = 0, peak = 0, finished = false, clock = 1_000_000;
  const ids = ["z-first", "a-second", "y-third", "b-fourth", "x-fifth"];
  const request = async pathname => {
    const page = Number(new URL(pathname, "http://localhost").searchParams.get("page"));
    calls.push(page);
    active++;
    peak = Math.max(peak, active);
    try {
      if (page > 1) await gates.get(page).promise;
      return envelope([vehicle(ids[page - 1])], { total: 5, pages: 5, page });
    } finally { active--; }
  };
  const result = loadCatalog(request, { storage, now: () => clock }).then(items => { finished = true; return items; });
  try {
    await nextTurn();
    assert.deepEqual(calls, [1, 2, 3]);
    assert.equal(active, 2);
    gates.get(3).resolve();
    await nextTurn();
    assert.equal(finished, false);
    assert.ok(active <= 2);
    gates.get(2).resolve();
    await nextTurn();
    assert.deepEqual(calls, [1, 2, 3, 4, 5]);
    gates.get(5).resolve();
    await nextTurn();
    assert.equal(finished, false);
    assert.equal(storage.writes.length, 0);
    clock += 50;
    gates.get(4).resolve();
    assert.deepEqual((await result).map(item => item.id), ids);
    assert.equal(JSON.parse(storage.getItem(CATALOG_CACHE_KEY)).saved_at, clock);
    assert.equal(peak, 2);
    assert.equal(active, 0);
  } finally {
    for (const gate of gates.values()) gate.resolve();
    await result.catch(() => {});
  }
});

test("a parallel page failure aborts its sibling, schedules no later pages and writes no partial cache", async () => {
  const { loadCatalog } = await catalogModule;
  const storage = memoryStorage();
  const calls = [], signals = [];
  const failure = new Error("LOCAL_PAGE_THREE_FAILED");
  let siblingAborted = false;
  await assert.rejects(loadCatalog(async (pathname, { signal }) => {
    const page = Number(new URL(pathname, "http://localhost").searchParams.get("page"));
    calls.push(page); signals.push(signal);
    if (page === 1) return envelope([vehicle("first")], { total: 5, pages: 5 });
    if (page === 3) throw failure;
    assert.equal(page, 2);
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => {
      siblingAborted = true;
      reject(signal.reason);
    }, { once: true }));
  }, { storage }), failure);
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(siblingAborted, true);
  assert.ok(signals.every(signal => signal.aborted));
  assert.equal(storage.writes.length, 0);
});

test("duplicates and total/page changes in parallel responses never commit a catalog", async () => {
  const { loadCatalog } = await catalogModule;
  for (const [last, error] of [
    [envelope([vehicle("second")], { total: 3, page: 3, pages: 3 }), "CATALOG_INVALID"],
    [envelope([vehicle("third")], { total: 4, page: 3, pages: 3 }), "CATALOG_CHANGED"],
    [envelope([vehicle("third")], { total: 3, page: 3, pages: 4 }), "CATALOG_CHANGED"],
  ]) {
    const storage = memoryStorage();
    const mock = mockPages([
      envelope([vehicle("first")], { total: 3, pages: 3 }),
      envelope([vehicle("second")], { total: 3, page: 2, pages: 3 }), last,
    ]);
    await assert.rejects(loadCatalog(mock.request, { storage }), { message: error });
    assert.equal(storage.writes.length, 0);
  }
});

test("cache stores only minimal discovery fields, safe images and server display order, never prices or contact data", async () => {
  const { loadCatalog, CATALOG_CACHE_KEY } = await catalogModule;
  const storage = memoryStorage();
  storage.entries.set("unrelated-saved-quote", "preserve-me");
  const mock = mockPages([envelope([
    vehicle("z", {
      available_product_types: ["LEASE", "LEASE", "UNKNOWN"],
      image_url: "/assets/z.png", thumbnail_url: "https://api.recarplan.com/assets/thumb.png",
      representative_monthly_price: 100000, finance_company: "LOCAL_ONLY",
      name: "PRIVATE_NAME", phone: "PRIVATE_PHONE", trims: [trim()],
    }),
    vehicle("a", { image_url: "javascript:alert(1)" }),
  ])]);
  const first = await loadCatalog(mock.request, { storage, now: () => 1_000_000 });
  assert.deepEqual(first, [
    { id: "z", brand: "현대", model_name: "테스트 차량", available_product_types: ["LEASE"],
      image_url: "https://api.recarplan.com/assets/z.png", thumbnail_url: "https://api.recarplan.com/assets/thumb.png" },
    { id: "a", brand: "현대", model_name: "테스트 차량", available_product_types: ["LEASE"] },
  ]);
  assert.deepEqual(storage.writes.map(write => write.key), [CATALOG_CACHE_KEY]);
  const saved = storage.getItem(CATALOG_CACHE_KEY);
  for (const forbidden of ["monthly_payment", "price", "finance_company", "PRIVATE_NAME", "PRIVATE_PHONE", "trims"]) {
    assert.equal(saved.includes(forbidden), false, forbidden);
  }
  const cached = await loadCatalog(async () => assert.fail("fresh cache must not request the API"), { storage, now: () => 1_000_001 });
  assert.deepEqual(cached, first);
  assert.equal(storage.getItem("unrelated-saved-quote"), "preserve-me");
  cached[0].model_name = "caller mutation";
  assert.deepEqual(await loadCatalog(async () => assert.fail("still fresh"), { storage, now: () => 1_000_002 }), first);
});

test("fresh cache avoids requests without sliding its TTL; exactly five minutes forces a new complete fetch", async () => {
  const { loadCatalog, CATALOG_CACHE_TTL, CATALOG_CACHE_KEY } = await catalogModule;
  const storage = memoryStorage();
  const first = await cachedCatalog(storage);
  const saved = storage.getItem(CATALOG_CACHE_KEY);
  assert.deepEqual(await loadCatalog(async () => assert.fail("cache is still fresh"), {
    storage, now: () => 1_000_000 + CATALOG_CACHE_TTL - 1,
  }), first);
  assert.equal(storage.getItem(CATALOG_CACHE_KEY), saved);
  assert.equal(storage.writes.length, 1);
  const mock = mockPages([envelope([vehicle("refreshed")])]);
  const refreshed = await loadCatalog(mock.request, { storage, now: () => 1_000_000 + CATALOG_CACHE_TTL });
  assert.equal(mock.calls.length, 1);
  assert.equal(refreshed[0].id, "refreshed");
  assert.equal(JSON.parse(storage.getItem(CATALOG_CACHE_KEY)).saved_at, 1_000_000 + CATALOG_CACHE_TTL);
});

test("corrupt or incompatible caches are fully validated before reuse", async t => {
  const { loadCatalog, CATALOG_CACHE_KEY } = await catalogModule;
  for (const [label, corrupt] of [
    ["invalid JSON", () => "{"],
    ["wrong version", cache => ({ ...cache, contract_version: "unknown" })],
    ["wrong ordering", cache => ({ ...cache, sort: "price" })],
    ["partial catalog", cache => ({ ...cache, complete: false })],
    ["wrong total", cache => ({ ...cache, total: 2 })],
    ["duplicate IDs", cache => ({ ...cache, total: 2, items: [cache.items[0], cache.items[0]] })],
    ["invalid ID", cache => { cache.items[0].id = ""; return cache; }],
    ["invalid model", cache => { cache.items[0].model_name = null; return cache; }],
    ["unknown product", cache => { cache.items[0].available_product_types = ["CASH"]; return cache; }],
    ["duplicate product", cache => { cache.items[0].available_product_types = ["LEASE", "LEASE"]; return cache; }],
    ["unexpected price", cache => { cache.items[0].monthly_payment = 1; return cache; }],
    ["unsafe image", cache => { cache.items[0].image_url = "javascript:alert(1)"; return cache; }],
    ["future timestamp", cache => ({ ...cache, saved_at: 1_000_001 })],
    ["missing timestamp", cache => { delete cache.saved_at; return cache; }],
    ["empty cached result", cache => ({ ...cache, total: 0, items: [] })],
  ]) {
    await t.test(label, async () => {
      const storage = memoryStorage();
      await cachedCatalog(storage);
      const changed = corrupt(JSON.parse(storage.getItem(CATALOG_CACHE_KEY)));
      storage.entries.set(CATALOG_CACHE_KEY, typeof changed === "string" ? changed : JSON.stringify(changed));
      const mock = mockPages([envelope([vehicle("recovered")])]);
      const result = await loadCatalog(mock.request, { storage, now: () => 1_000_000 });
      assert.equal(mock.calls.length, 1);
      assert.equal(result[0].id, "recovered");
    });
  }
});

test("empty and unsupported-only results are never cached, so explicit retry can see new vehicles", async () => {
  const { loadCatalog } = await catalogModule;
  for (const items of [[], [vehicle("unsupported", { available_product_types: ["CASH"] })]]) {
    const storage = memoryStorage();
    assert.deepEqual(await loadCatalog(mockPages([envelope(items)]).request, { storage }), []);
    assert.equal(storage.writes.length, 0);
    const mock = mockPages([envelope([vehicle("now-available")])]);
    assert.equal((await loadCatalog(mock.request, { storage }))[0].id, "now-available");
    assert.equal(mock.calls.length, 1);
  }
});

test("forceRefresh bypasses a fresh cache; failed and expired refreshes never fall back to stale data", async () => {
  const { loadCatalog, CATALOG_CACHE_KEY, CATALOG_CACHE_TTL } = await catalogModule;
  const storage = memoryStorage();
  await cachedCatalog(storage);
  const saved = storage.getItem(CATALOG_CACHE_KEY);
  for (const options of [
    { forceRefresh: true, now: () => 1_000_001 },
    { now: () => 1_000_000 + CATALOG_CACHE_TTL },
  ]) {
    let calls = 0;
    await assert.rejects(loadCatalog(async () => { calls++; throw new Error("LOCAL_OFFLINE"); }, { storage, ...options }), { message: "LOCAL_OFFLINE" });
    assert.equal(calls, 1);
    assert.equal(storage.getItem(CATALOG_CACHE_KEY), saved);
    assert.equal(storage.writes.length, 1);
  }
  const mock = mockPages([envelope([vehicle("forced")])]);
  assert.equal((await loadCatalog(mock.request, { storage, now: () => 1_000_001, forceRefresh: true }))[0].id, "forced");
});

test("blocked storage and quota failures do not block a verified catalog or modify other records", async () => {
  const { loadCatalog } = await catalogModule;
  for (const storage of [
    null,
    { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } },
    { getItem: () => null, setItem: () => { throw new Error("quota"); } },
  ]) {
    const mock = mockPages([envelope([vehicle("online")])]);
    assert.equal((await loadCatalog(mock.request, { storage }))[0].id, "online");
    assert.equal(mock.calls.length, 1);
  }
});

test("canceling catalog pagination aborts both pending pages, removes listeners and never caches partial rows", async () => {
  const { loadCatalog } = await catalogModule;
  const storage = memoryStorage();
  const controller = new AbortController();
  const failure = new Error("LOCAL_CATALOG_CANCELLED");
  const calls = [], aborted = [];
  const result = loadCatalog(async (pathname, { signal }) => {
    const page = Number(new URL(pathname, "http://localhost").searchParams.get("page"));
    calls.push(page);
    if (page === 1) return envelope([vehicle("first")], { total: 5, pages: 5 });
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => {
      aborted.push(page); reject(signal.reason);
    }, { once: true }));
  }, { storage, signal: controller.signal });
  const rejected = assert.rejects(result, failure);
  await nextTurn();
  assert.deepEqual(calls, [1, 2, 3]);
  controller.abort(failure);
  await rejected;
  assert.deepEqual(aborted, [2, 3]);
  assert.equal(storage.writes.length, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("UNAVAILABLE overrides an otherwise populated trim list", async () => {
  const { selectableTrims } = await catalogModule;
  assert.deepEqual(selectableTrims({ trims: [trim()], trim_selection: { mode: "UNAVAILABLE" } }), []);
});

for (const mode of ["GROUPED", "FLAT"]) {
  test(`${mode} exposes only active leaves bound to this detail's available trims`, async () => {
    const { selectableTrims } = await catalogModule;
    const grades = [
      { vehicle_trim_id: "valid", is_active: true },
      { vehicle_trim_id: "inactive-leaf", is_active: false },
      { vehicle_trim_id: "unavailable-trim", is_active: true },
      { vehicle_trim_id: "foreign-trim", is_active: true },
      { vehicle_trim_id: "missing-activity" },
      { vehicle_trim_id: "truthy-activity", is_active: "true" },
    ];
    const detail = {
      trims: [trim("valid"), trim("inactive-leaf"), trim("unavailable-trim", { is_available: false }),
        trim("missing-activity"), trim("truthy-activity")],
      trim_selection: mode === "GROUPED" ? { mode, groups: [{ grades }] } : { mode, flat_grades: grades },
    };
    const before = structuredClone(detail);
    assert.deepEqual(selectableTrims(detail).map(row => row.id), ["valid"]);
    assert.deepEqual(detail, before);
  });
}

test("legacy detail without hierarchy still filters unavailable trims; unknown modes fail closed", async () => {
  const { selectableTrims } = await catalogModule;
  const trims = [trim("available"), trim("implicit", { is_available: undefined }), trim("disabled", { is_available: false }), trim("")];
  assert.deepEqual(selectableTrims({ trims }).map(row => row.id), ["available", "implicit"]);
  assert.deepEqual(selectableTrims({ trims, trim_selection: { mode: "UNKNOWN" } }), []);
});

test("zero colors is normal and color choices stay separated by type", async () => {
  const { colorsFor, inquiryPayload } = await catalogModule;
  assert.deepEqual(colorsFor(null, "exterior"), []);
  assert.deepEqual(colorsFor(trim("none", { colors: [] }), "interior"), []);
  const state = selection();
  state.trim.colors = [];
  state.exterior = state.interior = null;
  const body = inquiryPayload(state, contact(), "");
  assert.match(body.condition_summary, /외장: 상담 시 확인/);
  assert.match(body.condition_summary, /내장: 상담 시 확인/);
  assert.equal(body.quoted_monthly_payment, null);
  assert.deepEqual(colorsFor(trim("mixed", { colors: [
    ...trim().colors, { id: "", name: "무효", type: "exterior" },
    { id: "no-name", name: "", type: "exterior" }, { id: "wrong-type", name: "무효", type: "EXTERIOR" },
  ] }), "exterior").map(row => row.id), ["qa-white"]);
});

test("payload keeps selected conditions and IDs but never promotes the list monthly payment to a quote", async () => {
  const { inquiryPayload } = await catalogModule;
  const state = selection();
  const before = structuredClone(state);
  const body = inquiryPayload(state, contact(), "RC-LOCAL123");
  assert.deepEqual(body, {
    name: "로컬 테스트", phone: "01000000000", privacy_agreed: true,
    vehicle_name: "현대 테스트 차량", trim_name: "테스트 트림", product_type: "LEASE",
    condition_summary: "단계형 문의 /inquiry/ · vehicle_id=qa-lease · trim_id=qa-trim · 외장: 화이트 (qa-white) · 내장: 블랙 (qa-black) · 48개월 · 연 30,000km · 보증금 20% · 선납금 10%",
    term_months: 48, mileage_per_year: 30000, quoted_monthly_payment: null, referral_code: "RC-LOCAL123",
  });
  assert.equal(JSON.stringify(body).includes("987654"), false);
  assert.doesNotMatch(body.condition_summary, /보험연령/);
  assert.deepEqual(state, before);
  assert.equal(Object.hasOwn(inquiryPayload(state, contact(), ""), "referral_code"), false);
});

test("RENTAL includes the selected insurance age while LEASE does not", async () => {
  const { inquiryPayload } = await catalogModule;
  const state = selection();
  state.vehicle.available_product_types = ["RENTAL", "LEASE"];
  state.conditions.product = "RENTAL";
  state.conditions.age = 21;
  assert.match(inquiryPayload(state, contact(), "").condition_summary, /보험연령 만 21세 이상/);
  state.conditions.product = "LEASE";
  assert.doesNotMatch(inquiryPayload(state, contact(), "").condition_summary, /보험연령/);
});

test("LEASE-only vehicles reject RENTAL rather than inventing a product", async () => {
  const { inquiryPayload } = await catalogModule;
  const state = selection();
  assert.equal(inquiryPayload(state, contact(), "").product_type, "LEASE");
  state.conditions.product = "RENTAL";
  assert.throws(() => inquiryPayload(state, contact(), ""), { message: "CONDITIONS_INVALID" });
});

test("payload rejects foreign vehicle IDs, foreign trims, inactive leaves and unavailable selections", async () => {
  const { inquiryPayload } = await catalogModule;
  for (const mutate of [
    state => { state.vehicle = null; },
    state => { state.detail.id = "foreign-vehicle"; },
    state => { state.trim = trim("foreign-trim"); },
    state => { state.detail.trims[0].is_available = false; },
    state => { state.detail.trim_selection.flat_grades[0].is_active = false; },
    state => { state.detail.trim_selection.flat_grades[0].vehicle_trim_id = "foreign-trim"; },
    state => { state.detail.trim_selection = { mode: "UNAVAILABLE" }; },
  ]) {
    const state = selection();
    mutate(state);
    assert.throws(() => inquiryPayload(state, contact(), ""), { message: "SELECTION_INVALID" });
  }
});

test("payload accepts each advertised condition value", async () => {
  const { inquiryPayload } = await catalogModule;
  for (const [key, values] of Object.entries({
    term: [24, 36, 48, 60], mileage: [10000, 20000, 30000, 40000],
    deposit: [0, 10, 20, 30, 40], prepayment: [0, 10, 20, 30, 40], age: [21, 26],
  })) {
    for (const value of values) {
      const state = selection();
      state.conditions[key] = value;
      assert.doesNotThrow(() => inquiryPayload(state, contact(), ""));
    }
  }
});

test("payload rejects unsupported conditions and stringified numeric values", async () => {
  const { inquiryPayload } = await catalogModule;
  for (const [key, value] of [
    ["product", "CASH"], ["term", 72], ["term", "48"], ["mileage", 15000],
    ["deposit", -10], ["prepayment", 50], ["age", 18], ["age", "26"],
  ]) {
    const state = selection();
    state.conditions[key] = value;
    assert.throws(() => inquiryPayload(state, contact(), ""), { message: "CONDITIONS_INVALID" });
  }
});

test("required colors and foreign color IDs cannot bypass payload validation", async () => {
  const { inquiryPayload } = await catalogModule;
  for (const mutate of [
    state => { state.exterior = null; }, state => { state.interior = null; },
    state => { state.exterior = { id: "foreign-color", name: "다른 트림 색상" }; },
    state => { state.interior = state.exterior; },
  ]) {
    const state = selection();
    mutate(state);
    assert.throws(() => inquiryPayload(state, contact(), ""), { message: "COLOR_INVALID" });
  }
});

test("contact consent, name and mobile number are validated again at payload creation", async () => {
  const { inquiryPayload, validPhone } = await catalogModule;
  for (const overrides of [
    { name: "  " }, { name: "a".repeat(101) }, { phone: "02-0000-0000" },
    { phone: "010-123" }, { agreed: false },
  ]) assert.throws(() => inquiryPayload(selection(), { ...contact(), ...overrides }, ""), { message: "CONTACT_INVALID" });
  assert.equal(validPhone("010-0000-0000"), true);
  assert.equal(validPhone("011-000-0000"), true);
  assert.equal(validPhone("010-0000-00000"), false);
  assert.equal(validPhone(""), false);
});

test("an oversized selection summary fails closed", async () => {
  const { inquiryPayload } = await catalogModule;
  const state = selection();
  state.exterior.name = "a".repeat(1001);
  assert.throws(() => inquiryPayload(state, contact(), ""), { message: "SUMMARY_TOO_LONG" });
});

test("referral precedence is explicit query, app storage, then legacy storage without rewriting storage", async () => {
  const { referralCode } = await catalogModule;
  const entries = { "flutter.recar_referral_code": '"RC-APP123"', recar_referral_code: "RC-OLD123" };
  const before = { ...entries };
  const storage = { getItem: key => entries[key] ?? null, setItem: () => assert.fail("storage must not be changed") };
  assert.equal(referralCode("?ref=rc-new123&utm_source=local", storage), "RC-NEW123");
  assert.equal(referralCode("?ref=invalid", storage), "");
  assert.equal(referralCode("?ref=", storage), "");
  assert.equal(referralCode("", storage), "RC-APP123");
  assert.equal(referralCode("", { getItem: key => key.startsWith("flutter.") ? "broken-json" : "rc-old123" }), "RC-OLD123");
  assert.equal(referralCode("", { getItem: () => { throw new Error("storage disabled"); } }), "");
  assert.deepEqual(entries, before);
});

test("images accept HTTPS only and never accept URL credentials", async () => {
  const { safeImage } = await catalogModule;
  assert.equal(safeImage("/assets/local-test.png"), "https://api.recarplan.com/assets/local-test.png");
  for (const value of ["", "javascript:alert(1)", "data:image/png;base64,AA", "http://localhost/x", "https://user:secret@example.invalid/x"]) {
    assert.equal(safeImage(value), "");
  }
});

test("requestJson uses only an injected fetcher and sends the exact anonymous JSON request once", async () => {
  const { API_BASE, requestJson } = await catalogModule;
  const calls = [];
  const body = { name: "로컬 테스트", quoted_monthly_payment: null };
  const receipt = { id: "local-only-receipt", status: "NEW" };
  const result = await requestJson("/api/v1/support/quote-inquiries", {
    method: "POST", body,
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => receipt };
    },
  });
  assert.deepEqual(result, receipt);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${API_BASE}/api/v1/support/quote-inquiries`);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.cache, "no-store");
  assert.deepEqual(calls[0].options.headers, { "Content-Type": "application/json" });
  assert.equal(calls[0].options.body, JSON.stringify(body));
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test("requestJson rejects HTTP and malformed JSON responses without automatic retries", async () => {
  const { requestJson } = await catalogModule;
  for (const status of [400, 409, 429, 503]) {
    let calls = 0;
    await assert.rejects(requestJson("/local-test", { fetcher: async () => {
      calls++;
      return { ok: false, status, json: async () => assert.fail("must reject the HTTP status first") };
    } }), { message: `API_HTTP_${status}` });
    assert.equal(calls, 1);
  }
  await assert.rejects(requestJson("/local-test", {
    fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError("local invalid JSON"); } }),
  }), SyntaxError);
});

test("requestJson propagates offline errors and aborts a timed out mock without retrying", async () => {
  const { requestJson } = await catalogModule;
  await assert.rejects(requestJson("/local-test", { fetcher: async () => { throw new Error("LOCAL_OFFLINE"); } }), { message: "LOCAL_OFFLINE" });
  let calls = 0;
  await assert.rejects(requestJson("/local-test", {
    timeout: 10,
    fetcher: async (_url, { signal }) => {
      calls++;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("LOCAL_TIMEOUT")), { once: true }));
    },
  }), { message: "LOCAL_TIMEOUT" });
  assert.equal(calls, 1);
});

test("pre-aborted request and catalog signals never call their fetcher, request or storage", async () => {
  const { requestJson, loadCatalog } = await catalogModule;
  const controller = new AbortController();
  const failure = new Error("LOCAL_ALREADY_CANCELLED");
  controller.abort(failure);
  await assert.rejects(requestJson("/local-test", {
    signal: controller.signal, fetcher: async () => assert.fail("no fetch after cancellation"),
  }), failure);
  await assert.rejects(loadCatalog(async () => assert.fail("no request after cancellation"), {
    signal: controller.signal, storage: { getItem: () => assert.fail("no cache read after cancellation") },
  }), failure);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("requestJson propagates caller cancellation to the active fetch exactly once and cleans up", async () => {
  const { requestJson } = await catalogModule;
  const controller = new AbortController();
  const failure = new Error("LOCAL_REQUEST_CANCELLED");
  let calls = 0, receivedSignal;
  const pending = requestJson("/local-test", {
    signal: controller.signal,
    fetcher: async (_url, { signal }) => {
      calls++; receivedSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    },
  });
  const rejected = assert.rejects(pending, failure);
  controller.abort(failure);
  await rejected;
  assert.equal(calls, 1);
  assert.equal(receivedSignal.aborted, true);
  assert.equal(receivedSignal.reason, failure);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("requestJson rejects a late JSON body after cancellation and detaches a successful caller's listener", async () => {
  const { requestJson } = await catalogModule;
  const controller = new AbortController();
  const body = deferred();
  const failure = new Error("LOCAL_BODY_CANCELLED");
  const pending = requestJson("/local-test", {
    signal: controller.signal,
    fetcher: async () => ({ ok: true, json: () => body.promise }),
  });
  const rejected = assert.rejects(pending, failure);
  await nextTurn();
  controller.abort(failure);
  body.resolve({ stale: true });
  await rejected;
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  const successful = new AbortController();
  assert.deepEqual(await requestJson("/local-test", {
    signal: successful.signal, fetcher: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  }), { ok: true });
  assert.equal(getEventListeners(successful.signal, "abort").length, 0);
});
