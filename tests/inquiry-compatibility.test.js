const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const baseline = require("./fixtures/published-inquiry-paths-20261103.json");
const root = path.resolve(__dirname, "..");
const contract = () => import(pathToFileURL(path.join(root, "inquiry/landing-contract.mjs")));
const showroom = () => import(pathToFileURL(path.join(root, "inquiry/showroom/contract.mjs")));

test("previously published inquiry URLs survive a full site release", () => {
  assert.deepEqual(baseline.files.filter(row => !fs.existsSync(path.join(root, row.path))).map(row => row.path), []);
});

test("the new inquiry entry and existing steps have separate documents", () => {
  const steps = fs.readFileSync(path.join(root, "inquiry/steps.html"), "utf8");
  assert.match(steps, /id="stepContent"/);
  assert.doesNotMatch(steps, /\/inquiry\/showroom\//);
  const entry = fs.readFileSync(path.join(root, "inquiry/index.html"), "utf8");
  assert.match(entry, /id="lpCarInput"/);
  assert.match(entry, /\/inquiry\/showroom\/runtime\.mjs/);
  assert.doesNotMatch(entry, /빠르게 고르기|id="lpCars"|landing-runtime\.mjs/);
});

test("new showroom only hands validated vehicle details and attribution to the stepwise inquiry", async () => {
  const { stepHref, landingEntryFromSearch } = await showroom();
  const source = "?brand=Genesis&model=GV80&term=60&deposit=30&prepayment=0&ref=RC-ABC123&utm_source=test&name=PRIVATE&phone=01000000000&monthly=1&privacy_agreed=true";
  const url = new URL(stepHref(source, "RC-ABC123", landingEntryFromSearch(source)), "https://recarplan.com");
  assert.deepEqual(Object.fromEntries(url.searchParams), { ref: "RC-ABC123", utm_source: "test", brand: "Genesis", model: "GV80", term: "60", prepayment: "0" });
});

test("new showroom uses the official inquiry API once and does not send display prices", async () => {
  const { createSubmissionController } = await showroom();
  const contact = { name: "로컬 검증", phone: "01000000000", agreed: true, notice: true };
  const details = { vehicle_name: "GV80", quoted_monthly_payment: 123, product_type: "LEASE" };
  const posts = [];
  const live = createSubmissionController({ request: async (path, opts) => {
    posts.push({ path, ...opts });
    return { id: "synthetic", status: "NEW" };
  } });
  await assert.rejects(live.submit({ ...contact, notice: false }, details), /CONTACT_INVALID/);
  assert.deepEqual(await live.submit(contact, details, "RC-ABC123"), { id: "synthetic", status: "NEW" });
  await assert.rejects(live.submit(contact, details), /INQUIRY_ALREADY_RECEIVED/);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, "/api/v1/support/quote-inquiries");
  assert.equal(posts[0].method, "POST");
  assert.equal(posts[0].body.quoted_monthly_payment, null);
  assert.equal(posts[0].body.product_type, "RENTAL");
  assert.equal(posts[0].body.referral_code, "RC-ABC123");

  const uncertain = createSubmissionController({ request: async () => ({ status: "NEW" }) });
  await assert.rejects(uncertain.submit(contact, details), /RECEIPT_INVALID/);
  await assert.rejects(uncertain.submit(contact, details), /INQUIRY_UNCERTAIN/);
});

test("retained inquiry images and styles keep their published bytes", () => {
  for (const row of baseline.files.filter(row => row.preserve_bytes)) {
    const bytes = fs.readFileSync(path.join(root, row.path));
    const hash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    assert.equal(hash, row.git_blob_sha, row.path);
  }
});

test("old inquiry entry keeps attribution but never contact, price, conditions, consent or a destination", async () => {
  const { inquiryFlowHref } = await contract();
  const target = new URL(inquiryFlowHref("?ref=rc-local123&utm_source=test&utm_campaign=old&gclid=click&name=DO_NOT_COPY&phone=01000000000&product=LEASE&term=36&deposit=30&prepayment=30&monthly=1&privacy_agreed=true&returnTo=https://example.invalid#old"), "https://recarplan.com");
  assert.equal(target.pathname, "/inquiry/steps.html");
  assert.equal(target.hash, "");
  assert.deepEqual(Object.fromEntries(target.searchParams), { ref: "RC-LOCAL123", utm_source: "test", utm_campaign: "old", gclid: "click" });
});

test("invalid or ambiguous referral cannot resurrect a stored referral", async () => {
  const { inquiryFlowHref } = await contract();
  for (const search of ["?ref=invalid", "?ref=", "?ref=RC-FIRST1&ref=RC-SECOND1"]) {
    const target = new URL(inquiryFlowHref(search), "https://recarplan.com");
    assert.equal(target.searchParams.get("ref"), "");
  }
  assert.equal(inquiryFlowHref("?utm_source=one&utm_source=two&utm_campaign=" + "x".repeat(2049)), "/inquiry/steps.html");
});

test("cached landing contracts cannot load representative prices, submit or restore a selection", async () => {
  const api = await contract();
  let calls = 0;
  const request = async () => { calls++; throw new Error("must not call an external service"); };
  assert.deepEqual(await api.loadLandingData(request), { all: [], ranked: [], inv: null, cfg: null });
  assert.deepEqual(api.landingEntryFromSearch("?product=LEASE&monthly=1&name=PRIVATE"), { vehicleName: "", productType: "", conditions: {}, summary: "" });
  assert.throws(() => api.buildLandingPayload({ name: "합성", phone: "01000000000", agreed: true, notice: true }), /INQUIRY_FLOW_MOVED/);
  const submitter = api.createSubmissionController({ request });
  await assert.rejects(submitter.submit({ agreed: true }, { product_type: "LEASE" }), /INQUIRY_FLOW_MOVED/);
  await assert.rejects(submitter.submit(), /INQUIRY_FLOW_MOVED/);
  assert.equal(api.validReceipt({ id: "synthetic", status: "NEW" }), false);
  assert.equal(calls, 0);
});

test("legacy runtime navigates once to the safe form and does not loop on that form", async () => {
  const { redirectLegacyInquiry } = await contract();
  const destinations = [];
  const location = { pathname: "/inquiry/", search: "?ref=rc-local123&phone=PRIVATE", replace: href => destinations.push(href) };
  assert.equal(redirectLegacyInquiry(location), true);
  assert.deepEqual(destinations, ["/inquiry/steps.html?ref=RC-LOCAL123"]);
  assert.equal(redirectLegacyInquiry({ ...location, pathname: "/inquiry/steps.html" }), false);
  assert.equal(destinations.length, 1);
});
