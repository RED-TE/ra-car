export const API_BASE = "https://api.recarplan.com";
export const STEPS = ["제조사", "차량", "트림·색상", "이용조건", "연락처", "최종 확인"];
const PRODUCTS = new Set(["RENTAL", "LEASE"]);

export async function requestJson(path, { method = "GET", body, fetcher = fetch, timeout = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetcher(`${API_BASE}${path}`, {
      method, signal: controller.signal, credentials: "omit", cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`API_HTTP_${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

// Do not publish a partial catalog when pagination or identifiers are inconsistent.
export async function loadCatalog(request = requestJson) {
  const all = [];
  const seen = new Set();
  let expectedTotal = null;
  let expectedPages = null;
  for (let page = 1; page <= 20; page++) {
    const result = await request(`/api/v1/vehicles/?page=${page}&size=100&sort=display_order`);
    if (!Array.isArray(result.items) || !Number.isInteger(result.total) || !Number.isInteger(result.pages)
      || result.total < 0 || result.pages < 0 || result.pages > 20 || result.page !== page) {
      throw new Error("CATALOG_INVALID");
    }
    if (expectedTotal !== null && (expectedTotal !== result.total || expectedPages !== result.pages)) {
      throw new Error("CATALOG_CHANGED");
    }
    expectedTotal = result.total;
    expectedPages = result.pages;
    for (const row of result.items) {
      if (!row || typeof row.id !== "string" || !row.id || seen.has(row.id)
        || typeof row.brand !== "string" || !row.brand || typeof row.model_name !== "string"
        || !Array.isArray(row.available_product_types)) throw new Error("CATALOG_INVALID");
      seen.add(row.id);
      const products = [...new Set(row.available_product_types.filter(type => PRODUCTS.has(type)))];
      if (products.length) all.push({ ...row, available_product_types: products });
    }
    if (page >= result.pages) {
      if (seen.size !== expectedTotal) throw new Error("CATALOG_INCOMPLETE");
      return all;
    }
    if (!result.items.length) throw new Error("CATALOG_INCOMPLETE");
  }
  throw new Error("CATALOG_INCOMPLETE");
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
