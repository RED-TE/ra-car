const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const api = "https://api.recarplan.com";
const expected = new Map([
  ["GV80 Hybrid", "RENTAL"],
  ["GV80 Hybrid 블랙", "RENTAL"],
  ["스타리아 라운지 리무진 Hybrid", "LEASE"],
]);

async function audit(directory, pageDirectory) {
  if (!directory || fs.existsSync(directory)) throw new Error("Pass a new evidence directory");
  fs.mkdirSync(directory, { recursive: true });
  let calls = 0;
  const request = async (route, body) => {
    if (++calls > 24) throw new Error("Read/calculation request budget exceeded");
    const response = await fetch(api + route, {
      method: body ? "POST" : "GET", signal: AbortSignal.timeout(25000),
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${route}`);
    return response.json();
  };
  // Reuse explicitly supplied public page captures or fetch each advertised page.
  const readPage = number => pageDirectory
    ? JSON.parse(fs.readFileSync(path.join(pageDirectory, `page${number}.json`), "utf8"))
    : request(`/api/v1/vehicles/?page=${number}&size=100&sort=display_order`);
  const pages = [await readPage(1)];
  for (let number = 2; number <= pages[0].pages; number++) {
    const next = await readPage(number);
    assert.equal(next.page, number);
    assert.equal(next.total, pages[0].total);
    assert.equal(next.pages, pages[0].pages);
    pages.push(next);
  }
  const items = pages.flatMap(page => page.items);
  assert.equal(items.length, pages[0].total);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  assert.deepEqual(new Set(items.slice(-3).map(item => item.model_name)), new Set(expected.keys()));
  const report = { checkedAt: new Date().toISOString(), suppliedDeploymentSha: "59338676c6704ab8b6f3ba11ad683a0b08547bb8", catalogTotal: items.length, catalogPages: pages.length, catalogRequestsAlreadyRead: pageDirectory ? pages.length : 0, vehicles: [] };
  for (const [name, product] of expected) {
    const item = items.find(row => row.model_name === name);
    assert.ok(item?.id);
    assert.deepEqual(item.available_product_types, [product]);
    const detail = await request(`/api/v1/vehicles/${item.id}`);
    fs.writeFileSync(path.join(directory, `${item.id}-detail.json`), JSON.stringify(detail, null, 2));
    const result = { name, vehicleId: item.id, productTypes: item.available_product_types, displayOrder: item.display_order, displayPosition: items.indexOf(item) + 1, snapshotDate: "2026-10-14", snapshotDateEvidence: "approved-new3-handoff-only", trims: [] };
    for (const trim of detail.trims.filter(row => row.is_available !== false)) {
      const body = { vehicle_id: item.id, product_type: product, term: 60, deposit: 0, guarantee: 0, mileage_limit: 10000, selection_contract_version: "selection_v1", selection: { vehicle_trim_id: trim.id, selected_option_ids: [] } };
      const envelope = await request("/api/v1/quotes/instant", body);
      fs.writeFileSync(path.join(directory, `${trim.id}-quote.json`), JSON.stringify({ request: body, response: envelope }, null, 2));
      const data = envelope.data;
      const proof = data.price_provenance;
      const conditions = proof?.market_price?.applied_conditions;
      const match = proof?.market_price?.condition_match;
      const verified = data.vehicle_id === item.id && data.vehicle_trim_id === trim.id && data.selection_contract_version === "selection_v1" && data.normalized_selection?.vehicle_trim_id === trim.id && data.normalized_selection?.selected_option_ids?.length === 0 && data.term === 60 && data.mileage_limit === 10000 && data.deposit === 0 && data.guarantee === 0 && proof?.version === "price_provenance_v1" && proof.request_conditions_verified === true && proof.sales_ai_eligible === true && proof.processed_product_type === product && proof.market_price?.product_type === product && proof.market_price?.match_status === "EXACT" && ["EXACT", "NORMALIZED_EXACT"].includes(proof.market_price?.vehicle_match) && conditions?.term_months === 60 && conditions?.annual_km === 10000 && conditions?.prepayment_pct === 0 && match?.term_months === "EXACT" && match?.annual_km === "EXACT" && match?.prepayment_pct === "EXACT" && proof.unsupported_reasons?.length === 0 && proof.market_price?.unknown_reasons?.length === 0 && data.monthly_payment > 0;
      result.trims.push({ trimId: trim.id, name: trim.name, colors: trim.colors?.length ?? 0, options: trim.options?.length ?? 0, monthlyPayment: verified ? data.monthly_payment : null, verified, provenance: proof });
    }
    report.vehicles.push(result);
  }
  report.networkCalls = calls;
  report.allVerified = report.vehicles.every(vehicle => vehicle.trims.length > 0 && vehicle.trims.every(trim => trim.verified));
  fs.writeFileSync(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, vehicles: report.vehicles.map(vehicle => ({ ...vehicle, trims: vehicle.trims.map(({ provenance, ...trim }) => trim) })) }, null, 2));
}
if (require.main === module) audit(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { audit };
