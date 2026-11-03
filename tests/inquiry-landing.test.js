const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const contract = import("../inquiry/landing-contract.mjs");
const quizPath = path.resolve(__dirname, "../inquiry/landing-assets/js/car-match.js");

test("twelve questions retain six independent concrete requirements and sixteen reachable taste types", () => {
  const quiz = require(quizPath);
  assert.equal(quiz.QUESTIONS.length, 12);
  assert.deepEqual(quiz.QUESTIONS.slice(6).map(question => question.key), ["budget", "upfront", "passengers", "mileage", "charging", "parking"]);
  const codes = new Set();
  for (let taste = 0; taste < 64; taste++) {
    const answers = Array.from({ length: 6 }, (_, bit) => (taste >> bit) & 1);
    const baseline = quiz.profile([...answers, 0, 0, 0, 0, 0, 0]);
    codes.add(baseline.code);
    for (let index = 6; index < 12; index++) {
      for (let option = 0; option < quiz.QUESTIONS[index].options.length; option++) {
        const edited = [...answers, 0, 0, 0, 0, 0, 0];
        edited[index] = option;
        const result = quiz.profile(edited);
        assert.equal(result.code, baseline.code, "practical requirements cannot change a personality label");
        const summaries = quiz.summary(result);
        assert.equal(summaries.length, 6);
        assert.equal(summaries[index - 6].value, quiz.QUESTIONS[index].options[option].detail);
        assert.equal(summaries[index - 6].questionIndex, index);
      }
    }
  }
  assert.equal(codes.size, 16);
});

test("recommendations keep a strict monthly cap and exclude EVs with unknown or unavailable charging", () => {
  const quiz = require(quizPath);
  const cars = [
    { id: "within", brand: "kia", model_name: "K5", rent: 399999, lease: null, segment: "sedan", fuel: "gasoline" },
    { id: "over", brand: "hyundai", model_name: "그랜저", rent: 400001, lease: null, segment: "sedan", fuel: "gasoline" },
    { id: "ev", brand: "kia", model_name: "EV3", rent: 200000, lease: null, segment: "suv", fuel: "ev" },
  ];
  const before = structuredClone(cars);
  for (const charging of [2, 3]) {
    const result = quiz.match([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, charging, 0], cars);
    assert.equal(result.car.id, "within");
    assert.equal(result.overBudget, false);
    assert.equal(result.relaxed, 0);
    assert.equal(result.referenceOnly, true);
    assert.deepEqual(result.others, []);
    assert.equal(quiz.match([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, charging, 0], cars.slice(1)).car, null);
  }
  assert.deepEqual(cars, before);
});

test("local preview detection cannot be enabled by an arbitrary public URL query", async () => {
  const { isLocalPreview } = await contract;
  for (const hostname of ["127.0.0.1", "localhost", "::1", "[::1]"]) assert.equal(isLocalPreview({ hostname }), true, hostname);
  for (const hostname of ["recarplan.com", "www.recarplan.com", "localhost.example.com", "127.0.0.1.example.com"]) {
    assert.equal(isLocalPreview({ hostname, search: "?preview=true" }), false, hostname);
  }
});

test("an accepted inquiry receipt requires both a nonempty ID and NEW state", async () => {
  const { validReceipt } = await contract;
  assert.equal(validReceipt({ id: "local-mocked-receipt", status: "NEW" }), true);
  for (const value of [null, {}, { id: "", status: "NEW" }, { id: "abc", status: "ACCEPTED" }, { id: "abc" }]) {
    assert.equal(validReceipt(value), false);
  }
});

const contact = () => ({ name: " 로컬 검증 ", phone: "010-0000-0000", agreed: true, notice: true });

test("inquiry payload keeps the six requirements, canonical referral and no invented quoted amount", async () => {
  const { buildLandingPayload } = await contract;
  const quiz = require(quizPath);
  const summary = quiz.summary(quiz.profile([0, 0, 0, 0, 0, 0, 1, 2, 3, 2, 3, 2]));
  const conditionSummary = summary.map(item => `${item.label}: ${item.value}`).join(" · ");
  const body = buildLandingPayload(contact(), { vehicle_name: "직접 입력한 긴 차량명", quoted_monthly_payment: 999999, condition_summary: conditionSummary }, "rc-qa1234");
  assert.equal(body.name, "로컬 검증");
  assert.equal(body.phone, "01000000000");
  assert.equal(body.referral_code, "RC-QA1234");
  assert.equal(body.privacy_agreed, true);
  assert.equal(body.vehicle_name, "직접 입력한 긴 차량명");
  assert.equal(body.quoted_monthly_payment, null);
  assert.equal(body.condition_summary, conditionSummary);
  for (const item of summary) assert.ok(body.condition_summary.includes(`${item.label}: ${item.value}`));
  assert.throws(() => buildLandingPayload({ ...contact(), agreed: false }), /CONTACT_INVALID/);
  assert.throws(() => buildLandingPayload({ ...contact(), notice: false }), /CONTACT_INVALID/);
  assert.throws(() => buildLandingPayload({ ...contact(), phone: "02-123-4567" }), /CONTACT_INVALID/);
  assert.throws(() => buildLandingPayload(contact(), { condition_summary: "가".repeat(1001) }), /INQUIRY_INVALID/);
});

