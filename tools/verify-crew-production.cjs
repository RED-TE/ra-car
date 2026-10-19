const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");

const SITE = "https://recarplan.com";
const ADMIN = "https://recarplan.vercel.app";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const workerRelease = require("./crew-worker-release.json");
const requiredWorkerFiles = [
  "welcome.html", "index.html", "dashboard.html", "login.html", "inquiry.html", "njob.html", "policy.html",
  "crew-auth.mjs", "crew-session.mjs", "crew-dashboard.js", "crew-model.mjs", "crew-inquiry.mjs", "crew-tools.js",
  "crew-connected.css", "crew-fonts.css", "crew-tools.css", "guide/index.html", "knowledge/index.html",
  "friends/recar-friends-terms-v1.3.pdf", "recar-friends-terms-v1.3.pdf",
].map(path => `crew/${path}`);
const redirects = [
  ...["/crew", "/crew/"].map(path => [SITE + path, SITE + "/crew/welcome.html"]),
  ...["/crew/login", "/crew/login/"].map(path => [SITE + path, SITE + "/crew/login.html"]),
  [ADMIN + "/crew", SITE + "/crew/welcome.html"],
  [ADMIN + "/crew/login", SITE + "/crew/login.html"],
  [ADMIN + "/crew/login?action=apply", SITE + "/crew/login.html?action=apply"],
  [ADMIN + "/crew?ref=RC-TST123", SITE + "/app/?ref=RC-TST123"],
];

