const { test, expect } = require("@playwright/test");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const previewManifest = JSON.parse(readFileSync(resolve(__dirname, "../../docs/verification/crew-terms-v14-preview.json"), "utf8"));

const pdf = Buffer.from("%PDF-1.7\nfixture-only, not a legal document\n%%EOF");
const digest = createHash("sha256").update(pdf).digest("hex");
const legacy = {
  version: "v1.3", document_url: "https://recarplan.com/crew/friends/recar-friends-terms-v1.3.pdf",
  document_sha256: "48c3f29502436d7c844cea8f22a388d2c1aae3831b716dfd9c589b488f361d96",
  effective_at: null, effective_date: null, new_applications_only: true,
  sections: { terms: 1, privacy: 8, settlement: 6, disclosure: 15, advertising: 15 },
};
const newer = {
  ...legacy, version: "v1.4", document_sha256: digest,
  document_url: "https://recarplan.com/crew/friends/recar-friends-terms-v1.4.pdf",
  effective_at: "2026-10-14T12:00:00+09:00", effective_date: "2026-10-14",
  sections: previewManifest.sections,
};

async function setup(page, initial = newer) {
  const state = { terms: initial, termsStatus: 200, pdfStatus: 200, pdf, applications: [] };
  await page.route("https://api.recarplan.com/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body = {}, status = 200;
    if (path.endsWith("/terms")) { body = state.terms; status = state.termsStatus; }
    else if (path.endsWith("/login-id/check")) body = { available: true, login_id: "terms-fixture" };
    else if (path.endsWith("/apply")) { state.applications.push(route.request().postDataJSON()); body = { status: "PENDING", login_id: "terms-fixture" }; }
    else status = 404;
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route(newer.document_url, route => route.fulfill({ status: state.pdfStatus, contentType: "application/pdf", headers: { "Access-Control-Allow-Origin": "*" }, body: state.pdf }));
  return state;
}

async function fill(page) {
  await page.locator("#crewApplyName").fill("전용 테스트");
  await page.locator("#crewApplyPhone").fill("010-0000-0000");
  await page.locator("#crewApplyLoginId").fill("terms-fixture");
  await page.locator("#checkLoginIdButton").click();
  await expect(page.locator("#loginIdSuccess")).toBeVisible();
  await page.locator("#crewApplyPassword").fill("fixture-password-only");
  await page.locator("#crewApplyPasswordConfirm").fill("fixture-password-only");
}

test("published v1.4 is verified before consent and submitted with the exact digest", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/crew/login.html?action=apply");
  await expect(page.locator("#crewTermsVersion")).toContainText("v1.4 · 2026-10-14 운영 게시일부터 신규 가입에 적용");
  await expect(page.locator("#crewApplyPrivacy").locator("..").getByRole("link")).toHaveAttribute("href", `${newer.document_url}#page=9`);
  await fill(page);
  await page.locator("#crewApplyConsentAll").check();
  await page.locator("#crewApplyButton").click();
  await expect(page.locator("#crewApplyComplete")).toBeVisible();
  expect(state.applications).toHaveLength(1);
  expect(state.applications[0]).toMatchObject({ terms_version: "v1.4", terms_document_sha256: digest });
});

test("publication changes require renewed consent without losing application inputs", async ({ page }) => {
  const state = await setup(page, legacy);
  await page.goto("/crew/login.html?action=apply");
  await expect(page.locator("#crewTermsVersion")).toContainText("v1.3");
  await fill(page);
  await page.locator("#crewApplyConsentAll").check();
  state.terms = newer;
  await page.locator("#crewApplyButton").click();
  await expect(page.locator("#applyError")).toContainText("새 약관을 확인한 뒤 다시 동의");
  expect(state.applications).toHaveLength(0);
  await expect(page.locator("#crewApplyName")).toHaveValue("전용 테스트");
  await expect(page.locator("#crewApplyPrivacy")).not.toBeChecked();
  await page.locator("#crewApplyConsentAll").check();
  await page.locator("#crewApplyButton").click();
  await expect(page.locator("#crewApplyComplete")).toBeVisible();
  expect(state.applications).toHaveLength(1);
});

for (const kind of ["missing", "tampered", "unavailable"]) {
  test(`${kind} publication blocks submission clearly and retry preserves inputs`, async ({ page }) => {
    const state = await setup(page);
    if (kind === "missing") state.pdfStatus = 404;
    if (kind === "tampered") state.pdf = Buffer.from("%PDF-1.7\ntampered fixture\n%%EOF");
    if (kind === "unavailable") state.termsStatus = 503;
    await page.goto("/crew/login.html?action=apply");
    await expect(page.locator("#applyError")).toBeVisible();
    await expect(page.locator("#crewApplyButton")).toBeDisabled();
    await page.locator("#crewApplyName").fill("입력 유지 테스트");
    state.pdfStatus = 200; state.termsStatus = 200; state.pdf = pdf;
    await page.locator("#crewTermsRetry").click();
    await expect(page.locator("#crewTermsVersion")).toContainText("v1.4");
    await expect(page.locator("#crewApplyButton")).toBeEnabled();
    await expect(page.locator("#crewApplyName")).toHaveValue("입력 유지 테스트");
    expect(state.applications).toHaveLength(0);
  });
}

test("previous API without terms metadata continues with unchanged v1.3", async ({ page }) => {
  const state = await setup(page, legacy); state.termsStatus = 404;
  await page.goto("/crew/login.html?action=apply");
  await expect(page.locator("#crewTermsVersion")).toContainText("v1.3");
  await expect(page.locator("#crewApplyButton")).toBeEnabled();
});

test("the real prepared PDF passes integrity verification and all five links match its pages (mock publication only)", async ({ page }) => {
  const preparedPdf = readFileSync(resolve(__dirname, "../../crew/friends/recar-friends-terms-v1.4-preview.pdf"));
  expect(createHash("sha256").update(preparedPdf).digest("hex")).toBe(previewManifest.preview_sha256);
  expect(previewManifest.state).toBe("UNPUBLISHED_PREVIEW");
  const state = await setup(page, { ...newer, document_sha256: previewManifest.preview_sha256 });
  state.pdf = preparedPdf;
  await page.goto("/crew/login.html?action=apply");
  await expect(page.locator("#crewTermsVersion")).toContainText("v1.4");
  const fields = {
    terms: "#crewApplyTerms", privacy: "#crewApplyPrivacy", settlement: "#crewApplySettlementPolicy",
    disclosure: "#crewApplyAdDisclosure", advertising: "#crewApplyAdvertisingGuide",
  };
  for (const [section, field] of Object.entries(fields)) {
    await expect(page.locator(field).locator("..").getByRole("link")).toHaveAttribute("href", `${newer.document_url}#page=${previewManifest.sections[section]}`);
  }
  await expect(page.locator("#crewApplyButton")).toBeEnabled();
  expect(state.applications).toHaveLength(0);
});
