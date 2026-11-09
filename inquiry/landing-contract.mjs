// Compatibility for previously published or cached inquiry documents.
// Keep their URLs usable without restoring the retired price/submit contract.
export function inquiryFlowHref(search = "") {
  const source = new URLSearchParams(String(search).split("#", 1)[0]);
  const safe = new URLSearchParams();
  if (source.has("ref")) {
    const values = source.getAll("ref");
    const code = values.length === 1 ? values[0].trim().toUpperCase() : "";
    // Empty explicit ref also prevents the active form from using stored attribution.
    safe.set("ref", /^RC-[A-Z0-9]{4,16}$/.test(code) ? code : "");
  }
  for (const key of new Set(source.keys())) {
    if (!/^(utm_[a-z_]+|gclid|fbclid|msclkid|n_[a-z_]+|NaPm)$/.test(key)) continue;
    const values = source.getAll(key);
    if (values.length === 1 && values[0].length <= 2048) safe.set(key, values[0]);
  }
  const query = safe.toString();
  return `/inquiry/steps.html${query ? `?${query}` : ""}`;
}

export function redirectLegacyInquiry(location = globalThis.location) {
  if (!location || location.pathname === "/inquiry/steps.html" || typeof location.replace !== "function") return false;
  location.replace(inquiryFlowHref(location.search));
  return true;
}

// Retain export names for a cached old runtime, but never read prices or send data.
export const LANDING_DEFAULTS = Object.freeze({});
export const isLocalPreview = () => true;
export const loadLandingData = async () => ({ all: [], ranked: [], inv: null, cfg: null });
export const landingEntryFromSearch = () => ({ vehicleName: "", productType: "", conditions: {}, summary: "" });
export const withLandingEntry = () => ({});
export const validReceipt = () => false;
export function buildLandingPayload() { throw new Error("INQUIRY_FLOW_MOVED"); }
export function createSubmissionController() {
  return { state: "retired", async submit() { throw new Error("INQUIRY_FLOW_MOVED"); } };
}
export const withReferral = (_value, search) => inquiryFlowHref(search);

redirectLegacyInquiry();
