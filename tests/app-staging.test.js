const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const repository = path.resolve(__dirname, "..");
const migrationWorker = fs.readFileSync(path.join(repository, "web_app/flutter_service_worker.js"), "utf8");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");

function write(root, relative, value) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function snapshot(root) {
  const result = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else result[path.relative(root, filename)] = digest(fs.readFileSync(filename));
    }
  }
  visit(root);
  return result;
}

function fixture(t, { template = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "recar-app-stage-synthetic-"));
  // This is the only directory removed by these tests; no existing artifacts
  // or the real published app are passed to the staging function.
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, "project");
  const prepared = path.join(directory, "prepared/app");
  const font = Buffer.from("synthetic-variable-font");
  const patch = "synthetic-runtime-patch\n";
  const config = {
    repository: "synthetic/recar", commit: "a".repeat(40),
    buildId: "synthetic-build", basePath: "/app/", font: { sha256: digest(font) },
  };
  for (const name of ["stage-app-web.cjs", "sync-app-entrypoints.cjs"]) {
    write(root, `tools/${name}`, fs.readFileSync(path.join(repository, "tools", name)));
  }
  write(root, "web_app/source.json", JSON.stringify(config));
  write(root, "web_app/patches/runtime.patch", patch);
  write(root, "web_app/assets/fonts/LICENSE.txt", "synthetic-license\n");
  if (template) write(root, "web_app/flutter_service_worker.js", migrationWorker);
  write(root, "lib/app-entry-referral.js", "/* synthetic referral migration */\n");
  write(root, "app/flutter_service_worker.js", "/* previous generated worker */\n");
  write(root, "app/assets/existing-image.txt", "existing asset, keep unchanged");
  write(root, "app/previous-build.backup", "existing backup, keep unchanged");
  write(root, "data/quotes.json", '{"syntheticSavedQuote":123456}');
  write(root, "data/customers.json", '{"syntheticCustomer":"retain"}');
  write(root, "index.html", "old root entry\n");
  write(directory, "prepared/source-pin.json", JSON.stringify({ ...config, patchSha256: digest(patch) }));
  write(prepared, "build/web/index.html", '<html>\n<base href="/app/">\n  <script src="flutter_bootstrap.js?build=__RECAR_BUILD_ID__" async></script>\n</html>\n');
  write(prepared, "build/web/flutter_bootstrap.js", "/* __RECAR_BUILD_ID__ */\n");
  write(prepared, "build/web/flutter_service_worker.js", "");
  const marker = "서류 제출까지 직접 신청하기".replace(/[^\x00-\x7f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  write(prepared, "build/web/main.dart.js", `/* ${marker} */\n`);
  write(prepared, "build/web/assets/FontManifest.json", JSON.stringify([
    { family: "Pretendard", fonts: [{ asset: "assets/fonts/pretendard/PretendardVariable.ttf" }] },
  ]));
  write(prepared, "build/web/assets/assets/fonts/pretendard/PretendardVariable.ttf", font);
  write(prepared, "build/web/assets/AssetManifest.bin.json", "{}");
  write(prepared, "build/web/assets/NOTICES", "synthetic notice  \n");
  return { directory, root, prepared, stage: require(path.join(root, "tools/stage-app-web.cjs")).stage };
}

test("staging an empty generated worker retains the migration worker and its release digest", t => {
  const { directory, root, prepared, stage } = fixture(t);
  const unchanged = [
    "app/assets/existing-image.txt", "app/previous-build.backup",
    "data/quotes.json", "data/customers.json", "web_app/source.json",
    "web_app/patches/runtime.patch", "web_app/flutter_service_worker.js",
  ].map(relative => [relative, fs.readFileSync(path.join(root, relative))]);
  const sourceBefore = snapshot(path.join(directory, "prepared"));
  const metadata = stage(prepared);
  assert.equal(fs.readFileSync(path.join(root, "app/flutter_service_worker.js"), "utf8"), migrationWorker);
  assert.equal(metadata.sha256["flutter_service_worker.js"], digest(migrationWorker));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "app/release.json"), "utf8")), metadata);
  for (const [relative, contents] of unchanged) {
    assert.deepEqual(fs.readFileSync(path.join(root, relative)), contents, relative);
  }
  assert.deepEqual(snapshot(path.join(directory, "prepared")), sourceBefore);
  assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /data-recar-entry-migration/);
  assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /synthetic-build/);
  assert.deepEqual(stage(prepared), metadata, "staging the same build is repeatable");
});

