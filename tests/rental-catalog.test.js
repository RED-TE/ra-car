// Synthetic contracts only. Every request is an injected in-memory adapter.
const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const modulePromise = import(pathToFileURL(path.join(__dirname, "../lib/rental-catalog.mjs")));
const revision = `sha256:${"a".repeat(64)}`;
const fingerprint = "b".repeat(64);
const conditions = () => ({ term_months: 60, annual_km: 10000, prepayment_pct: 0 });
const point = () => ({ role: "BASE", path: "products.rent.conditionMonthly.60:0:10000", conditions: conditions() });
const clone = (value) => structuredClone(value);

function row(id = "SYNTHETIC-VEHICLE") {
  return {
    id, brand: "합성", model_name: `합성 ${id}`, default_vehicle_trim_id: `${id}-TRIM`,
    segment: "suv", fuel: "hybrid", year: 2026, categories: [{ key: "SUV", name_ko: "SUV" }],
    monthly_payment_product_type: "RENTAL", displayed_product_type: "RENTAL",
    available_product_types: ["RENTAL"], monthly_payment: 999999,
    representative_monthly_price: 999999, image_url: "https://example.invalid/car.png",
  };
}

function detail(id = "SYNTHETIC-VEHICLE") {
  return { ...row(id), is_published: true, trims: [{
    id: `${id}-TRIM`, vehicle_id: id, name: "합성 기본 트림", price: 45000000,
    is_available: true, options: [], colors: [],
  }] };
}

function strictQuote(id = "SYNTHETIC-VEHICLE") {
  return { data: {
    vehicle_id: id, vehicle_trim_id: `${id}-TRIM`, product_type: "RENTAL",
    selection_contract_version: "selection_v1",
    normalized_selection: { vehicle_trim_id: `${id}-TRIM`, selected_option_ids: [] },
    selection_fingerprint: fingerprint, pricing_context_version: "selection-market-v1:1234567890abcdef",
    selected_vehicle_price: 45000000, reference_vehicle_price: 45000000,
    reference_vehicle_trim_id: `${id}-TRIM`, monthly_payment: 277300,
    term: 60, mileage_limit: 10000, deposit: 0, prepayment_pct: 0,
    guarantee: 0, guarantee_pct: 0, price_source: "CHAZM_IMPORTED",
    pricing_basis: "MARKET_SELECTION_DELTA_V1", market_pricing_applied: true,
    trim_pricing_applied: true, selection_pricing_applied: true,
    selection_pricing_source: "MARKET_SELECTION_DELTA_V1", market_source_record_id: "SYNTHETIC-SOURCE",
    condition_verified_monthly_payment: 277300,
    // These private/legacy fields must never escape through the UI object.
    finance_company: "SYNTHETIC-PRIVATE", irr: 9.99, margin: 30000, cost: 123,
    price_provenance: {
      version: "price_provenance_v1", processed_product_type: "RENTAL",
      request_conditions_verified: true, sales_ai_eligible: true, quote_kind: "ESTIMATE",
      calculation_method: "MARKET_REFERENCE_PLUS_EXISTING_SELECTION_DELTA",
      unsupported_reasons: [], provider_generated_at: null, valid_until: null,
      market_price: {
        source: "CHAZM_IMPORTED", source_record_id: "SYNTHETIC-SOURCE", source_revision: revision,
        product_type: "RENTAL", match_status: "EXACT", vehicle_match: "EXACT",
        calculation_method: "CHAZM_EXACT_CONDITION_LOOKUP", methods: ["CONDITION_DIRECT"],
        applied_conditions: conditions(),
        condition_match: { term_months: "EXACT", annual_km: "EXACT", prepayment_pct: "EXACT" },
        source_points: [point()], unknown_reasons: [],
      },
    },
  }, meta: { trace_id: "SYNTHETIC-TRACE" } };
}

function scopedQuote(id = "SYNTHETIC-VEHICLE") {
  const envelope = strictQuote(id);
  const data = envelope.data;
  data.condition_verified_monthly_payment = null;
  data.price_provenance.request_conditions_verified = false;
  data.price_provenance.sales_ai_eligible = false;
  data.price_provenance.unsupported_reasons = ["SOURCE_CONDITIONS_NOT_EXACTLY_VERIFIED"];
  data.price_provenance.market_price.match_status = "UNKNOWN";
  data.price_provenance.market_price.unknown_reasons = ["SOURCE_GUARANTEE_UNRECORDED"];
  data.selection_terms_estimate = {
    version: "selection_terms_estimate_v1", verified: true, quote_kind: "ESTIMATE",
    monthly_payment: 277300, product_type: "RENTAL",
    verification_scope: ["vehicle", "trim", "options", "colors", "term", "annual_km", "prepayment_pct"],
    unverified_conditions: ["guarantee"], source_revision: revision,
    reference_vehicle_trim_id: `${id}-TRIM`, selection_fingerprint: fingerprint,
  };
  return envelope;
}

