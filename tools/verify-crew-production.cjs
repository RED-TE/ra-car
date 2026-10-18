const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");

const SITE = "https://recarplan.com";
const ADMIN = "https://recarplan.vercel.app";
const redirects = [
  ...["/crew", "/crew/"].map(path => [SITE + path, SITE + "/crew/welcome.html"]),
  ...["/crew/login", "/crew/login/"].map(path => [SITE + path, SITE + "/crew/login.html"]),
  [ADMIN + "/crew", SITE + "/crew/welcome.html"],
  [ADMIN + "/crew/login", SITE + "/crew/login.html"],
  [ADMIN + "/crew/login?action=apply", SITE + "/crew/login.html?action=apply"],
  [ADMIN + "/crew?ref=RC-TST123", SITE + "/app/?ref=RC-TST123"],
];

async function verifyCrewProduction({ fetchImpl = fetch, routingOnly = false, expectLocal = false } = {}) {
  const checks = [];
  async function read(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetchImpl(url, {
        method: "GET", redirect: "manual", cache: "no-store", credentials: "omit", signal: controller.signal,
      });
      const body = await response.text();
      assert.ok(body.length <= 512000, "Unexpected Crew document size");
      return { status: response.status, headers: response.headers, body };
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
