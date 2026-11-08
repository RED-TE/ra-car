// Public discovery plus server-owned selection_v1 prices. No price formula.
const API_BASE = "https://api.recarplan.com";
const REQUEST_TIMEOUT_MS = 12000;
const MAX_PRICE_REQUESTS = 12;
const MAX_CATALOG_PAGES = 100;
const CONDITIONS = Object.freeze({
  productType: "RENTAL", term: 60, depositPct: 0, guaranteePct: 0,
  mileageLimit: 10000,
});
const QUERY = Object.freeze({
  product_type: "RENTAL", term: 60, deposit_pct: 0, guarantee_pct: 0,
  mileage_limit: 10000,
});
const ESTIMATE_KEYS = [
  "version", "verified", "quote_kind", "monthly_payment", "product_type",
  "verification_scope", "unverified_conditions", "source_revision",
  "reference_vehicle_trim_id", "selection_fingerprint",
];
const ESTIMATE_SCOPE = [
  "vehicle", "trim", "options", "colors", "term", "annual_km", "prepayment_pct",
];
const SOURCES = new Set(["CHAZM_IMPORTED", "VEHICLE_QUOTE_LOOKUP"]);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;
const integer = (value) => Number.isSafeInteger(value);
const positive = (value) => integer(value) && value > 0;
const exactStrings = (value, expected) => Array.isArray(value) &&
  value.every((item) => typeof item === "string") &&
  value.length === expected.length && new Set(value).size === value.length &&
  expected.every((item) => value.includes(item));
const sameConditions = (value) => record(value) && value.term_months === 60 &&
  value.annual_km === 10000 && value.prepayment_pct === 0;
const exactConditions = (value) => record(value) &&
  ["term_months", "annual_km", "prepayment_pct"].every((key) => value[key] === "EXACT");

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function abortError() {
  const error = new Error("Request aborted");
  error.name = "AbortError";
  return error;
}

function assertActive(signal) {
  if (signal?.aborted) throw abortError();
}