test("preview completes locally without network or production receipt claims", async () => {
  const { createSubmissionController } = await contract;
  let calls = 0;
  const submission = createSubmissionController({ request: async () => { calls++; throw new Error("must not send"); }, isPreview: true });
  assert.deepEqual(await submission.submit(contact(), { vehicle_name: "직접 입력" }), { preview: true });
  assert.equal(calls, 0);
  assert.equal(submission.state, "idle");
});

test("one page-wide pending request blocks both forms and never permits a duplicate after success", async () => {
  const { createSubmissionController } = await contract;
  let release, calls = 0;
  const response = new Promise(resolve => { release = resolve; });
  const submission = createSubmissionController({ request: async (pathname, options) => {
    calls++;
    assert.equal(pathname, "/api/v1/support/quote-inquiries");
    assert.equal(options.method, "POST");
    assert.equal(options.body.quoted_monthly_payment, null);
    return response;
  } });
  const first = submission.submit(contact(), { vehicle_name: "직접 입력" });
  assert.equal(submission.state, "pending");
  await assert.rejects(submission.submit(contact(), { vehicle_name: "다른 폼" }), /INQUIRY_PENDING/);
  release({ id: "local-mocked-receipt", status: "NEW" });
  assert.deepEqual(await first, { id: "local-mocked-receipt", status: "NEW" });
  assert.equal(submission.state, "succeeded");
  await assert.rejects(submission.submit(contact(), {}), /INQUIRY_ALREADY_RECEIVED/);
  assert.equal(calls, 1);
});

for (const [name, response] of [
  ["invalid receipt", {}], ["accepted receipt", { id: "local", status: "ACCEPTED" }],
  ["network timeout", new Error("AbortError")], ["HTTP 503", new Error("API_HTTP_503")],
  ["HTTP 408", new Error("API_HTTP_408")], ["HTTP 409", new Error("API_HTTP_409")],
]) {
  test(`uncertain ${name} cannot automatically or manually resubmit from the same page`, async () => {
    const { createSubmissionController } = await contract;
    let calls = 0;
    const submission = createSubmissionController({ request: async () => {
      calls++;
      if (response instanceof Error) throw response;
      return response;
    } });
    await assert.rejects(submission.submit(contact(), {}));
    assert.equal(submission.state, "uncertain");
    await assert.rejects(submission.submit(contact(), {}), /INQUIRY_UNCERTAIN/);
    assert.equal(calls, 1);
  });
}

test("an explicit rejected input can be corrected without weakening consent validation", async () => {
  const { createSubmissionController } = await contract;
  let calls = 0;
  const submission = createSubmissionController({ request: async () => {
    if (++calls === 1) throw new Error("API_HTTP_422");
    return { id: "local-corrected", status: "NEW" };
  } });
  await assert.rejects(submission.submit(contact(), {}), /API_HTTP_422/);
  assert.equal(submission.state, "idle");
  await assert.rejects(submission.submit({ ...contact(), notice: false }, {}), /CONTACT_INVALID/);
  assert.equal(calls, 1);
  await submission.submit(contact(), {});
  assert.equal(calls, 2);
});

test("only official navigation inherits a valid referral and explicit invalid referral clears stale attribution", async () => {
  const { withReferral } = await contract;
  const store = { getItem: () => "RC-OLD123" };
  const target = new URL(withReferral("https://recarplan.com/inquiry/steps.html?mode=rental", "?ref=rc-qa1234", store));
  assert.equal(target.pathname, "/inquiry/steps.html");
  assert.equal(target.searchParams.get("ref"), "RC-QA1234");
  assert.equal(target.searchParams.get("mode"), "rental");
  assert.equal(new URL(withReferral("https://recarplan.com/?ref=RC-OLD123", "?ref=invalid", store)).searchParams.has("ref"), false);
  assert.equal(withReferral("https://example.com/?ref=leave", "?ref=RC-QA1234", store), "https://example.com/?ref=leave");
  assert.equal(withReferral("javascript:alert(1)", "?ref=RC-QA1234", store), "javascript:alert(1)");
});

