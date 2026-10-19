const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
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
  assert.equal((await verifyCrewProduction({ fetchImpl: f.fetchImpl, expectLocal: true, expectedWorker: null })).length, 14);
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
  ]) await assert.rejects(verifyCrewProduction({ fetchImpl: fixture(change).fetchImpl, expectLocal: true, expectedWorker: null }));
});

test("publishing checks production routes before deployment and the exact release after deployment", () => {
  const workflow = readFileSync(require.resolve("../.github/workflows/pages.yml"), "utf8");
  const before = workflow.indexOf("npm run verify:crew:production -- --routing-only");
  const deploy = workflow.indexOf("uses: actions/deploy-pages@v4");
  const after = workflow.indexOf("npm run verify:crew:production -- --expect-local");
  assert.ok(before >= 0 && before < deploy && after > deploy);
});

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
function workerFixture(change = () => {}, changeManifest = () => {}) {
  const files = new Map([
    ["login.html", 'id="crewLoginForm" id="crewApplyForm" crew-auth.mjs'],
    ["index.html", 'data-table="recent" crew-dashboard.js'],
    ["dashboard.html", 'data-table="recent" crew-dashboard.js'],
    ["welcome.html", 'id="heroCta" crew-session.mjs'],
    ...["inquiry.html", "njob.html", "policy.html", "crew-auth.mjs", "crew-session.mjs", "crew-dashboard.js", "crew-model.mjs", "crew-inquiry.mjs", "crew-tools.js", "crew-connected.css", "crew-fonts.css", "crew-tools.css", "guide/index.html", "knowledge/index.html", "friends/recar-friends-terms-v1.3.pdf", "recar-friends-terms-v1.3.pdf", "njob/index.html"].map(path => [path, `fixture ${path}`]),
    ["assets/fonts/font.otf", Buffer.from([0, 255, 128, 42])],
  ].map(([path, bytes]) => [`crew/${path}`, Buffer.from(bytes)]));
  const expectedWorker = { source_sha: "1".repeat(40), legacy_sha: "2".repeat(40) };
  const manifest = { ...expectedWorker, files: Object.fromEntries([...files].map(([path, bytes]) => [path, sha256(bytes)])) };
  changeManifest(manifest);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  expectedWorker.manifest_sha256 = sha256(manifestBytes);
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const parsed = new URL(url);
    const path = parsed.pathname;
    const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff", "x-recar-crew-release": expectedWorker.source_sha };
    let status = 200;
    let body = files.get(path.slice(1)) || Buffer.from("");
    if (["/crew", "/crew/", "/crew/login", "/crew/login/", "/crew/guide", "/crew/knowledge", "/crew/njob", "/crew/njob/", "/crew/njob/index.html"].includes(path)) {
      status = 302;
      headers.location = "https://recarplan.com/crew/" + (path.includes("login") ? "login.html" : "welcome.html");
      if (parsed.searchParams.get("action") === "apply" || parsed.searchParams.get("mode") === "apply") headers.location = "https://recarplan.com/crew/login.html?action=apply";
      else if (parsed.searchParams.has("ref")) headers.location = "https://recarplan.com/app/?ref=RC-TST123";
      else if (parsed.searchParams.has("status")) headers.location += "?status=EXPIRED";
      if (["/crew/guide", "/crew/knowledge"].includes(path)) headers.location = "https://recarplan.com" + path + "/";
      if (path.startsWith("/crew/njob")) headers.location = "https://recarplan.com/crew/njob.html";
    } else if (path.endsWith("release-manifest.json")) {
      body = manifestBytes;
      headers["content-type"] = "application/json";
    } else {
      headers["content-type"] = /\.m?js$/.test(path) ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".html") ? "text/html" : "application/octet-stream";
    }
    const result = { status, body, headers };
    change(result, parsed);
    return new Response(result.body, { status: result.status, headers: result.headers });
  };
  return { requests, fetchImpl, expectedWorker, files };
}

test("Worker release verifies the pinned manifest, binary hashes, screens and canonical aliases independently of local Pages bytes", async () => {
  const f = workerFixture();
  const checks = await verifyCrewProduction({ fetchImpl: f.fetchImpl, expectedWorker: f.expectedWorker, expectLocal: true });
  assert.equal(checks.length, 8 + 1 + f.files.size - 1 + 10);
  for (const { url, options } of f.requests) {
    assert.ok(["https://recarplan.com", "https://recarplan.vercel.app"].includes(new URL(url).origin));
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "manual");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers, undefined);
  }
});

test("Worker release cannot downgrade to legacy or accept missing/mixed release headers, changed assets, MIME or caches", async () => {
  for (const change of [
    (r, u) => { if (u.pathname.endsWith("release-manifest.json")) delete r.headers["x-recar-crew-release"]; },
    (r, u) => { if (u.pathname.endsWith("dashboard.html")) r.headers["x-recar-crew-release"] = "3".repeat(40); },
    (r, u) => { if (u.pathname.endsWith("crew-session.mjs")) r.body += "tampered"; },
    (r, u) => { if (u.pathname.endsWith("crew-session.mjs")) r.headers["content-type"] = "text/html"; },
    (r, u) => { if (u.pathname.endsWith("welcome.html")) r.headers["cache-control"] = "public,max-age=3600"; },
    (r, u) => { if (u.pathname.endsWith("release-manifest.json")) r.body += " "; },
    (r, u) => { if (u.pathname === "/crew/login/" && u.search) { r.status = 200; r.body = "data-crew-login-alias"; } },
    (r, u) => { if (u.pathname === "/crew/njob/index.html") r.headers.location = "https://elsewhere.example/"; },
  ]) {
    const f = workerFixture(change);
    await assert.rejects(verifyCrewProduction({ fetchImpl: f.fetchImpl, expectedWorker: f.expectedWorker }));
  }
});

test("Worker manifest validation rejects unsafe paths, missing critical files, invalid hashes and excessive counts before asset fetches", async () => {
  for (const change of [
    m => { m.files["crew/../app/index.html"] = "a".repeat(64); },
    m => { m.files["https://evil.example/x.js"] = "a".repeat(64); },
    m => { m.files["crew/%2e%2e/app.html"] = "a".repeat(64); },
    m => { m.files["crew/extra.js?x=y"] = "a".repeat(64); },
    m => { delete m.files["crew/crew-model.mjs"]; },
    m => { m.files["crew/crew-model.mjs"] = "not-a-hash"; },
    m => { m.source_sha = "3".repeat(40); },
    m => { for (let i = 0; i < 101; i++) m.files[`crew/file-${i}.js`] = "a".repeat(64); },
  ]) {
    const f = workerFixture(undefined, change);
    await assert.rejects(verifyCrewProduction({ fetchImpl: f.fetchImpl, expectedWorker: f.expectedWorker }));
    assert.equal(f.requests.length, 9, "Invalid manifest must not drive additional fetches");
  }
});

test("Worker reads stop at bounded response size without trusting Content-Length", async () => {
  const f = workerFixture((r, u) => {
    if (u.pathname.endsWith("release-manifest.json")) { r.body = "x".repeat(512001); r.headers["content-length"] = "1"; }
  });
  await assert.rejects(verifyCrewProduction({ fetchImpl: f.fetchImpl, expectedWorker: f.expectedWorker }), /response size/);
});

test("CI checks the production Worker read-only without deployment or credentials", () => {
  const workflow = readFileSync(require.resolve("../.github/workflows/crew-checks.yml"), "utf8");
  assert.match(workflow, /npm run verify:crew:production -- --expect-local/);
  assert.doesNotMatch(workflow, /deploy-pages|wrangler deploy|secrets\./);
});
