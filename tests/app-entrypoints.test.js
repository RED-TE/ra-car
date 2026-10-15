const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { appEntryHtml, syncAppEntrypoints, entrypoints } = require("../tools/sync-app-entrypoints.cjs");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "lib/app-entry-referral.js"), "utf8");

function migrate(href, entries = {}, blocked = false) {
  let result = href;
  const window = {
    location: { href },
    localStorage: { getItem: key => {
      if (blocked) throw new Error("storage disabled");
      return entries[key] ?? null;
    } },
    history: { state: { preserved: true }, replaceState: (state, _title, url) => {
      assert.deepEqual(state, { preserved: true });
      result = url;
    } },
  };
  vm.runInNewContext(migration, { window, URL });
  return new URL(result);
}

test("main and inquiry use one current app shell without a redirect or old website scripts", () => {
  assert.deepEqual(syncAppEntrypoints(root, { check: true }), entrypoints);
  for (const entry of entrypoints) {
    const html = fs.readFileSync(path.join(root, entry), "utf8");
    assert.equal(html, appEntryHtml(root));
    assert.match(html, /<html lang="ko">/);
    assert.match(html, /<base href="\/app\/">/);
    assert.doesNotMatch(html, /http-equiv="refresh"|location\.(?:replace|assign)|home\.js|\.\/script\.js|quote-form/);
    const main = html.match(/href="(main\.dart\.js[^\"]*)" as="script"/)[1];
    for (const url of ["https://recarplan.com/", "https://recarplan.com/inquiry/"]) {
      const base = new URL("/app/", url);
      assert.equal(new URL(main, base).pathname, "/app/main.dart.js");
      assert.equal(new URL("assets/FontManifest.json", base).pathname, "/app/assets/FontManifest.json");
    }
  }
});

test("legacy attribution migrates without deleting browser storage, campaign or app routes", () => {
  const entries = { recar_referral_code: "rc-ab1234" };
  const before = { ...entries };
  const url = migrate("https://recarplan.com/inquiry/?utm_source=naver#/saved", entries);
  assert.equal(url.searchParams.get("ref"), "RC-AB1234");
  assert.equal(url.searchParams.get("utm_source"), "naver");
  assert.equal(url.hash, "#/saved");
  assert.deepEqual(entries, before);
});

test("explicit or existing app attribution is never overwritten", () => {
  const entries = { recar_referral_code: "RC-OLD123", "flutter.recar_referral_code": '"RC-APP123"' };
  assert.equal(migrate("https://recarplan.com/?ref=RC-NEW123", entries).searchParams.get("ref"), "RC-NEW123");
  assert.equal(migrate("https://recarplan.com/", entries).searchParams.has("ref"), false);
});

test("invalid legacy codes and disabled storage cannot redirect or block startup", () => {
  for (const code of ["", "https://example.invalid", "<script>alert(1)</script>", "RC-123"]) {
    assert.equal(migrate("https://recarplan.com/", { recar_referral_code: code }).href, "https://recarplan.com/");
  }
  assert.equal(migrate("https://recarplan.com/?utm_source=test", {}, true).href, "https://recarplan.com/?utm_source=test");
});

test("old document anchors do not become Flutter named routes", () => {
  const url = migrate("https://recarplan.com/?ref=RC-AB1234#quote");
  assert.equal(url.hash, "");
  assert.equal(url.searchParams.get("ref"), "RC-AB1234");
  assert.equal(migrate("https://recarplan.com/#quote", {}, true).hash, "");
});