function adapter({ rows = [row()], quote = strictQuote, mutateDetail } = {}) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ path: url, ...options });
    if (url === "/api/v1/vehicles/") {
      return { items: clone(rows), total: rows.length, pages: 1, page: 1, size: 100 };
    }
    if (url === "/api/v1/quotes/instant") return quote(options.body.vehicle_id);
    const id = decodeURIComponent(url.split("/").at(-1));
    const value = detail(id);
    mutateDetail?.(value);
    return value;
  };
  return { request, calls };
}

test("strict source quote supplies the amount unchanged, never the GET list price", async () => {
  const { loadRentalCatalog } = await modulePromise;
  const fake = adapter();
  const items = await loadRentalCatalog({ request: fake.request });
  assert.equal(items.length, 1);
  assert.equal(items[0].monthlyPayment, 277300);
  assert.equal(items[0].trim, "합성 기본 트림");
  assert.equal(fake.calls[0].query.sort, "display_order");
  assert.equal(items[0].segment, "suv");
  assert.equal(items[0].year, 2026);
  assert.equal(items[0].trimCount, 1);
  assert.equal(items[0].trims[0].id, "SYNTHETIC-VEHICLE-TRIM");
  assert.deepEqual(items[0].categories, [{ key: "SUV", name: "SUV" }]);
  assert.deepEqual(items[0].priceEvidence, {
    verified: true, productType: "RENTAL", term: 60, depositPct: 0,
    guaranteePct: 0, mileageLimit: 10000, quoteKind: "ESTIMATE", isEstimate: true,
    evidenceScope: "EXACT", unverifiedConditions: [],
  });
  const posted = fake.calls.find((call) => call.method === "POST").body;
  assert.deepEqual(posted, {
    vehicle_id: "SYNTHETIC-VEHICLE", selection_contract_version: "selection_v1",
    selection: { vehicle_trim_id: "SYNTHETIC-VEHICLE-TRIM", selected_option_ids: [] },
    product_type: "RENTAL", term: 60, prepayment_pct: 0,
    guarantee: 0, guarantee_pct: 0, mileage_limit: 10000,
  });
  for (const forbidden of ["finance_company", "irr", "margin", "cost", "source_record_id", "price_provenance"]) {
    assert.equal(JSON.stringify(items).includes(forbidden), false);
  }
});

test("scoped original conditions keep guarantee explicitly unverified", async () => {
  const { loadRentalVehicle } = await modulePromise;
  const fake = adapter({ quote: scopedQuote });
  const item = await loadRentalVehicle("SYNTHETIC-VEHICLE", { request: fake.request });
  assert.equal(item.monthlyPayment, 277300);
  assert.equal(item.priceEvidence.verified, true);
  assert.equal(item.priceEvidence.evidenceScope, "GUARANTEE_UNRECORDED");
  assert.deepEqual(item.priceEvidence.unverifiedConditions, ["guarantee"]);
  assert.equal(fake.calls.length, 2);
});

