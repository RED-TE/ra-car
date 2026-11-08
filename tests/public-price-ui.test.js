const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../script.js"), "utf8");
const context = vm.createContext({ window: {} });
vm.runInContext(source.split("// Public price boundary ends.")[0], context);
const boundary = context.window.recarPublicPrice;
const valid = () => ({ productType: "RENTAL", monthlyPayment: 312300,
  priceEvidence: { verified: true, productType: "RENTAL", term: 60, depositPct: 0,
    guaranteePct: 0, mileageLimit: 10000, quoteKind: "ESTIMATE", isEstimate: true,
    evidenceScope: "EXACT", unverifiedConditions: [] } });

test("native category objects and segment preserve existing vehicle filters", () => {
  assert.deepEqual(Array.from(boundary.categories({ brand: "Kia", segment: "SUV", categories: [{ key: "domestic" }] })), ["all", "domestic", "suv"]);
  assert.equal(boundary.categories({ categories: ["time", "sedan"] }).includes("time"), false);
});

test("exact synthetic rental amount passes unchanged", () => {
  const item = valid();
  const before = JSON.stringify(item);
  assert.equal(boundary.monthly(item), 312300);
  assert.equal(JSON.stringify(item), before);
});
test("explicit guarantee-unrecorded estimate retains the amount and scope", () => {
  const item = valid();
  item.priceEvidence.evidenceScope = "GUARANTEE_UNRECORDED";
  item.priceEvidence.unverifiedConditions = ["guarantee"];
  assert.equal(boundary.monthly(item), 312300);
  assert.deepEqual(item.priceEvidence.unverifiedConditions, ["guarantee"]);
});
const invalid = {
  "lease": item => { item.productType = "LEASE"; },
  "missing product": item => { delete item.productType; },
  "missing evidence": item => { delete item.priceEvidence; },
  "unverified evidence": item => { item.priceEvidence.verified = false; },
  "wrong evidence product": item => { item.priceEvidence.productType = "LEASE"; },
  "wrong term": item => { item.priceEvidence.term = 48; },
  "wrong mileage": item => { item.priceEvidence.mileageLimit = 20000; },
  "nonzero advance": item => { item.priceEvidence.depositPct = 10; },
  "nonzero guarantee": item => { item.priceEvidence.guaranteePct = 10; },
  "wrong quote kind": item => { item.priceEvidence.quoteKind = "FINAL"; },
  "unknown scope": item => { item.priceEvidence.evidenceScope = "UNKNOWN"; },
  "unknown condition": item => { item.priceEvidence.unverifiedConditions = ["term"]; },
  "zero": item => { item.monthlyPayment = 0; },
  "negative": item => { item.monthlyPayment = -1; },
  "fractional": item => { item.monthlyPayment = 312300.5; },
  "numeric string": item => { item.monthlyPayment = "312300"; },
  "unsafe integer": item => { item.monthlyPayment = Number.MAX_SAFE_INTEGER + 1; },
};
for (const [name, mutate] of Object.entries(invalid)) {
  test(`${name} never renders a public price`, () => {
    const item = valid(); mutate(item);
    assert.equal(boundary.monthly(item), null);
  });
}
