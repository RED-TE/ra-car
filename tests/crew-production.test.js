const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const { createHash } = require("node:crypto");
const { verifyCrewProduction } = require("../tools/verify-crew-production.cjs");

function fixture(change = () => {}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const parsed = new URL(url);
    const path = parsed.pathname;
    let status = 200;
    let body = "";
    const headers = { "cache-control": "no-store" };
    if (["/crew", "/crew/", "/crew/login", "/crew/login/"].includes(path) && !url.includes("recarplan.com/crew/login/?")) {
      status = 302;
      headers.location = `https://recarplan.com/crew/${path.includes("login") ? "login" : "welcome"}.html`;
      if (parsed.searchParams.get("action") === "apply") headers.location += "?action=apply";
      if (parsed.searchParams.has("ref")) headers.location = "https://recarplan.com/app/?ref=RC-TST123";
    } else if (path === "/crew/login/") body = readFileSync(require.resolve("../crew/login/index.html"), "utf8");
    else body = readFileSync(require.resolve(`../crew/${path.split("/").at(-1)}`), "utf8");
    const result = { status, body, headers };
    change(result, parsed);
    return new Response(result.body, { status: result.status, headers: result.headers });
  };
  return { requests, fetchImpl };
}

test("production verification uses only fixed public read-only URLs and verifies release bytes", async () => {
  const f = fixture();
  assert.equal((await verifyCrewProduction({ fetchImpl: f.fetchImpl, expectLocal: true, expectedOwner: "pages" })).length, 14);
  for (const { url, options } of f.requests) {
    assert.ok(["https://recarplan.com", "https://recarplan.vercel.app"].includes(new URL(url).origin));
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "manual");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers, undefined);
  }
});

test("pre-publish routing verification does not require the unpublished session version", async () => {
  const f = fixture();
  assert.equal((await verifyCrewProduction({ fetchImpl: f.fetchImpl, routingOnly: true })).length, 8);
  assert.equal(f.requests.length, 8);
});

test("production verification rejects self-redirects, cached routes and old login documents", async () => {
  for (const change of [
    (r, u) => { if (u.pathname === "/crew") r.headers.location = u.href; },
    r => { r.headers["cache-control"] = "public, max-age=600"; },
    (r, u) => { if (u.pathname.endsWith("login.html")) r.body += 'redirectAfterLogin="/crew"'; },
    (r, u) => { if (u.pathname.endsWith("index.html")) r.body = r.body.replace(/session\.js\?v=[a-f0-9]{12}/, "session.js?v=000000000000"); },
    (r, u) => { if (u.pathname.endsWith("session.js")) r.body += "\n// stale script"; },
    (r, u) => { if (u.pathname === "/crew/login/" && u.search) r.status = 404; },
  ]) await assert.rejects(verifyCrewProduction({ fetchImpl: fixture(change).fetchImpl, expectLocal: true, expectedOwner: "pages" }));
});

test("publishing checks production routes before deployment and the exact release after deployment", () => {
  const workflow = readFileSync(require.resolve("../.github/workflows/pages.yml"), "utf8");
  const before = workflow.indexOf("npm run verify:crew:production -- --routing-only");
  const deploy = workflow.indexOf("uses: actions/deploy-pages@v4");
  const after = workflow.indexOf("npm run verify:crew:production -- --expect-local");
  assert.ok(before >= 0 && before < deploy && after > deploy);
});

function workerFixture(change = () => {}) {
  const trusted = require("../tools/crew-worker-release.json");
  const bodies = Object.fromEntries(Object.keys(trusted.files).map(path => [path, `synthetic ${path}`]));
  const workerRelease = { source_sha: trusted.source_sha, files: Object.fromEntries(Object.entries(bodies)
    .map(([path, body]) => [path, createHash("sha256").update(body).digest("hex")])) };
  const legacy = fixture();
  const requested = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    const path = parsed.pathname.slice(1);
    if (!Object.hasOwn(bodies, path) && path !== "crew/release-manifest.json" && !(path === "crew/login/" && parsed.search)) {
      return legacy.fetchImpl(url, options);
    }
    requested.push(url);
    const result = { status: 200, headers: { "cache-control": "no-store", "x-recar-crew-release": workerRelease.source_sha },
      body: path === "crew/release-manifest.json" ? JSON.stringify(workerRelease)
        : bodies[path === "crew/login/" ? "crew/login/index.html" : path] };
    if (path === "crew/login/") {
      result.status = 302;
      result.headers.location = `https://recarplan.com/crew/login.html${parsed.search}`;
    }
    change(result, parsed);
    return new Response(result.body, { status: result.status, headers: result.headers });
  };
  return { workerRelease, requested, fetchImpl };
}

test("independent Crew Worker must match the pinned release and every critical file byte", async () => {
  const f = workerFixture();
  assert.equal((await verifyCrewProduction({ ...f, expectLocal: true })).length, 20);
  assert.equal(f.requested.length, 12);
  assert.ok(f.requested.every(url => new URL(url).origin === "https://recarplan.com"));
});

test("production requires Worker ownership even when the legacy Pages release is internally valid", async () => {
  await assert.rejects(verifyCrewProduction({ fetchImpl: fixture().fetchImpl, expectLocal: true }), /Worker ownership is missing/);
  await assert.rejects(verifyCrewProduction({ ...workerFixture(), expectedOwner: "pages" }), /Unexpected Crew Worker ownership/);
});

test("Worker checks reject unknown release, changed bytes, mixed assets, cached HTML and broken aliases", async () => {
  for (const change of [
    r => { r.headers["x-recar-crew-release"] = "0".repeat(40); },
    (r, u) => { if (u.pathname.endsWith("release-manifest.json")) r.body = JSON.stringify({ source_sha: "0".repeat(40), files: {} }); },
    (r, u) => { if (u.pathname.endsWith("release-manifest.json")) { const m = JSON.parse(r.body); m.files["crew/crew-auth.mjs"] = "0".repeat(64); r.body = JSON.stringify(m); } },
    (r, u) => { if (u.pathname.endsWith("crew-auth.mjs")) r.body += "stale"; },
    (r, u) => { if (u.pathname.endsWith("crew-session.mjs")) delete r.headers["x-recar-crew-release"]; },
    (r, u) => { if (u.pathname.endsWith("login.html")) r.headers["cache-control"] = "max-age=600"; },
    (r, u) => { if (u.pathname === "/crew/login/" && u.search) r.status = 404; },
    (r, u) => { if (u.pathname === "/crew/login/" && u.search) r.headers.location = u.href; },
  ]) await assert.rejects(verifyCrewProduction({ ...workerFixture(change), expectLocal: true }));
});