test("a missing migration template fails before changing any project or prepared file", t => {
  const { directory, prepared, stage } = fixture(t, { template: false });
  const before = snapshot(directory);
  let error;
  try { stage(prepared); } catch (caught) { error = caught; }
  assert.deepEqual(snapshot(directory), before, "missing template must not partially stage the app");
  assert.ok(error instanceof Error, "missing template must stop staging");
  assert.match(error.message, /flutter_service_worker|migration|template/i);
});

async function runMigration({ unregisterFails = false, clientsFail = false } = {}) {
  const listeners = new Map();
  const events = [];
  const navigations = [];
  const forbidden = () => assert.fail("migration must not access caches, customer storage or the network");
  const context = {
    self: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      skipWaiting: () => { events.push("skipWaiting"); return Promise.resolve(); },
      registration: { unregister: async () => {
        events.push("unregister");
        if (unregisterFails) throw new Error("synthetic unregister failure");
        return true;
      } },
      clients: { matchAll: async options => {
        events.push("matchAll");
        assert.equal(options.type, "window");
        assert.equal(options.includeUncontrolled, undefined, "only this worker's controlled clients");
        if (clientsFail) throw new Error("synthetic client failure");
        return [
          { url: "https://synthetic.invalid/app/?ref=RC-TEST&step=quote", navigate: url => navigations.push(url) },
          { url: "https://synthetic.invalid/app/second", navigate: url => navigations.push(url) },
          { url: "", navigate: forbidden },
          { url: "https://synthetic.invalid/app/no-navigation" },
        ];
      } },
      fetch: forbidden,
    },
    console: { warn: () => events.push("warn") },
    fetch: forbidden,
  };
  for (const target of [context, context.self]) {
    for (const key of ["caches", "indexedDB", "localStorage", "sessionStorage"]) {
      Object.defineProperty(target, key, { get: forbidden });
    }
  }
  vm.runInNewContext(migrationWorker, context, { timeout: 1000 });
  assert.deepEqual([...listeners.keys()].sort(), ["activate", "install"], "the migration must not install a fetch/cache handler");
  listeners.get("install")();
  let activation;
  listeners.get("activate")({ waitUntil: promise => { activation = promise; } });
  assert.ok(activation && typeof activation.then === "function");
  await activation;
  return { events, navigations };
}

test("migration immediately replaces the old worker, unregisters, and preserves controlled-client URLs", async () => {
  const result = await runMigration();
  assert.deepEqual(result.events, ["skipWaiting", "unregister", "matchAll"]);
  assert.deepEqual(result.navigations, [
    "https://synthetic.invalid/app/?ref=RC-TEST&step=quote",
    "https://synthetic.invalid/app/second",
  ]);
});

test("migration still reloads controlled clients if unregister fails", async () => {
  const result = await runMigration({ unregisterFails: true });
  assert.deepEqual(result.events, ["skipWaiting", "unregister", "warn", "matchAll"]);
  assert.equal(result.navigations.length, 2);
});

test("migration contains client-list failure without deleting caches or customer storage", async () => {
  const result = await runMigration({ clientsFail: true });
  assert.deepEqual(result.events, ["skipWaiting", "unregister", "matchAll", "warn"]);
  assert.deepEqual(result.navigations, []);
});