test("legacy vehicle entry preserves explicit wishes without reading identity fields or creating a price", async () => {
  const { landingEntryFromSearch, withLandingEntry, buildLandingPayload } = await contract;
  const entry = landingEntryFromSearch("?brand=기아&model=모닝&product=LEASE&term=60&mileage=10000&deposit=20&prepayment=10&name=ignored&phone=01011112222");
  assert.equal(entry.vehicleName, "기아 모닝");
  assert.equal(entry.productType, "LEASE");
  assert.deepEqual(entry.conditions, { term: 60, mileage: 10000, deposit: 20, prepayment: 10 });
  const payload = withLandingEntry({ vehicle_name: entry.vehicleName, condition_summary: "랜딩 상담", quoted_monthly_payment: 111111 }, entry);
  const body = buildLandingPayload(contact(), payload);
  assert.equal(body.product_type, "LEASE");
  assert.equal(body.quoted_monthly_payment, null);
  assert.match(body.condition_summary, /60개월/);
  assert.match(body.condition_summary, /10,000km/);
  assert.match(body.condition_summary, /보증금 20%/);
  assert.match(body.condition_summary, /선납금 10%/);
  assert.match(body.condition_summary, /조건 견적 아님/);
  assert.doesNotMatch(JSON.stringify(entry), /ignored|01011112222/);
  assert.equal(withLandingEntry({ product_type: "RENTAL" }, entry).product_type, "RENTAL");
  assert.match(withLandingEntry({}, entry, { quiz: true }).condition_summary, /테스트 답변과 별도/);
  const reset = withLandingEntry({ product_type: "LEASE" }, entry, { productOverride: "" });
  assert.equal(Object.hasOwn(reset, "product_type"), false);
  assert.match(reset.condition_summary, /현재 상담 방식: 미정/);
  assert.equal(Object.hasOwn(buildLandingPayload(contact(), reset), "product_type"), false);
  assert.equal(withLandingEntry({ product_type: "LEASE" }, entry, { productOverride: "RENTAL" }).product_type, "RENTAL");
});

test("ambiguous, noncanonical and unsafe legacy entry values never become hidden applied conditions", async () => {
  const { landingEntryFromSearch } = await contract;
  for (const query of ["?term=048&mileage=2e4&deposit=20.0&prepayment=-1", "?term=48&term=60&mileage=20000&mileage=10000&product=LEASE&product=RENTAL"]) {
    const entry = landingEntryFromSearch(query);
    assert.deepEqual(entry.conditions, {});
    assert.equal(entry.productType, "");
  }
  for (const model of ["<script>alert(1)</script>", "고객\n정보", "가".repeat(101)]) {
    assert.equal(landingEntryFromSearch(`?model=${encodeURIComponent(model)}`).vehicleName, "");
  }
  assert.equal(landingEntryFromSearch("?brand=기아&model=기아%20모닝").vehicleName, "기아 모닝");
});

function catalogVehicle(id, amount, overrides = {}) {
  return { id, brand: "Kia", model_name: "K5", available_product_types: ["RENTAL", "LEASE"], representative_monthly_price: amount, displayed_product_type: "RENTAL", segment: "sedan", fuel: "gasoline", ...overrides };
}

test("catalog uses only rental reference data, preserves source rows and never exposes lease figures", async () => {
  const { loadLandingData } = await contract;
  const all = [catalogVehicle("both", 100000), catalogVehicle("lease-only", 123456, { available_product_types: ["LEASE"], displayed_product_type: "LEASE" })];
  const rental = [catalogVehicle("both", 300000)];
  const before = structuredClone({ all, rental });
  const calls = [];
  const result = await loadLandingData(async pathname => {
    const query = new URL(pathname, "https://api.recarplan.com");
    calls.push(query);
    assert.equal(query.searchParams.get("term"), "36");
    assert.equal(query.searchParams.get("deposit_pct"), "30");
    assert.equal(query.searchParams.get("mileage_limit"), "20000");
    const items = query.searchParams.get("product_type") === "RENTAL" ? rental : all;
    return { items, page: 1, pages: 1, total: items.length };
  });
  assert.equal(calls.length, 2);
  assert.equal(result.all[0].rent, 300000);
  assert.equal(result.all[1].rent, null);
  assert.equal(result.all.every(row => row.lease === null), true);
  assert.deepEqual({ all, rental }, before);
});

test("catalog rejects duplicate pages, missing rows and changed vehicle identity", async () => {
  const { loadLandingData } = await contract;
  await assert.rejects(loadLandingData(async () => ({ items: [catalogVehicle("same", 100), catalogVehicle("same", 100)], total: 2, pages: 1, page: 1 })), /LANDING_CATALOG_INVALID/);
  await assert.rejects(loadLandingData(async () => ({ items: [], total: 1, pages: 1, page: 1 })), /LANDING_CATALOG_INCOMPLETE/);
  await assert.rejects(loadLandingData(async pathname => ({ items: [catalogVehicle("same", 100, { model_name: pathname.includes("product_type=RENTAL") ? "다른 차" : "K5" })], total: 1, pages: 1, page: 1 })), /LANDING_CATALOG_CHANGED/);
});

test("inquiry landing keeps the existing consent policy and avoids legacy common form binders", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../inquiry/index.html"), "utf8");
  assert.match(source, /id="lpCarInput"/);
  assert.match(source, /id="lpTest"/);
  assert.match(source, /landing-runtime\.mjs/);
  assert.doesNotMatch(source, /src="[^\"]*(?:core|api|store|home)\.js/);
});
