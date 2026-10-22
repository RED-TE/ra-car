const assert = require("node:assert/strict");
const { test } = require("node:test");

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
    ["string page", { page: "1" }],
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
