const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const baseline = require("./fixtures/published-inquiry-paths-20261103.json");
const root = path.resolve(__dirname, "..");
const contract = () => import(pathToFileURL(path.join(root, "inquiry/landing-contract.mjs")));

test("previously published inquiry URLs survive a full site release", () => {
  assert.deepEqual(baseline.files.filter(row => !fs.existsSync(path.join(root, row.path))).map(row => row.path), []);
});

test("the published steps alias stays on the current inquiry form", () => {
  assert.deepEqual(fs.readFileSync(path.join(root, "inquiry/steps.html")), fs.readFileSync(path.join(root, "inquiry/index.html")));
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
