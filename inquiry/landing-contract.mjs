import { requestJson, referralCode, safeImage, validPhone } from "./catalog.mjs?v=20261023";

export const LANDING_DEFAULTS = Object.freeze({ term: 36, depositPct: 30, mileage: 20000 });
const KNOWN_REJECTIONS = new Set([400, 401, 403, 404, 405, 410, 413, 415, 422, 429]);
const positiveAmount = value => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
const unwrap = value => value && !Array.isArray(value) && Object.hasOwn(value, "data") && Object.hasOwn(value, "meta") ? value.data : value;

export function isLocalPreview(value) {
  const hostname = String(value?.hostname || "").toLowerCase();
  return value?.protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1"
    || hostname === "[::1]" || hostname === "::1" || hostname.endsWith(".localhost") || hostname.endsWith(".test");
}

// These are catalog reference prices, never a quote for the answers in the test.
export async function loadLandingData(request = requestJson) {
  async function allPages(product) {
    const rows = [], ids = new Set();
    let total, pages;
    for (let page = 1; page <= (pages ?? 1); page++) {
      const query = new URLSearchParams({ term: "36", deposit_pct: "30", mileage_limit: "20000", ...(product ? { product_type: product } : {}), size: "100", page: String(page) });
      const result = unwrap(await request(`/api/v1/vehicles/?${query}`));
      if (!result || !Array.isArray(result.items) || !Number.isInteger(result.total) || result.total < 0 || result.total > 2000
        || !Number.isInteger(result.pages) || result.pages < 0 || result.pages > 20 || result.page !== page
        || result.items.length > 100 || (result.total > 0 && !result.pages)
        || (pages !== undefined && (result.pages !== pages || result.total !== total))) throw new Error("LANDING_CATALOG_INVALID");
      ({ total, pages } = result);
      for (const row of result.items) {
        if (!row || typeof row.id !== "string" || !row.id.trim() || ids.has(row.id)
          || typeof row.brand !== "string" || !row.brand.trim() || typeof row.model_name !== "string" || !row.model_name.trim()
          || !Array.isArray(row.available_product_types)) throw new Error("LANDING_CATALOG_INVALID");
        ids.add(row.id); rows.push(row);
      }
    }
    if (rows.length !== total) throw new Error("LANDING_CATALOG_INCOMPLETE");
    return rows;
  }
  const [all, rental] = await Promise.all([allPages(), allPages("RENTAL")]);
  const rentals = new Map(rental.map(row => [row.id, row]));
  const price = row => positiveAmount(row?.representative_monthly_price) || positiveAmount(row?.monthly_payment);
  const items = all.map((row, rank) => {
    const types = row.available_product_types.filter(type => type === "RENTAL" || type === "LEASE");
    const rentRow = rentals.get(row.id);
    // An identifier alone cannot authorize attaching a different vehicle's price.
    if (rentRow && (rentRow.brand !== row.brand || rentRow.model_name !== row.model_name)) throw new Error("LANDING_CATALOG_CHANGED");
    return {
      id: row.id, brand: row.brand, model_name: row.model_name,
      segment: typeof row.segment === "string" ? row.segment : "", fuel: typeof row.fuel === "string" ? row.fuel : "",
      display_order: Number.isFinite(row.display_order) ? row.display_order : null, rank,
      price_from: positiveAmount(row.price_from), image_url: safeImage(row.image_url || row.thumbnail_url),
      available_product_types: types, categories: Array.isArray(row.categories) ? row.categories.filter(item => item && typeof item.key === "string").map(item => ({ key: item.key })) : [],
      rent: types.includes("RENTAL") ? (rentRow?.available_product_types.includes("RENTAL") && rentRow.displayed_product_type !== "LEASE" ? price(rentRow) : null) || (row.displayed_product_type === "RENTAL" ? price(row) : null) : null,
      lease: null, canRent: types.includes("RENTAL"), canLease: types.includes("LEASE"),
    };
  });
  return { all: items, ranked: [...items].sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999) || a.rank - b.rank), inv: null, cfg: null };
}