const corruptions = {
  "missing source evidence": (data) => { delete data.price_provenance; },
  "vehicle mismatch": (data) => { data.vehicle_id = "OTHER"; },
  "trim mismatch": (data) => { data.normalized_selection.vehicle_trim_id = "OTHER"; },
  "unsupported product": (data) => { data.product_type = "LEASE"; },
  "option mismatch": (data) => { data.normalized_selection.selected_option_ids = ["OTHER"]; },
  "color mismatch": (data) => { data.normalized_selection.exterior_color_id = "OTHER"; },
  "inventory mismatch": (data) => { data.normalized_selection.inventory_item_id = 1; },
  "term mismatch": (data) => { data.term = 48; },
  "distance mismatch": (data) => { data.mileage_limit = 20000; },
  "advance mismatch": (data) => { data.prepayment_pct = 20; },
  "guarantee mismatch": (data) => { data.guarantee = 1; },
  "string amount": (data) => { data.monthly_payment = "277300"; },
  "fractional amount": (data) => { data.monthly_payment = 277300.5; },
  "zero amount": (data) => { data.monthly_payment = 0; },
  "nearest source": (data) => { data.price_provenance.market_price.match_status = "NEAREST"; },
  "wrong source condition": (data) => { data.price_provenance.market_price.applied_conditions.term_months = 48; },
  "unknown source": (data) => { data.price_provenance.market_price.unknown_reasons = ["UNKNOWN"]; },
  "source alias mismatch": (data) => { data.source = "OTHER"; },
  "verified amount mismatch": (data) => { data.condition_verified_monthly_payment = 1; },
  "source estimate fallback": (data) => { data.source_estimate = {}; },
  "unverified calculation": (data) => { data.price_provenance.market_price.calculation_method = "UNKNOWN"; },
  "missing source point": (data) => { data.price_provenance.market_price.source_points = []; },
  "direct source point distance mismatch": (data) => { data.price_provenance.market_price.source_points[0].conditions.annual_km = 20000; },
  "direct source point advance mismatch": (data) => { data.price_provenance.market_price.source_points[0].conditions.prepayment_pct = 20; },
  "direct source path mismatch": (data) => { data.price_provenance.market_price.source_points[0].path = "products.rent.conditionMonthly.60:20:20000"; },
  "direct source duplicate BASE": (data) => { data.price_provenance.market_price.source_points.push(point()); },
  "direct source wrong role": (data) => { data.price_provenance.market_price.source_points[0].role = "ADJUSTMENT_BASE"; },
  "direct source different methods": (data) => { data.price_provenance.market_price.methods = ["SYNTHETIC_ADJUSTMENT"]; },
};
for (const [name, corrupt] of Object.entries(corruptions)) {
  test(`rejects ${name} without restoring GET/fallback prices`, async () => {
    const { loadRentalVehicle } = await modulePromise;
    const fake = adapter({ quote: (id) => {
      const result = strictQuote(id); corrupt(result.data); return result;
    } });
    const item = await loadRentalVehicle("SYNTHETIC-VEHICLE", { request: fake.request });
    assert.equal(item.monthlyPayment, null);
    assert.equal(item.priceEvidence.verified, false);
  });
}

for (const [name, corrupt] of Object.entries({
  "wrong revision": (d) => { d.selection_terms_estimate.source_revision = `sha256:${"c".repeat(64)}`; },
  "wrong binding": (d) => { d.selection_terms_estimate.selection_fingerprint = "c".repeat(64); },
  "additional unknown reason": (d) => { d.price_provenance.market_price.unknown_reasons.push("SOURCE_PREPAYMENT_AMOUNT_MISMATCH"); },
  "invented source path": (d) => { d.price_provenance.market_price.source_points[0].path = "products.rent.conditionMonthly.48:0:10000"; },
  "duplicated source point": (d) => { d.price_provenance.market_price.source_points.push(point()); },
  "extra scope key": (d) => { d.selection_terms_estimate.extra = true; },
  "missing guarantee caveat": (d) => { d.selection_terms_estimate.unverified_conditions = []; },
  "private source fallback": (d) => { d.price_provenance.market_price.source = "VEHICLE_QUOTE_LOOKUP"; },
})) {
  test(`scoped rejects ${name}`, async () => {
    const { loadRentalVehicle } = await modulePromise;
    const fake = adapter({ quote: (id) => {
      const result = scopedQuote(id); corrupt(result.data); return result;
    } });
    const item = await loadRentalVehicle("SYNTHETIC-VEHICLE", { request: fake.request });
    assert.equal(item.monthlyPayment, null);
    assert.equal(item.priceEvidence.verified, false);
  });
}

test("additive scoped metadata with strict proof is validated before strict acceptance", async () => {
  const { loadRentalVehicle } = await modulePromise;
  const fake = adapter({ quote: (id) => {
    const strict = strictQuote(id);
    strict.data.selection_terms_estimate = scopedQuote(id).data.selection_terms_estimate;
    return strict;
  } });
  const item = await loadRentalVehicle("SYNTHETIC-VEHICLE", { request: fake.request });
  assert.equal(item.monthlyPayment, 277300);
  assert.equal(item.priceEvidence.evidenceScope, "EXACT");
});