async function verifyCrewProduction({ fetchImpl = fetch, routingOnly = false, expectLocal = false, expectedWorker = workerRelease } = {}) {
  const checks = [];
  let totalBytes = 0;
  async function read(url, maxBytes = 512000) {
    assert.ok([SITE, ADMIN].includes(new URL(url).origin), "Non-public verification origin");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetchImpl(url, {
        method: "GET", redirect: "manual", cache: "no-store", credentials: "omit", signal: controller.signal,
      });
      const chunks = [];
      let size = 0;
      // Bound streamed bytes too: Content-Length is not a trustworthy limit.
      for await (const chunk of response.body || []) {
        size += chunk.byteLength;
        totalBytes += chunk.byteLength;
        if (size > maxBytes || totalBytes > 24 * 1024 * 1024) {
          controller.abort();
          throw new Error("Unexpected Crew response size");
        }
        chunks.push(Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks);
      return { status: response.status, headers: response.headers, bytes, body: bytes.toString("utf8") };
    } finally { clearTimeout(timer); }
  }

  for (const [url, destination] of redirects) {
    const response = await read(url);
    assert.ok([302, 307].includes(response.status), `Crew entry must redirect: ${url}`);
    assert.equal(response.headers.get("location"), destination, `Wrong Crew destination: ${url}`);
    assert.match(response.headers.get("cache-control") || "", /no-store/i, `Cached Crew redirect: ${url}`);
    checks.push(`redirect ${url}`);
  }
  if (routingOnly) return checks;

  if (expectedWorker) {
    // Crew is deployed independently of Pages. Pin the approved public manifest,
    // not this repository's legacy session.js. Missing headers cannot downgrade
    // this check to the old Pages deployment contract.
    assert.match(expectedWorker.source_sha, /^[a-f0-9]{40}$/);
    assert.match(expectedWorker.legacy_sha, /^[a-f0-9]{40}$/);
    assert.match(expectedWorker.manifest_sha256, /^[a-f0-9]{64}$/);
    const fresh = (response, path) => {
      assert.equal(response.status, 200, `Missing Worker asset: ${path}`);
      assert.equal(response.headers.get("x-recar-crew-release"), expectedWorker.source_sha, `Mixed Worker release: ${path}`);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", `Missing MIME protection: ${path}`);
      if (/\.(html|m?js|css|json)$/.test(path)) {
        assert.match(response.headers.get("cache-control") || "", /no-store/i, `Cached Worker asset: ${path}`);
      }
    };
    const published = await read(`${SITE}/crew/release-manifest.json`);
    fresh(published, "release-manifest.json");
    assert.match(published.headers.get("content-type") || "", /application\/json/i, "Wrong manifest MIME");
    assert.equal(hash(published.bytes), expectedWorker.manifest_sha256, "Unapproved Worker manifest bytes");
    const manifest = JSON.parse(published.body);
    assert.equal(manifest.source_sha, expectedWorker.source_sha, "Wrong Worker source SHA");
    assert.equal(manifest.legacy_sha, expectedWorker.legacy_sha, "Wrong preserved guide source SHA");
    assert.ok(manifest.files && !Array.isArray(manifest.files), "Missing Worker files");
    const entries = Object.entries(manifest.files);
    assert.ok(entries.length >= requiredWorkerFiles.length && entries.length <= 100, "Unexpected Worker file count");
    for (const path of requiredWorkerFiles) assert.ok(Object.hasOwn(manifest.files, path), `Missing required Worker file: ${path}`);
    // Never turn a manifest entry into a general URL fetch, traversal or query.
    for (const [path, digest] of entries) {
      assert.match(path, /^crew\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.(?:html|mjs|js|css|json|png|jpg|jpeg|svg|otf|woff2?|pdf|txt)$/,
        `Unsafe Worker asset path: ${path}`);
      assert.match(digest, /^[a-f0-9]{64}$/, `Invalid Worker asset hash: ${path}`);
      assert.notEqual(path, "crew/release-manifest.json", "Recursive Worker manifest");
    }
    checks.push(`Worker manifest ${manifest.source_sha}`);
    const screens = new Map([
      ["crew/login.html", ['id="crewLoginForm"', 'id="crewApplyForm"', "crew-auth.mjs"]],
      ["crew/index.html", ['data-table="recent"', "crew-dashboard.js"]],
      ["crew/dashboard.html", ['data-table="recent"', "crew-dashboard.js"]],
      ["crew/welcome.html", ['id="heroCta"', "crew-session.mjs"]],
    ]);
    let cursor = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cursor < entries.length) {
        const [path, digest] = entries[cursor++];
        // The preserved N-job file is intentionally shadowed by a redirect.
        if (path === "crew/njob/index.html") continue;
        const response = await read(`${SITE}/${path}`, 4 * 1024 * 1024);
        fresh(response, path);
        assert.equal(hash(response.bytes), digest, `Worker asset bytes mismatch: ${path}`);
        const mime = response.headers.get("content-type") || "";
        if (/\.m?js$/.test(path)) assert.match(mime, /(?:java|ecma)script/i, `Wrong script MIME: ${path}`);
        if (/\.css$/.test(path)) assert.match(mime, /text\/css/i, `Wrong CSS MIME: ${path}`);
        if (/\.html$/.test(path)) assert.match(mime, /text\/html/i, `Wrong HTML MIME: ${path}`);
        for (const marker of screens.get(path) || []) assert.ok(response.body.includes(marker), `Wrong Worker screen: ${path}`);
        if (screens.has(path)) assert.doesNotMatch(response.body, /redirectAfterLogin|authMode/, `Old login-only document: ${path}`);
        checks.push(`Worker asset ${path}`);
      }
    }));
    for (const [path, target] of [
      ["/crew/?action=apply", "/crew/login.html?action=apply"],
      ["/crew/?mode=apply", "/crew/login.html?action=apply"],
      ["/crew/?ref=RC-TST123", "/app/?ref=RC-TST123"],
      ["/crew/login/?action=apply", "/crew/login.html?action=apply"],
      ["/crew/login/?status=EXPIRED", "/crew/login.html?status=EXPIRED"],
      ["/crew/guide", "/crew/guide/"], ["/crew/knowledge", "/crew/knowledge/"],
      ...["/crew/njob", "/crew/njob/", "/crew/njob/index.html"].map(path => [path, "/crew/njob.html"]),
    ]) {
      const response = await read(SITE + path);
      assert.ok([302, 307].includes(response.status), `Missing Worker alias: ${path}`);
      assert.equal(response.headers.get("location"), SITE + target, `Wrong Worker alias: ${path}`);
      assert.match(response.headers.get("cache-control") || "", /no-store/i, `Cached Worker alias: ${path}`);
      checks.push(`Worker alias ${path}`);
    }
    return checks;
  }

  const expectedVersion = expectLocal ? createHash("sha256")
    .update(readFileSync(require.resolve("../crew/session.js"))).digest("hex").slice(0, 12) : null;
  let version;
  for (const [path, marker] of [["login.html", 'id="crewLoginForm"'], ["index.html", 'id="crewShareLink"'], ["welcome.html", 'id="welcomeTitle"']]) {
    const response = await read(`${SITE}/crew/${path}`);
    assert.equal(response.status, 200, `Missing Crew screen: ${path}`);
    assert.ok(response.body.includes(marker), `Wrong Crew screen: ${path}`);
    assert.doesNotMatch(response.body, /redirectAfterLogin|authMode/, `Old login-only document: ${path}`);
    const match = response.body.match(/src="\.\/session\.js\?v=([a-f0-9]{12})"/);
    assert.ok(match, `Unversioned Crew session script: ${path}`);
    version ||= match[1];
    assert.equal(match[1], version, `Mixed Crew release: ${path}`);
    if (expectedVersion) assert.equal(match[1], expectedVersion, `Old Crew HTML after deployment: ${path}`);
    checks.push(`screen ${path}`);
  }
  const session = await read(`${SITE}/crew/session.js?v=${version}`);
  assert.equal(session.status, 200, "Missing Crew session script");
  assert.equal(createHash("sha256").update(session.body).digest("hex").slice(0, 12), version, "Crew script bytes do not match the published version");
  checks.push("session script content hash");

  // Query strings bypass exact Worker bindings; test the static-origin fallback too.
  for (const path of ["/crew/login/?action=apply", "/crew/login/?status=EXPIRED"]) {
    const response = await read(SITE + path);
    assert.equal(response.status, 200, `Missing slash/query fallback: ${path}`);
    assert.match(response.body, /data-crew-login-alias/, `Wrong slash/query fallback: ${path}`);
    checks.push(`static fallback ${path}`);
  }
  return checks;
}

module.exports = { verifyCrewProduction };

if (require.main === module) {
  (async () => {
    const allowed = new Set(["--routing-only", "--expect-local"]);
    assert.ok(process.argv.slice(2).every(arg => allowed.has(arg)), "Unsupported verification option");
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const checks = await verifyCrewProduction({ routingOnly: process.argv.includes("--routing-only"), expectLocal: process.argv.includes("--expect-local") });
        console.log(`Crew production verification: ${checks.length}/${checks.length} passed (read-only, no account credentials).`);
        return;
      } catch (error) {
        if (attempt === 3) throw error;
        console.log(`Crew production verification attempt ${attempt} failed; retrying after cache propagation.`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
