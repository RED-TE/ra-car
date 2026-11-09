const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const metadataKeys = ["build_id", "source_commit", "web_source_patch_sha256", "base_path", "sha256", "vehicle_images"];

function htmlEntry(html, relative, buildId) {
  const fail = part => { throw new Error(`HTML entry mismatch: ${relative} (${part})`); };
  if (typeof html !== "string") fail("missing local HTML");
  const elements = [];
  // Consume comments and inert/raw-text elements as units: text that merely
  // mentions a required script must not count as an executable entry point.
  const tags = /<!--[\s\S]*?-->|<(script|style|template|noscript|textarea|title)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<(base|link)\b([^>]*)>/gi;
  for (const match of html.matchAll(tags)) {
    const tag = (match[1] || match[4] || "").toLowerCase();
    if (!["base", "link", "script"].includes(tag)) continue;
    const attrs = Object.create(null);
    for (const attr of (match[2] || match[5] || "").matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      const name = attr[1].toLowerCase();
      if (Object.hasOwn(attrs, name)) fail("duplicate attribute");
      attrs[name] = attr[2] ?? attr[3] ?? attr[4] ?? "";
    }
    elements.push({ tag, attrs, body: match[3] || "", index: match.index });
  }
  const named = (value, name) => (value || "").split(/[?#]/)[0].split("/").at(-1) === name;
  const executable = item => !Object.hasOwn(item.attrs, "nomodule") &&
    ["", "text/javascript", "application/javascript"].includes((item.attrs.type || "").toLowerCase());
  const bases = elements.filter(item => item.tag === "base");
  if (bases.length !== 1 || bases[0].attrs.href !== "/app/") fail("base");
  const bootstrap = elements.filter(item => item.tag === "script" && named(item.attrs.src, "flutter_bootstrap.js"));
  if (bootstrap.length !== 1 || !executable(bootstrap[0]) ||
      bootstrap[0].attrs.src !== `flutter_bootstrap.js?build=${buildId}`) fail("bootstrap");
  const preload = elements.filter(item => item.tag === "link" &&
    (item.attrs.rel || "").toLowerCase().split(/\s+/).includes("preload") && named(item.attrs.href, "main.dart.js"));
  if (preload.length !== 1 || preload[0].attrs.as !== "script" ||
      preload[0].attrs.href !== `main.dart.js?build=${buildId}`) fail("main preload");
  const migration = elements.filter(item => item.tag === "script" && Object.hasOwn(item.attrs, "data-recar-entry-migration"));
  if (migration.length !== (relative === "/" ? 1 : 0)) fail("migration");
  if (migration.length && (Object.hasOwn(migration[0].attrs, "src") || !executable(migration[0]) ||
      !migration[0].body.trim() || migration[0].index > bootstrap[0].index)) fail("migration");
  return {
    bootstrapAsync: Object.hasOwn(bootstrap[0].attrs, "async"),
    migrationSha256: migration.length ? digest(migration[0].body.replace(/\r\n/g, "\n").trim()) : null,
  };
}

async function verify({ expected, rootHtml, appHtml, origin = "https://recarplan.com" }) {
  assert.equal(expected.base_path, "/app/", "unexpected app base path");
  const htmlSources = { "/": rootHtml, "/app/": appHtml };
  const htmlContracts = Object.fromEntries(Object.entries(htmlSources)
    .map(([relative, html]) => [relative, htmlEntry(html, relative, expected.build_id)]));
  if (digest(appHtml) !== expected.sha256["index.html"]) throw new Error("local app HTML hash mismatch");
  const targets = [
    // Static hosts may redirect index.html to the canonical directory entry.
    ...Object.entries(expected.sha256).map(([name, sha256]) => ({ path: name === "index.html" ? "/app/" : `/app/${name}`, sha256 })),
    ...expected.vehicle_images.map(image => ({ path: `/app/assets/${image.asset}`, sha256: image.sha256 })),
    { path: "/", sha256: digest(rootHtml) },
  ];
  for (const target of targets) {
    assert.match(target.sha256, /^[a-f0-9]{64}$/);
    assert.ok(target.path === "/" || target.path === "/app/" || /^\/app\/[A-Za-z0-9_./-]+$/.test(target.path));
    assert.ok(!target.path.split("/").includes(".."), "unsafe artifact path");
  }
  const checked = [];
  async function read(relative) {
    const response = await fetch(new URL(relative, origin), {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(20000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (response.status !== 200) throw new Error(`HTTP ${response.status}: ${relative}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    checked.push({ path: relative, status: response.status, sha256: digest(bytes) });
    return bytes;
  }
  const releaseBytes = await read("/app/release.json");
  let actual;
  try { actual = JSON.parse(releaseBytes); }
  catch { throw new Error("invalid release JSON"); }
  for (const key of metadataKeys) {
    try { assert.deepEqual(actual[key], expected[key]); }
    catch { throw new Error(`release metadata mismatch: ${key}`); }
  }
  for (const target of targets) {
    const bytes = await read(target.path);
    if (Object.hasOwn(htmlContracts, target.path)) {
      const actualEntry = htmlEntry(bytes.toString("utf8"), target.path, expected.build_id);
      if (actualEntry.migrationSha256 !== htmlContracts[target.path].migrationSha256) {
        throw new Error(`HTML entry mismatch: ${target.path} (migration contents)`);
      }
      if (actualEntry.bootstrapAsync !== htmlContracts[target.path].bootstrapAsync) {
        throw new Error(`HTML entry mismatch: ${target.path} (bootstrap async)`);
      }
    } else if (digest(bytes) !== target.sha256) throw new Error(`hash mismatch: ${target.path}`);
  }
  return { build_id: expected.build_id, checked };
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  verify({
    expected: JSON.parse(fs.readFileSync(path.join(root, "app/release.json"), "utf8")),
    rootHtml: fs.readFileSync(path.join(root, "index.html"), "utf8"),
    appHtml: fs.readFileSync(path.join(root, "app/index.html"), "utf8"),
  }).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    // Only our path/HTTP/hash diagnostics are emitted, never remote response bodies.
    console.error(`Published app verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { verify };