async function defaultRequest(path, { method, query, body, signal }) {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(query || {})) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method, signal, credentials: "omit", redirect: "error",
    headers: body === undefined ? { Accept: "application/json" } : {
      Accept: "application/json", "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = failure("API_REQUEST_FAILED");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// The injected adapter returns the parsed API JSON body, not a fetch Response.
// The race also stops adapters that do not implement AbortSignal themselves.
async function call(request, path, options, signal) {
  assertActive(signal);
  const controller = new AbortController();
  let timer;
  let rejectStop;
  const stopped = new Promise((_, reject) => { rejectStop = reject; });
  const abort = () => { controller.abort(); rejectStop(abortError()); };
  signal?.addEventListener("abort", abort, { once: true });
  timer = setTimeout(() => {
    controller.abort();
    rejectStop(failure("API_TIMEOUT"));
  }, REQUEST_TIMEOUT_MS);
  try {
    assertActive(signal);
    const result = await Promise.race([
      Promise.resolve().then(() => {
        assertActive(signal);
        return request(path, { ...options, signal: controller.signal });
      }),
      stopped,
    ]);
    assertActive(signal);
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function hasRentalIdentity(row) {
  if (!record(row) || row.is_published === false) return false;
  const monetary = [row.displayed_product_type, row.monthly_payment_product_type]
    .filter((value) => value !== undefined && value !== null);
  if (monetary.some((value) => value !== "RENTAL")) return false;
  const available = row.available_product_types;
  if (available !== undefined && (!Array.isArray(available) ||
      !available.every((value) => typeof value === "string") ||
      (available.length > 0 && !available.includes("RENTAL")))) return false;
  return monetary.includes("RENTAL") ||
    (Array.isArray(available) && available.includes("RENTAL"));
}

function safeImage(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    // These are API assets, not homepage-relative files.
    const url = new URL(value, API_BASE);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

// Correct only known representative assets. Uploaded/custom/color images stay
// authoritative, and catalog records themselves are never mutated.
function vehicleImage(row) {
  const image = safeImage(row.image_url) || safeImage(row.thumbnail_url);
  const brand = String(row.brand || "").trim().toLowerCase();
  if (brand !== "genesis" && brand !== "제네시스") return image;
  const model = String(row.model_name || "").trim().replace(/^(?:genesis|제네시스)\s*/i, "")
    .replace(/\([^)]*\)/g, "")
    .toLowerCase().replace(/[\s_.-]/g, "");
  const electric = ["gv70ev", "gv70전동화", "egv70", "electrifiedgv70"].includes(model);
  if (model !== "gv70" && !electric) return image;
  if (image) {
    const url = new URL(image);
    if (!["api.recarplan.com", "recarplan.com", "www.recarplan.com"].includes(url.hostname) || url.port) return image;
    const pathname = url.pathname.toLowerCase().replace(/^\/(?:app\/)?assets\/assets\//, "/assets/");
    if (!["/assets/cars/genesis/gv70_360.png", "/assets/cars/genesis/gv70_jk_f_l_360.png",
      "/assets/danawa/genesis_gv70_360.png", "/assets/vehicles/genesis_gv70_360.png"].includes(pathname)) return image;
  }
  return electric
    ? `${API_BASE}/assets/danawa/genesis_electrified_gv70_360.png`
    : `${API_BASE}/assets/cars/Genesis/gv70_verified_20261109.png`;
}

function displayVehicle(row, trim = null) {
  const trims = Array.isArray(row.trims) ? row.trims
    .filter((item) => record(item) && text(item.id) &&
      (item.vehicle_id == null || item.vehicle_id === row.id))
    .map((item) => ({
      id: item.id, name: typeof item.name === "string" ? item.name : "",
      displayName: typeof item.display_name === "string" ? item.display_name : "",
      isAvailable: item.is_available === true,
    })) : [];
  return {
    id: row.id,
    brand: typeof row.brand === "string" ? row.brand : "",
    name: typeof row.model_name === "string" ? row.model_name : "",
    segment: typeof row.segment === "string" ? row.segment : "",
    fuel: typeof row.fuel === "string" ? row.fuel : "",
    year: integer(row.year) ? row.year : null,
    categories: Array.isArray(row.categories) ? row.categories
      .filter((item) => record(item) && text(item.key))
      .map((item) => ({ key: item.key, name: typeof item.name_ko === "string" ? item.name_ko : "" })) : [],
    defaultVehicleTrimId: text(row.default_vehicle_trim_id) ? row.default_vehicle_trim_id : null,
    trims, trimCount: trims.length,
    trim: trim && typeof trim.display_name === "string" ? trim.display_name :
      trim && typeof trim.name === "string" ? trim.name : "",
    imageUrl: vehicleImage(row),
    productType: "RENTAL",
    monthlyPayment: null,
    priceEvidence: { verified: false, ...CONDITIONS, reason: "PRICE_NOT_CHECKED" },
  };
}

function resolveDefaultTrim(detail, vehicleId, advertisedTrimId) {
  if (!record(detail) || detail.id !== vehicleId ||
      detail.is_published === false || !hasRentalIdentity(detail) ||
      !text(detail.default_vehicle_trim_id) || !Array.isArray(detail.trims)) {
    throw failure("DEFAULT_TRIM_UNVERIFIED");
  }
  if (advertisedTrimId != null && advertisedTrimId !== detail.default_vehicle_trim_id) {
    throw failure("CATALOG_CHANGED");
  }
  const ids = detail.trims.map((trim) => trim?.id);
  if (ids.some((id) => !text(id)) || new Set(ids).size !== ids.length) {
    throw failure("DEFAULT_TRIM_UNVERIFIED");
  }
  const trim = detail.trims.find((item) => item.id === detail.default_vehicle_trim_id);
  if (!record(trim) || trim.is_available !== true || !positive(trim.price) ||
      (trim.vehicle_id != null && trim.vehicle_id !== vehicleId)) {
    throw failure("DEFAULT_TRIM_UNVERIFIED");
  }
  return trim;
}

function commonEvidence(data, vehicleId, trimId) {
  const normalized = data.normalized_selection;
  if (!record(data) || (data.product_type != null && data.product_type !== "RENTAL") ||
      data.vehicle_id !== vehicleId || data.vehicle_trim_id !== trimId ||
      data.selection_contract_version !== "selection_v1" || !record(normalized) ||
      normalized.vehicle_trim_id !== trimId ||
      !exactStrings(normalized.selected_option_ids, []) ||
      normalized.exterior_color_id != null || normalized.interior_color_id != null ||
      normalized.inventory_item_id != null || !text(data.selection_fingerprint) ||
      !text(data.pricing_context_version) || !positive(data.selected_vehicle_price) ||
      !positive(data.monthly_payment) || data.term !== 60 || data.mileage_limit !== 10000 ||
      data.deposit !== 0 || data.prepayment_pct !== 0 || data.guarantee !== 0 ||
      (data.guarantee_pct != null && data.guarantee_pct !== 0) ||
      data.estimate_evidence != null || data.source_estimate != null ||
      data.pricing_basis === "SOURCE_ESTIMATE_V1" ||
      data.pricing_context_version.startsWith("selection-source-estimate-v1:")) {
    throw failure("QUOTE_EVIDENCE_UNVERIFIED");
  }
  const proof = data.price_provenance;
  const market = proof?.market_price;
  if (!record(proof) || proof.version !== "price_provenance_v1" ||
      proof.processed_product_type !== "RENTAL" || proof.quote_kind !== "ESTIMATE" ||
      proof.calculation_method !== "MARKET_REFERENCE_PLUS_EXISTING_SELECTION_DELTA" ||
      !record(market) || market.product_type !== "RENTAL" ||
      !["EXACT", "NORMALIZED_EXACT"].includes(market.vehicle_match) ||
      !SOURCES.has(market.source) || market.source !== (data.price_source ?? data.source) ||
      !text(market.source_record_id) || !text(market.source_revision) ||
      !text(market.calculation_method) || market.calculation_method === "UNKNOWN" ||
      (data.source != null && data.price_source != null && data.source !== data.price_source) ||
      (data.pricing_basis != null && data.pricing_basis !== "MARKET_SELECTION_DELTA_V1" &&
        data.pricing_basis !== (data.price_source ?? data.source)) ||
      data.market_pricing_applied === false || data.trim_pricing_applied === false ||
      !sameConditions(market.applied_conditions) || !exactConditions(market.condition_match)) {
    throw failure("QUOTE_EVIDENCE_UNVERIFIED");
  }
  return { proof, market };
}

function validateScoped(data, proof, market) {
  const estimate = data.selection_terms_estimate;
  const missingGuarantee = exactStrings(market.unknown_reasons, ["SOURCE_GUARANTEE_UNRECORDED"]);
  if (!record(estimate) || !exactStrings(Object.keys(estimate), ESTIMATE_KEYS) ||
      estimate.version !== "selection_terms_estimate_v1" || estimate.verified !== true ||
      estimate.quote_kind !== "ESTIMATE" || estimate.product_type !== "RENTAL" ||
      !positive(estimate.monthly_payment) || estimate.monthly_payment > 10000000 ||
      estimate.monthly_payment !== data.monthly_payment ||
      !exactStrings(estimate.verification_scope, ESTIMATE_SCOPE) ||
      !exactStrings(estimate.unverified_conditions, ["guarantee"]) ||
      typeof estimate.source_revision !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(estimate.source_revision) ||
      !text(estimate.reference_vehicle_trim_id) ||
      estimate.reference_vehicle_trim_id.trim() !== estimate.reference_vehicle_trim_id ||
      estimate.reference_vehicle_trim_id !== data.reference_vehicle_trim_id ||
      typeof estimate.selection_fingerprint !== "string" ||
      !/^[0-9a-f]{64}$/.test(estimate.selection_fingerprint) ||
      estimate.selection_fingerprint !== data.selection_fingerprint ||
      !positive(data.reference_vehicle_price) || data.selection_pricing_applied !== true ||
      data.market_pricing_applied !== true || data.trim_pricing_applied !== true ||
      data.selection_pricing_source !== "MARKET_SELECTION_DELTA_V1" ||
      data.pricing_basis !== "MARKET_SELECTION_DELTA_V1" || data.price_source !== "CHAZM_IMPORTED" ||
      !/^selection-market-v1:[0-9a-f]{16}$/.test(data.pricing_context_version) ||
      proof.provider_generated_at != null || proof.valid_until != null ||
      market.source !== "CHAZM_IMPORTED" || data.market_source_record_id !== market.source_record_id ||
      market.source_revision !== estimate.source_revision ||
      market.calculation_method !== "CHAZM_EXACT_CONDITION_LOOKUP" ||
      !exactStrings(market.methods, ["CONDITION_DIRECT"]) ||
      (missingGuarantee ? market.match_status !== "UNKNOWN" :
        market.match_status !== "EXACT" || !exactStrings(market.unknown_reasons, [])) ||
      proof.request_conditions_verified !== !missingGuarantee ||
      !exactStrings(proof.unsupported_reasons, missingGuarantee ? ["SOURCE_CONDITIONS_NOT_EXACTLY_VERIFIED"] : []) ||
      proof.sales_ai_eligible !== !missingGuarantee ||
      (own(data, "condition_verified_monthly_payment") &&
        data.condition_verified_monthly_payment !== (missingGuarantee ? null : data.monthly_payment))) {
    throw failure("QUOTE_EVIDENCE_UNVERIFIED");
  }
  const points = market.source_points;
  if (!Array.isArray(points) || points.length !== 1 || !record(points[0]) ||
      points[0].role !== "BASE" || points[0].path !== "products.rent.conditionMonthly.60:0:10000" ||
      !sameConditions(points[0].conditions)) throw failure("QUOTE_EVIDENCE_UNVERIFIED");
  return missingGuarantee;
}

function validatePrice(data, vehicleId, trimId) {
  if (!record(data)) throw failure("QUOTE_EVIDENCE_UNVERIFIED");
  const { proof, market } = commonEvidence(data, vehicleId, trimId);
  if (data.selection_terms_estimate != null && validateScoped(data, proof, market)) {
    return "GUARANTEE_UNRECORDED";
  }
  if (proof.request_conditions_verified !== true || proof.sales_ai_eligible !== true ||
      !exactStrings(proof.unsupported_reasons, []) || market.match_status !== "EXACT" ||
      !exactStrings(market.unknown_reasons, []) ||
      (own(data, "condition_verified_monthly_payment") &&
        data.condition_verified_monthly_payment !== data.monthly_payment)) {
    throw failure("QUOTE_EVIDENCE_UNVERIFIED");
  }
  const points = market.source_points;
  if (!Array.isArray(points) || points.length === 0 || points.some((point) =>
    !record(point) || !text(point.path) ||
    !["BASE", "ADJUSTMENT_BASE", "ADJUSTMENT_TARGET"].includes(point.role) ||
    !record(point.conditions) || point.conditions.term_months !== 60 ||
    typeof point.conditions.annual_km !== "number" || !Number.isFinite(point.conditions.annual_km) ||
    point.conditions.annual_km < 0 || typeof point.conditions.prepayment_pct !== "number" ||
    !Number.isFinite(point.conditions.prepayment_pct) || point.conditions.prepayment_pct < 0)) {
    throw failure("QUOTE_EVIDENCE_UNVERIFIED");
  }
  // Direct lookup has no adjustment anchors: its one original BASE row must
  // prove these exact conditions, not merely agree in the applied-condition echo.
  // Other existing calculation paths retain their documented anchor semantics.
  if (market.calculation_method === "CHAZM_EXACT_CONDITION_LOOKUP" &&
      (market.source !== "CHAZM_IMPORTED" || !exactStrings(market.methods, ["CONDITION_DIRECT"]) ||
        points.length !== 1 || points[0].role !== "BASE" ||
        points[0].path !== "products.rent.conditionMonthly.60:0:10000" ||
        !sameConditions(points[0].conditions))) {
    throw failure("QUOTE_EVIDENCE_UNVERIFIED");
  }
  return "EXACT";
}

async function pricedVehicle(row, { request, signal, detail: existingDetail }) {
  let item = displayVehicle(row);
  try {
    const detail = existingDetail ?? await call(request,
      `/api/v1/vehicles/${encodeURIComponent(row.id)}`, { method: "GET", query: QUERY }, signal);
    const trim = resolveDefaultTrim(detail, row.id, row.default_vehicle_trim_id);
    item = displayVehicle({ ...row, ...detail }, trim);
    assertActive(signal);
    const envelope = await call(request, "/api/v1/quotes/instant", {
      method: "POST",
      body: {
        vehicle_id: row.id, selection_contract_version: "selection_v1",
        selection: { vehicle_trim_id: trim.id, selected_option_ids: [] },
        product_type: "RENTAL", term: 60, prepayment_pct: 0,
        guarantee: 0, guarantee_pct: 0, mileage_limit: 10000,
      },
    }, signal);
    const data = envelope?.data;
    const scope = validatePrice(data, row.id, trim.id);
    assertActive(signal);
    return {
      ...item, monthlyPayment: data.monthly_payment,
      priceEvidence: {
        verified: true, ...CONDITIONS, quoteKind: "ESTIMATE", isEstimate: true,
        evidenceScope: scope,
        unverifiedConditions: scope === "GUARANTEE_UNRECORDED" ? ["guarantee"] : [],
      },
    };
  } catch (error) {
    assertActive(signal);
    if (error?.name === "AbortError") throw error;
    return { ...item, priceEvidence: { verified: false, ...CONDITIONS, reason: "PRICE_UNVERIFIED" } };
  }
}

async function discover(request, signal) {
  const rows = [];
  const ids = new Set();
  let expectedTotal;
  let expectedPages;
  for (let page = 1; page <= MAX_CATALOG_PAGES; page++) {
    const result = await call(request, "/api/v1/vehicles/", {
      method: "GET", query: { ...QUERY, sort: "display_order", page, size: 100 },
    }, signal);
    if (!record(result) || !Array.isArray(result.items) || result.page !== page ||
        !positive(result.size) || !integer(result.total) || result.total < 0 ||
        !integer(result.pages) || result.pages < 0 || result.pages > MAX_CATALOG_PAGES ||
        (result.total > 0 && result.pages < 1) || result.items.length > result.size ||
        (expectedTotal !== undefined && result.total !== expectedTotal) ||
        (expectedPages !== undefined && result.pages !== expectedPages)) {
      throw failure("CATALOG_INCOMPLETE");
    }
    expectedTotal = result.total;
    expectedPages = result.pages;
    for (const row of result.items) {
      if (!record(row) || !text(row.id) || ids.has(row.id)) throw failure("CATALOG_INCOMPLETE");
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length > expectedTotal || (result.items.length === 0 && rows.length < expectedTotal)) {
      throw failure("CATALOG_INCOMPLETE");
    }
    if (page >= expectedPages) {
      if (rows.length !== expectedTotal) throw failure("CATALOG_INCOMPLETE");
      return rows.filter(hasRentalIdentity);
    }
  }
  throw failure("CATALOG_INCOMPLETE");
}

/** Return all explicit RENTAL identities; limit bounds price POSTs, not rows. */
export async function loadRentalCatalog({ request = defaultRequest, signal, limit = 12 } = {}) {
  if (typeof request !== "function" || !integer(limit) || limit < 0) throw failure("INVALID_REQUEST_OPTIONS");
  const rows = await discover(request, signal);
  const items = rows.map((row) => displayVehicle(row));
  const budget = Math.min(limit, MAX_PRICE_REQUESTS, rows.length);
  let next = 0;
  async function worker() {
    for (;;) {
      assertActive(signal);
      const index = next++;
      if (index >= budget) return;
      items[index] = await pricedVehicle(rows[index], { request, signal });
    }
  }
  await Promise.all([worker(), worker()]);
  assertActive(signal);
  return items;
}

/** Fetch one published rental's official default trim and validated baseline. */
export async function loadRentalVehicle(id, { request = defaultRequest, signal } = {}) {
  if (!text(id) || typeof request !== "function") throw failure("INVALID_REQUEST_OPTIONS");
  const detail = await call(request, `/api/v1/vehicles/${encodeURIComponent(id)}`,
    { method: "GET", query: QUERY }, signal);
  if (!record(detail) || detail.id !== id) throw failure("VEHICLE_ID_MISMATCH");
  if (!hasRentalIdentity(detail) || detail.is_published === false) return null;
  return pricedVehicle(detail, { request, signal, detail });
}
