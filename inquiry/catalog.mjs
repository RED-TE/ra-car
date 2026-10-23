export const API_BASE = "https://api.recarplan.com";
export const STEPS = ["제조사", "차량", "트림·색상", "이용조건", "연락처", "최종 확인"];
const PRODUCTS = new Set(["RENTAL", "LEASE"]);
export const CATALOG_CACHE_KEY = "recar_inquiry_discovery_v1";
export const CATALOG_CACHE_TTL = 5 * 60 * 1000;
const DISCOVERY_FIELDS = new Set(["id", "brand", "model_name", "available_product_types", "image_url", "thumbnail_url"]);

function checkAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Request aborted", "AbortError");
}

export async function requestJson(path, { method = "GET", body, fetcher = fetch, timeout = 12000, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    checkAborted(controller.signal);
    const response = await fetcher(`${API_BASE}${path}`, {
      method, signal: controller.signal, credentials: "omit", cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    checkAborted(controller.signal);
    if (!response.ok) throw new Error(`API_HTTP_${response.status}`);
    const result = await response.json();
    checkAborted(controller.signal);
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function sessionStorageOrNull() {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

function discoveryRow(row, cached = false) {
  if (!row || typeof row.id !== "string" || !row.id.trim()
    || typeof row.brand !== "string" || !row.brand.trim()
    || typeof row.model_name !== "string" || !row.model_name.trim()
    || !Array.isArray(row.available_product_types)) throw new Error("CATALOG_INVALID");
  const products = [...new Set(row.available_product_types.filter(type => PRODUCTS.has(type)))];
  if (cached && (!products.length || products.length !== row.available_product_types.length
    || Object.keys(row).some(key => !DISCOVERY_FIELDS.has(key)))) throw new Error("CATALOG_INVALID");
  const item = { id: row.id, brand: row.brand, model_name: row.model_name, available_product_types: products };
  for (const field of ["image_url", "thumbnail_url"]) {
    const image = typeof row[field] === "string" ? safeImage(row[field]) : "";
    if (cached && Object.hasOwn(row, field) && (!image || image !== row[field])) throw new Error("CATALOG_INVALID");
    if (image) item[field] = image;
  }
  return item;
}

function readCatalogCache(storage, now) {
  try {
    const cache = JSON.parse(storage?.getItem(CATALOG_CACHE_KEY) || "null");
    const age = now() - cache?.saved_at;
    if (cache?.contract_version !== "inquiry_discovery_v1" || cache.sort !== "display_order" || cache.complete !== true
      || !Number.isSafeInteger(cache.saved_at) || !Number.isFinite(age) || age < 0 || age >= CATALOG_CACHE_TTL
      || !Array.isArray(cache.items) || !Number.isInteger(cache.total) || cache.total !== cache.items.length
      || cache.total <= 0 || cache.total > 2000) return null;
    const items = cache.items.map(row => discoveryRow(row, true));
    if (new Set(items.map(row => row.id)).size !== items.length) return null;
    return items;
  } catch { return null; }
}

function writeCatalogCache(storage, items, now) {
  if (!items.length) return;
  try {
    const savedAt = now();
    if (!Number.isSafeInteger(savedAt)) return;
    storage?.setItem(CATALOG_CACHE_KEY, JSON.stringify({
      contract_version: "inquiry_discovery_v1", sort: "display_order", complete: true,
      saved_at: savedAt, total: items.length, items,
    }));
  } catch { /* A blocked or full session store must not prevent discovery. */ }
}

function discoveryCatalog(result) {
  if (result?.contract_version !== "discovery_v1" || result.complete !== true
    || !/^[a-f0-9]{64}$/.test(result.revision || "")
    || !Number.isInteger(result.total) || result.total < 0 || result.total > 2000
    || !Array.isArray(result.items) || result.items.length !== result.total) throw new Error("CATALOG_INVALID");
  const items = result.items.map(row => discoveryRow(row, true));
  if (new Set(items.map(row => row.id)).size !== items.length) throw new Error("CATALOG_INVALID");
  return items;
}

// Do not publish a partial catalog when pagination or identifiers are inconsistent.
export async function loadCatalog(request = requestJson, { storage = sessionStorageOrNull(), now = Date.now, signal, forceRefresh = false, preferDiscovery = request === requestJson } = {}) {
  checkAborted(signal);
  if (!forceRefresh) {
    const cached = readCatalogCache(storage, now);
    checkAborted(signal);
    if (cached) return cached;
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const all = [];
  const seen = new Set();
  let expectedTotal = null;
  let expectedPages = null;
  async function readPage(page) {
    checkAborted(controller.signal);
    const result = await request(`/api/v1/vehicles/?page=${page}&size=100&sort=display_order`, { signal: controller.signal });
    checkAborted(controller.signal);
    if (!result || !Array.isArray(result.items) || !Number.isInteger(result.total) || !Number.isInteger(result.pages)
      || result.total < 0 || result.total > 2000 || result.pages < 0 || result.pages > 20 || result.page !== page
      || result.items.length > 100 || (result.pages === 0 && result.total !== 0)) {
      throw new Error("CATALOG_INVALID");
    }
    if (expectedTotal !== null && (expectedTotal !== result.total || expectedPages !== result.pages)) {
      throw new Error("CATALOG_CHANGED");
    }
    if (page < result.pages && !result.items.length) throw new Error("CATALOG_INCOMPLETE");
    return result;
  }
  function appendPage(result) {
    for (const row of result.items) {
      const item = discoveryRow(row);
      if (seen.has(item.id)) throw new Error("CATALOG_INVALID");
      seen.add(row.id);
      if (item.available_product_types.length) all.push(item);
    }
  }
  try {
    if (preferDiscovery) {
      try {
        const response = await request("/api/v1/vehicles/discovery", { signal: controller.signal });
        checkAborted(controller.signal);
        const items = discoveryCatalog(response);
        writeCatalogCache(storage, items, now);
        return items;
      } catch (error) {
        // Only an older API without this route can use the paginated contract.
        if (error?.message !== "API_HTTP_404") throw error;
      }
    }
    const first = await readPage(1);
    expectedTotal = first.total;
    expectedPages = first.pages;
    appendPage(first);
    // Two-page batches bound server load and preserve the server's display order.
    for (let page = 2; page <= expectedPages; page += 2) {
      const pages = [page];
      if (page + 1 <= expectedPages) pages.push(page + 1);
      const results = await Promise.all(pages.map(readPage));
      for (const result of results) appendPage(result);
    }
    if (seen.size !== expectedTotal) throw new Error("CATALOG_INCOMPLETE");
    checkAborted(controller.signal);
    writeCatalogCache(storage, all, now);
    return all;
  } catch (error) {
    controller.abort(error);
    throw error;
  } finally { signal?.removeEventListener("abort", abort); }
}

export function selectableTrims(detail) {
  const trims = (detail.trims || []).filter(trim => trim.id && trim.is_available !== false);
  const hierarchy = detail.trim_selection;
  if (!hierarchy) return trims;
  if (hierarchy.mode === "UNAVAILABLE") return [];
  const leaves = hierarchy.mode === "GROUPED" ? (hierarchy.groups || []).flatMap(group => group.grades || [])
    : hierarchy.mode === "FLAT" ? hierarchy.flat_grades || [] : [];
  const ids = new Set(leaves.filter(leaf => leaf.is_active === true).map(leaf => leaf.vehicle_trim_id));
  return trims.filter(trim => ids.has(trim.id));
}

export function colorsFor(trim, type) {
  return (trim?.colors || []).filter(color => color.id && color.type === type && color.name);
}

export function safeImage(value) {
  if (!value) return "";
  try {
    const url = new URL(value, API_BASE);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.href;
  } catch { return ""; }
}

export function referralCode(search, storage) {
  const normalize = value => /^RC-[A-Z0-9]{4,16}$/.test(String(value || "").trim().toUpperCase())
    ? String(value).trim().toUpperCase() : "";
  const params = new URLSearchParams(search);
  if (params.has("ref")) return normalize(params.get("ref"));
  try {
    const app = JSON.parse(storage?.getItem("flutter.recar_referral_code") || "null");
    return normalize(app) || normalize(storage?.getItem("recar_referral_code"));
  } catch {
    try { return normalize(storage?.getItem("recar_referral_code")); } catch { return ""; }
  }
}

export function validPhone(value) { return /^01[016789]\d{7,8}$/.test(value.replace(/\D/g, "")); }

export function inquiryPayload(state, contact, code) {
  const { vehicle, detail, trim, exterior, interior, conditions: c } = state;
  if (!vehicle || detail?.id !== vehicle.id || !selectableTrims(detail).some(row => row.id === trim?.id)) {
    throw new Error("SELECTION_INVALID");
  }
  if (!vehicle.available_product_types.includes(c.product)
    || ![24, 36, 48, 60].includes(c.term) || ![10000, 20000, 30000, 40000].includes(c.mileage)
    || ![0, 10, 20, 30, 40].includes(c.deposit) || ![0, 10, 20, 30, 40].includes(c.prepayment)
    || ![21, 26].includes(c.age)) throw new Error("CONDITIONS_INVALID");
  for (const [color, type] of [[exterior, "exterior"], [interior, "interior"]]) {
    const choices = colorsFor(trim, type);
    if ((choices.length && !color) || (color && !choices.some(row => row.id === color.id))) {
      throw new Error("COLOR_INVALID");
    }
  }
  if (!contact.name.trim() || contact.name.trim().length > 100 || !validPhone(contact.phone) || !contact.agreed) {
    throw new Error("CONTACT_INVALID");
  }
  const summary = [
    "단계형 문의 /inquiry/", `vehicle_id=${vehicle.id}`, `trim_id=${trim.id}`,
    `외장: ${exterior?.name || "상담 시 확인"}${exterior ? ` (${exterior.id})` : ""}`,
    `내장: ${interior?.name || "상담 시 확인"}${interior ? ` (${interior.id})` : ""}`,
    `${c.term}개월`, `연 ${c.mileage.toLocaleString("ko-KR")}km`,
    `보증금 ${c.deposit}%`, `선납금 ${c.prepayment}%`,
    ...(c.product === "RENTAL" ? [`보험연령 만 ${c.age}세 이상`] : []),
  ].join(" · ");
  if (summary.length > 1000) throw new Error("SUMMARY_TOO_LONG");
  return {
    name: contact.name.trim(), phone: contact.phone.replace(/\D/g, ""), privacy_agreed: true,
    vehicle_name: `${vehicle.brand} ${vehicle.model_name}`.slice(0, 200),
    trim_name: (trim.display_name || trim.name).slice(0, 200), product_type: c.product,
    condition_summary: summary, term_months: c.term, mileage_per_year: c.mileage,
    // A representative list price is never a verified quote for these conditions.
    quoted_monthly_payment: null, ...(code ? { referral_code: code } : {}),
  };
}