for (const [name, mutateDetail] of Object.entries({
  "inactive trim": (d) => { d.trims[0].is_available = false; },
  "wrong trim owner": (d) => { d.trims[0].vehicle_id = "OTHER"; },
  "missing official default": (d) => { delete d.default_vehicle_trim_id; },
  "default absent from trims": (d) => { d.trims = []; },
  "duplicate trim ids": (d) => { d.trims.push(clone(d.trims[0])); },
})) {
  test(`no POST for ${name}`, async () => {
    const { loadRentalCatalog } = await modulePromise;
    const fake = adapter({ mutateDetail });
    const items = await loadRentalCatalog({ request: fake.request });
    assert.equal(items[0].monthlyPayment, null);
    assert.equal(fake.calls.some((call) => call.method === "POST"), false);
  });
}

test("API error preserves discoverable identity without a price fallback", async () => {
  const { loadRentalCatalog } = await modulePromise;
  const fake = adapter({ quote: () => { throw new Error("synthetic 422"); } });
  const items = await loadRentalCatalog({ request: fake.request });
  assert.equal(items[0].id, "SYNTHETIC-VEHICLE");
  assert.equal(items[0].monthlyPayment, null);
});

test("all pages are checked before rental filtering and before any price POST", async () => {
  const { loadRentalCatalog } = await modulePromise;
  const all = [row("A"), { ...row("L"), monthly_payment_product_type: "LEASE" }, row("B")];
  const fake = adapter();
  const calls = [];
  const request = async (url, options) => {
    calls.push([url, options]);
    if (url === "/api/v1/vehicles/") {
      const page = options.query.page;
      return { items: [all[page - 1]], total: 3, page, pages: 3, size: 1 };
    }
    return fake.request(url, options);
  };
  const items = await loadRentalCatalog({ request });
  assert.deepEqual(items.map((item) => item.id), ["A", "B"]);
  assert.deepEqual(calls.slice(0, 3).map(([url]) => url), Array(3).fill("/api/v1/vehicles/"));
});

for (const kind of ["duplicate", "missing", "changed total", "changed pages", "wrong page"]) {
  test(`incomplete catalog fails closed: ${kind}`, async () => {
    const { loadRentalCatalog } = await modulePromise;
    const request = async (_url, options) => {
      const page = options.query.page;
      if (page === 1) return { items: [row("A")], total: 2, page: 1, pages: 2, size: 1 };
      return {
        items: kind === "missing" ? [] : [row(kind === "duplicate" ? "A" : "B")],
        total: kind === "changed total" ? 3 : 2,
        pages: kind === "changed pages" ? 3 : 2,
        page: kind === "wrong page" ? 1 : 2, size: 1,
      };
    };
    await assert.rejects(loadRentalCatalog({ request }), { code: "CATALOG_INCOMPLETE" });
  });
}

test("unknown product and conflicting product metadata never become rental cards", async () => {
  const { loadRentalCatalog } = await modulePromise;
  const unknown = { id: "UNKNOWN", model_name: "미확인", monthly_payment: 1 };
  const fake = adapter({ rows: [row("R"), unknown, { ...row("L"), available_product_types: ["LEASE"] }] });
  const items = await loadRentalCatalog({ request: fake.request, limit: 0 });
  assert.deepEqual(items.map((item) => item.id), ["R"]);
  assert.equal(items[0].monthlyPayment, null);
  assert.equal(fake.calls.length, 1);
});

test("unpublished catalog rows stay hidden even with explicit rental metadata", async () => {
  const { loadRentalCatalog } = await modulePromise;
  const fake = adapter({ rows: [row("PUBLIC"), { ...row("HIDDEN"), is_published: false }] });
  const items = await loadRentalCatalog({ request: fake.request, limit: 0 });
  assert.deepEqual(items.map((item) => item.id), ["PUBLIC"]);
});

test("unsafe image credentials and HTTP never leave the public allowlist", async () => {
  const { loadRentalCatalog } = await modulePromise;
  const fake = adapter({ rows: [
    { ...row("CREDENTIAL"), image_url: "https://synthetic-user:synthetic-secret@example.invalid/car.png" },
    { ...row("HTTP"), image_url: "http://example.invalid/car.png" },
    { ...row("HTTPS"), image_url: "https://example.invalid/car.png" },
    { ...row("RELATIVE"), image_url: "/assets/car.png" },
    { ...row("RELATIVE-CREDENTIAL"), image_url: "//synthetic-user:synthetic-secret@example.invalid/car.png" },
  ] });
  const items = await loadRentalCatalog({ request: fake.request, limit: 0 });
  assert.deepEqual(items.map((item) => item.imageUrl), ["", "", "https://example.invalid/car.png", "https://api.recarplan.com/assets/car.png", ""]);
  assert.equal(JSON.stringify(items).includes("synthetic-secret"), false);
});

