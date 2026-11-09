// Synthetic prices/evidence only. Historical catalog metadata supplies the
// existing image/name fixtures; none of its recorded prices are reused.
const metadata = require("../../data/vehicle-static-catalog.json");
const catalog = { items: metadata.items.map((row, index) => ({
  id: `SYNTHETIC-UI-${index}`, brand: row.brand, name: row.name,
  categories: [...row.categories], imageUrl: row.imageUrl.replace(/^\.\//, "/"),
  monthlyPayment: 300100 + index * 1000,
})) };
const rows = catalog.items.map(row => ({
  id: row.id, brand: row.brand, model_name: row.name,
  segment: row.categories.includes("suv") ? "suv" : row.categories.includes("sedan") ? "sedan" : "van",
  image_url: `https://api.recarplan.com${row.imageUrl}`, default_vehicle_trim_id: `${row.id}-TRIM`,
  available_product_types: ["RENTAL"], displayed_product_type: "RENTAL",
  monthly_payment: 9999999, // Discovery price must never become display proof.
}));

function listPage(page = 1, items = rows) {
  return { items: items.slice((page - 1) * 100, page * 100), page, size: 100,
    total: items.length, pages: Math.ceil(items.length / 100) };
}

function detail(id) {
  const row = rows.find(item => item.id === id);
  if (!row) return null;
  return { ...row, is_published: true, trims: [
    { id: row.default_vehicle_trim_id, vehicle_id: id, name: "합성 기본 트림", is_available: true, price: 30000000 },
  ] };
}

function quote(id) {
  const item = catalog.items.find(row => row.id === id);
  if (!item) return null;
  const trim = `${id}-TRIM`;
  const conditions = { term_months: 60, annual_km: 10000, prepayment_pct: 0 };
  return { data: {
    product_type: "RENTAL", vehicle_id: id, vehicle_trim_id: trim,
    selection_contract_version: "selection_v1",
    normalized_selection: { vehicle_trim_id: trim, selected_option_ids: [], exterior_color_id: null, interior_color_id: null, inventory_item_id: null },
    selection_fingerprint: "a".repeat(64), pricing_context_version: "selection-market-v1:0123456789abcdef",
    selected_vehicle_price: 30000000, monthly_payment: item.monthlyPayment,
    condition_verified_monthly_payment: item.monthlyPayment,
    term: 60, mileage_limit: 10000, deposit: 0, prepayment_pct: 0, guarantee: 0, guarantee_pct: 0,
    price_source: "CHAZM_IMPORTED", pricing_basis: "MARKET_SELECTION_DELTA_V1",
    market_pricing_applied: true, trim_pricing_applied: true,
    price_provenance: {
      version: "price_provenance_v1", processed_product_type: "RENTAL", quote_kind: "ESTIMATE",
      calculation_method: "MARKET_REFERENCE_PLUS_EXISTING_SELECTION_DELTA",
      request_conditions_verified: true, sales_ai_eligible: true, unsupported_reasons: [],
      market_price: {
        product_type: "RENTAL", source: "CHAZM_IMPORTED", source_record_id: "SYNTHETIC-UI-ROW",
        source_revision: `sha256:${"b".repeat(64)}`, match_status: "EXACT", vehicle_match: "EXACT",
        calculation_method: "CHAZM_EXACT_CONDITION_LOOKUP", methods: ["CONDITION_DIRECT"], unknown_reasons: [],
        applied_conditions: conditions,
        condition_match: { term_months: "EXACT", annual_km: "EXACT", prepayment_pct: "EXACT" },
        source_points: [{ path: "products.rent.conditionMonthly.60:0:10000", role: "BASE", conditions }],
      },
    },
  } };
}

module.exports = { catalog, rows, listPage, detail, quote };
