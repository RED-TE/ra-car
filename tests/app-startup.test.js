const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { optimizeAppFonts } = require("../tools/optimize-app-fonts.cjs");

const root = path.resolve(__dirname, "..");
const bootstrap = fs.readFileSync(path.join(root, "app/flutter_bootstrap.js"), "utf8");
const startup = bootstrap.slice(bootstrap.indexOf("async function startRecar()"));

async function runStartup({ controller = null, registration = null, url = "https://recarplan.com/app/?ref=RC-TEST", fail = false, pending = false } = {}) {
  const loads = [];
  const redirects = [];
  const scopes = [];
  let unregisters = 0;
  const navigator = { serviceWorker: {
    controller,
    getRegistration: async (scope) => {
      scopes.push(scope);
      if (fail) throw new Error("storage unavailable");
      if (pending) return new Promise(() => {});
      return registration && { ...registration, unregister: async () => { unregisters += 1; return true; } };
    },
  } };
  const context = {
    URL, navigator, document: { baseURI: "https://recarplan.com/app/" },
    window: { location: { href: url, replace: (target) => redirects.push(target) },
      caches: { keys: () => assert.fail("must not enumerate or delete origin caches") } },
    _flutter: { buildConfig: { builds: [{}] }, loader: { load: async () => loads.push("loaded") } },
    setTimeout: (fn) => setTimeout(fn, 5), clearTimeout,
  };
  await vm.runInNewContext(startup, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { loads, redirects, scopes, unregisters };
}

const legacy = { scriptURL: "https://recarplan.com/app/flutter_service_worker.js" };
const legacyRegistration = { scope: "https://recarplan.com/app/", active: legacy };

test("normal startup does not wait for storage or delete any caches", async () => {
  const result = await runStartup({ pending: true });
  assert.deepEqual(result.loads, ["loaded"]);
  assert.deepEqual(result.redirects, []);
});

test("legacy /app worker migration preserves referral and reloads only once", async () => {
  const result = await runStartup({ controller: legacy, registration: legacyRegistration });
  assert.equal(result.unregisters, 1);
  assert.deepEqual(result.loads, []);
  const redirect = new URL(result.redirects[0]);
  assert.equal(redirect.searchParams.get("ref"), "RC-TEST");
  assert.equal(redirect.searchParams.get("recar-sw-reset"), "1");
  const reset = await runStartup({ controller: legacy, registration: legacyRegistration, url: redirect.href });
  assert.deepEqual(reset.redirects, []);
  assert.deepEqual(reset.loads, ["loaded"]);
});

test("unrelated workers and broader registration scopes are preserved", async () => {
  for (const registration of [
    { scope: "https://recarplan.com/", active: legacy },
    { scope: legacyRegistration.scope, active: { scriptURL: "https://recarplan.com/app/another-worker.js" } },
  ]) {
    const result = await runStartup({ registration });
    assert.equal(result.unregisters, 0);
    assert.deepEqual(result.loads, ["loaded"]);
  }
});

test("blocked or failing worker storage cannot keep startup spinning", async () => {
  for (const options of [{ pending: true }, { fail: true }]) {
    const result = await runStartup({ ...options, controller: legacy });
    assert.deepEqual(result.loads, ["loaded"]);
    assert.deepEqual(result.redirects, []);
  }
});

test("preloads match the web-only build and retain the full variable font", () => {
  const html = fs.readFileSync(path.join(root, "app/index.html"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "app/assets/FontManifest.json"), "utf8"));
  const compiled = fs.readFileSync(path.join(root, "app/main.dart.js"), "utf8");
  assert.equal(manifest.some((family) => family.family === "SUIT"), compiled.includes("SUIT"),
    "a future SUIT build must restore its manifest before publishing");
  const pretendard = manifest.find((family) => family.family === "Pretendard");
  assert.equal(pretendard.fonts.length, 1);
  assert.ok(pretendard.fonts[0].asset.endsWith("PretendardVariable.ttf"));
  const entry = "서류 제출까지 직접 신청하기".replace(/[^\x00-\x7f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  assert.ok(compiled.includes(entry));
  for (const font of pretendard.fonts) {
    assert.ok(html.includes(`href="assets/${font.asset}" as="fetch" crossorigin`));
    assert.ok(fs.existsSync(path.join(root, "app/assets", font.asset)));
  }
  const main = bootstrap.match(/mainJsPath = '([^']+)'/)[1];
  assert.ok(html.includes(`href="${main}" as="script"`));
  assert.ok(manifest.some((family) => family.family === "MaterialIcons"));
  assert.ok(manifest.some((family) => family.family.includes("CupertinoIcons")));
});

test("web source and native app stay separately pinned", () => {
  const config = require("../web_app/source.json");
  const release = require("../app/release.json");
  const crypto = require("node:crypto");
  assert.equal(release.source_commit, config.commit);
  assert.equal(release.build_id, config.buildId);
  assert.equal(release.native_app_modified, false);
  const patch = fs.readFileSync(path.join(root, "web_app/patches/runtime.patch"));
  assert.equal(release.web_source_patch_sha256, crypto.createHash("sha256").update(patch).digest("hex"));
  assert.ok(fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8").includes("--exclude='./web_app'"));
});

test("garage artwork is pinned byte-for-byte and test fixtures stay private", () => {
  const config = require("../web_app/source.json");
  const release = require("../app/release.json");
  const crypto = require("node:crypto");
  const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  assert.equal(config.garageArtwork.sourceCommit, "310035ece9cbbda530928341b124b8aed63e2a41");
  assert.equal(config.garageArtwork.sha256, "03efda0dc086e522ba96a04379172defef1807fe4435c797b0bf4f5fb1657247");
  assert.equal(hash(path.join(root, "web_app/assets", config.garageArtwork.file)), config.garageArtwork.sha256);
  assert.equal(hash(path.join(root, "app/assets", config.garageArtwork.target)), config.garageArtwork.sha256);
  assert.equal(release.garage_artwork_sha256, config.garageArtwork.sha256);
  const encodedManifest = JSON.parse(fs.readFileSync(path.join(root, "app/assets/AssetManifest.bin.json"), "utf8"));
  const assetKeys = Buffer.from(encodedManifest, "base64").toString("utf8");
  assert.equal(assetKeys.includes("test/fixtures"), false);
  assert.equal(assetKeys.includes("test-fixture-defines"), false);
  assert.equal(fs.existsSync(path.join(root, "app/test-fixture-defines.json")), false);
  assert.equal(fs.readFileSync(path.join(root, "app/main.dart.js"), "utf8").includes("EXACT_LOOKUP_FIXTURE_BASE64"), false);
});

test("font optimization is repeatable and preserves any newly used family", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "recar-font-test-"));
  try {
    const assets = path.join(directory, "app/assets");
    fs.mkdirSync(assets, { recursive: true });
    fs.writeFileSync(path.join(assets, "old.otf"), "original glyphs");
    const manifest = [{ family: "SUIT", fonts: [{ asset: "old.otf" }] }, { family: "Pretendard", fonts: [] }];
    const manifestPath = path.join(assets, "FontManifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    fs.writeFileSync(path.join(directory, "app/main.dart.js"), "Pretendard");
    assert.deepEqual(optimizeAppFonts(directory).removedFamilies, ["SUIT"]);
    assert.equal(optimizeAppFonts(directory).removedBytes, 0);
    assert.equal(fs.readFileSync(path.join(assets, "old.otf"), "utf8"), "original glyphs");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    fs.writeFileSync(path.join(directory, "app/main.dart.js"), "Pretendard SUIT");
    assert.deepEqual(optimizeAppFonts(directory).removedFamilies, []);
    assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath)), manifest);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