test("non-direct strict adjustment anchors keep the existing contract", async () => {
  const { loadRentalVehicle } = await modulePromise;
  const fake = adapter({ quote: (id) => {
    const value = strictQuote(id);
    const market = value.data.price_provenance.market_price;
    market.calculation_method = "SYNTHETIC_ADJUSTMENT";
    market.methods = ["SYNTHETIC_ADJUSTMENT"];
    market.source_points = [{ role: "ADJUSTMENT_BASE", path: "synthetic.adjustment.base",
      conditions: { term_months: 60, annual_km: 20000, prepayment_pct: 20 } }];
    return value;
  } });
  const item = await loadRentalVehicle("SYNTHETIC-VEHICLE", { request: fake.request });
  assert.equal(item.monthlyPayment, 277300);
  assert.equal(item.priceEvidence.evidenceScope, "EXACT");
});

test("keep all rental identities while capping POSTs at 12 and concurrency at two", async () => {
  const { loadRentalCatalog } = await modulePromise;
  const fake = adapter({ rows: Array.from({ length: 15 }, (_, i) => row(`V${i}`)) });
  let active = 0;
  let peak = 0;
  const request = async (url, options) => {
    active++;
    peak = Math.max(peak, active);
    try { await new Promise((resolve) => setImmediate(resolve)); return await fake.request(url, options); }
    finally { active--; }
  };
  const items = await loadRentalCatalog({ request, limit: 100 });
  assert.equal(items.length, 15);
  assert.equal(fake.calls.filter((call) => call.method === "POST").length, 12);
  assert.equal(items.filter((item) => item.priceEvidence.verified).length, 12);
  assert.equal(peak, 2);
});

test("pre-abort makes zero requests", async () => {
  const { loadRentalCatalog } = await modulePromise;
  const controller = new AbortController(); controller.abort();
  const fake = adapter();
  await assert.rejects(loadRentalCatalog({ request: fake.request, signal: controller.signal }), { name: "AbortError" });
  assert.equal(fake.calls.length, 0);
});

test("abort during default detail prevents a late quote POST", async () => {
  const { loadRentalVehicle } = await modulePromise;
  const controller = new AbortController();
  let release;
  let started;
  const began = new Promise((resolve) => { started = resolve; });
  const paths = [];
  const request = (url) => {
    paths.push(url); started();
    return new Promise((resolve) => { release = resolve; });
  };
  const pending = loadRentalVehicle("SYNTHETIC-VEHICLE", { request, signal: controller.signal });
  await began; controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  release(detail());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(paths.length, 1);
});

test("abort during quote prevents late amount acceptance", async () => {
  const { loadRentalVehicle } = await modulePromise;
  const controller = new AbortController();
  let release;
  let started;
  const began = new Promise((resolve) => { started = resolve; });
  const fake = adapter();
  const request = (url, options) => {
    if (options.method !== "POST") return fake.request(url, options);
    started(); return new Promise((resolve) => { release = resolve; });
  };
  const pending = loadRentalVehicle("SYNTHETIC-VEHICLE", { request, signal: controller.signal });
  await began; controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  release(strictQuote());
});

test("default transport uses official public URLs without credentials or redirects", async () => {
  const { loadRentalVehicle } = await modulePromise;
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push([url, options]);
    return { ok: true, json: async () => options.method === "POST" ? strictQuote() : detail() };
  };
  try {
    const item = await loadRentalVehicle("SYNTHETIC-VEHICLE");
    assert.equal(item.monthlyPayment, 277300);
    assert.equal(calls.length, 2);
    for (const [url, options] of calls) {
      assert.equal(url.origin, "https://api.recarplan.com");
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      assert.equal(ownHeader(options.headers, "Authorization"), false);
    }
  } finally { global.fetch = original; }
});
function ownHeader(headers, key) { return Object.keys(headers).some((name) => name.toLowerCase() === key.toLowerCase()); }

test("a stalled adapter times out and aborts its request signal", { timeout: 15000 }, async () => {
  const { loadRentalVehicle } = await modulePromise;
  let signal;
  const request = (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  };
  await assert.rejects(loadRentalVehicle("SYNTHETIC-VEHICLE", { request }), { code: "API_TIMEOUT" });
  assert.equal(signal.aborted, true);
});