// An existing home-page selection is an expressed wish, not a priced offer.
// Ignore duplicate keys, noncanonical numbers and contact details in the URL.
export function landingEntryFromSearch(search) {
  const params = new URLSearchParams(search);
  const one = key => params.getAll(key).length === 1 ? params.get(key) : null;
  const safeName = (key, max) => {
    const value = one(key);
    if (!value || value.length > max || !/^[\p{L}\p{N}\p{M} .()+/&-]+$/u.test(value)) return "";
    return value.trim().replace(/ +/g, " ");
  };
  const brand = safeName("brand", 50), model = safeName("model", 100);
  const normalized = value => value.replace(/\s/g, "").toLocaleLowerCase("ko-KR");
  const combined = model && brand && !normalized(model).startsWith(normalized(brand)) ? `${brand} ${model}` : model;
  const vehicleName = combined.length <= 100 ? combined : "";
  const product = one("product");
  const productType = product === "RENTAL" || product === "LEASE" ? product : "";
  const conditions = {};
  for (const [key, allowed] of [["term", [24, 36, 48, 60]], ["mileage", [10000, 20000, 30000, 40000]], ["deposit", [0, 10, 20, 30, 40]], ["prepayment", [0, 10, 20, 30, 40]]]) {
    const raw = one(key);
    if (raw !== null && /^(?:0|[1-9]\d*)$/.test(raw) && allowed.includes(Number(raw))) conditions[key] = Number(raw);
  }
  const parts = [
    vehicleName && `차종 ${vehicleName}`,
    productType && (productType === "LEASE" ? "리스" : "장기렌트"),
    Object.hasOwn(conditions, "term") && `${conditions.term}개월`,
    Object.hasOwn(conditions, "mileage") && `연 ${conditions.mileage.toLocaleString("ko-KR")}km`,
    Object.hasOwn(conditions, "deposit") && `보증금 ${conditions.deposit}%`,
    Object.hasOwn(conditions, "prepayment") && `선납금 ${conditions.prepayment}%`,
  ].filter(Boolean);
  return Object.freeze({ vehicleName, productType, conditions: Object.freeze(conditions), summary: parts.join(" · ") });
}

export function withLandingEntry(payload = {}, entry, options = {}) {
  const currentProduct = payload.product_type === "RENTAL" || payload.product_type === "LEASE" ? payload.product_type : "";
  const hasOverride = Object.hasOwn(options, "productOverride");
  const override = options.productOverride === "RENTAL" || options.productOverride === "LEASE" ? options.productOverride : "";
  const productType = hasOverride ? override : currentProduct || entry?.productType;
  const origin = entry?.summary ? `${options.quiz ? "홈페이지에서 전달한 희망조건(테스트 답변과 별도)" : "홈페이지 희망조건"}: ${entry.summary} · 조건 견적 아님` : "";
  const resetNote = hasOverride && !productType ? "현재 상담 방식: 미정(이전 상품 선택 해제)" : "";
  const rest = { ...payload };
  delete rest.product_type;
  return {
    ...rest,
    condition_summary: [payload.condition_summary, origin, resetNote].filter(Boolean).join(" · "),
    quoted_monthly_payment: null,
    ...(productType === "RENTAL" || productType === "LEASE" ? { product_type: productType } : {}),
  };
}

export function buildLandingPayload(contact, payload = {}, code = "") {
  const name = String(contact?.name || "").trim(), phone = String(contact?.phone || "").replace(/\D/g, "");
  if (!name || name.length > 100 || !validPhone(phone) || contact?.agreed !== true || contact?.notice !== true) throw new Error("CONTACT_INVALID");
  const vehicle = String(payload.vehicle_name || "상담 시 안내").trim();
  const summary = String(payload.condition_summary || "랜딩 상담").trim();
  if (!vehicle || vehicle.length > 200 || summary.length > 1000) throw new Error("INQUIRY_INVALID");
  const normalizedCode = referralCode(`?ref=${encodeURIComponent(code)}`);
  return {
    name, phone, privacy_agreed: true, vehicle_name: vehicle,
    condition_summary: summary || "랜딩 상담", quoted_monthly_payment: null,
    ...(payload.product_type === "LEASE" || payload.product_type === "RENTAL" ? { product_type: payload.product_type } : {}),
    ...(normalizedCode ? { referral_code: normalizedCode } : {}),
  };
}

export function validReceipt(receipt) {
  return !!receipt && typeof receipt.id === "string" && !!receipt.id.trim() && receipt.id.length <= 200 && receipt.status === "NEW";
}

// A page-wide controller prevents the quick form and test from creating duplicates.
// Unknown delivery is terminal for this page; it is never silently retried.
export function createSubmissionController({ request = requestJson, isPreview = false } = {}) {
  let state = "idle";
  return {
    get state() { return state; },
    async submit(contact, payload, code) {
      if (state !== "idle") throw new Error(state === "pending" ? "INQUIRY_PENDING" : state === "succeeded" ? "INQUIRY_ALREADY_RECEIVED" : "INQUIRY_UNCERTAIN");
      const body = buildLandingPayload(contact, payload, code);
      if (isPreview) return { preview: true };
      state = "pending";
      try {
        const receipt = await request("/api/v1/support/quote-inquiries", { method: "POST", body, timeout: 20000 });
        if (!validReceipt(receipt)) throw new Error("RECEIPT_INVALID");
        state = "succeeded";
        return { id: receipt.id, status: receipt.status };
      } catch (error) {
        const status = Number(/^API_HTTP_(\d{3})$/.exec(error?.message || "")?.[1]);
        state = KNOWN_REJECTIONS.has(status) ? "idle" : "uncertain";
        throw error;
      }
    },
  };
}

// Only the official product links inherit the crew code. An explicit invalid ref
// deliberately removes any destination ref rather than restoring a stored code.
export function withReferral(value, search, storage, base = "https://recarplan.com") {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || !["recarplan.com", "www.recarplan.com"].includes(url.hostname) || url.username || url.password) return value;
    url.searchParams.delete("ref");
    const code = referralCode(search, storage);
    if (code) url.searchParams.set("ref", code);
    return url.href;
  } catch { return value; }
}
