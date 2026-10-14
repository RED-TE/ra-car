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

test("preloads match the unchanged compiled app and preserve all used fonts", () => {
  const html = fs.readFileSync(path.join(root, "app/index.html"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "app/assets/FontManifest.json"), "utf8"));
  const compiled = fs.readFileSync(path.join(root, "app/main.dart.js"), "utf8");
  assert.equal(manifest.some((family) => family.family === "SUIT"), compiled.includes("SUIT"),
    "a future SUIT build must restore its manifest before publishing");
  const pretendard = manifest.find((family) => family.family === "Pretendard");
  assert.deepEqual(pretendard.fonts.map((font) => font.weight), [400, 500, 600, 700, 800]);
  for (const font of pretendard.fonts) {
    assert.ok(html.includes(`href="assets/${font.asset}" as="fetch" crossorigin`));
    assert.ok(fs.existsSync(path.join(root, "app/assets", font.asset)));
  }
  const main = bootstrap.match(/mainJsPath = '([^']+)'/)[1];
  assert.ok(html.includes(`href="${main}" as="script"`));
  assert.ok(manifest.some((family) => family.family === "MaterialIcons"));
  assert.ok(manifest.some((family) => family.family.includes("CupertinoIcons")));
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
