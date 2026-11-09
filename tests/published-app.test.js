const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { test } = require("node:test");

const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const appHtml = '<!doctype html><html><head><base href="/app/"><link rel="preload" href="main.dart.js?build=synthetic-release" as="script"></head><body><script src="flutter_bootstrap.js?build=synthetic-release" async></script></body></html>';
const rootHtml = appHtml.replace('<script src=', '<script data-recar-entry-migration>window.syntheticMigration = "keep-referral";</script><script src=');

async function fixture(t, modify = () => {}) {
  const files = new Map([
    ["/", Buffer.from(rootHtml)],
    ["/app/", Buffer.from(appHtml)],
    ["/app/main.dart.js", Buffer.from("synthetic-code")],
    ["/app/assets/assets/cars/Genesis/GV70_360.png", Buffer.from("synthetic-GV70")],
    ["/app/assets/assets/cars/Genesis/gv70_verified.png", Buffer.from("synthetic-GV70")],
  ]);
  const expected = {
    build_id: "synthetic-release", source_commit: "a".repeat(40),
    web_source_patch_sha256: "b".repeat(64), base_path: "/app/",
    sha256: { "index.html": digest(files.get("/app/")), "main.dart.js": digest(files.get("/app/main.dart.js")) },
    vehicle_images: ["GV70_360.png", "gv70_verified.png"].map(name => ({
      asset: `assets/cars/Genesis/${name}`, sha256: digest("synthetic-GV70"),
    })),
  };
  files.set("/app/release.json", Buffer.from(JSON.stringify(expected)));
  files.set("/app/index.html", { status: 308, body: "canonical /app/ entry" });
  modify(files);
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    const content = files.get(req.url);
    if (!content) { res.writeHead(404); res.end("missing synthetic asset"); return; }
    if (content.status) { res.writeHead(content.status); res.end(content.body || "synthetic-error"); return; }
    res.writeHead(200); res.end(content);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { expected, rootHtml, appHtml, origin, requests };
}

test("published verification checks real bytes at both cached legacy and new vehicle paths with GET only", async t => {
  const input = await fixture(t);
  const { verify } = require("../tools/verify-published-app.cjs");
  const result = await verify(input);
  assert.equal(result.build_id, "synthetic-release");
  assert.equal(result.checked.length, 6);
  assert.equal(input.requests.length, 6);
  assert.ok(input.requests.some(r => r.url === "/app/"));
  assert.ok(input.requests.every(r => r.url !== "/app/index.html"));
  assert.ok(input.requests.every(r => r.method === "GET" && r.authorization === undefined));
  assert.deepEqual(result.checked.filter(x => x.path.endsWith(".png")).map(x => x.path), [
    "/app/assets/assets/cars/Genesis/GV70_360.png", "/app/assets/assets/cars/Genesis/gv70_verified.png",
  ]);
});

test("an old release fails before fetching any application or vehicle files", async t => {
  const input = await fixture(t, files => {
    const metadata = JSON.parse(files.get("/app/release.json"));
    metadata.build_id = "previous-release";
    files.set("/app/release.json", Buffer.from(JSON.stringify(metadata)));
  });
  const { verify } = require("../tools/verify-published-app.cjs");
  await assert.rejects(verify(input), /release metadata mismatch/);
  assert.equal(input.requests.length, 1);
});

test("a stale legacy vehicle photo fails even when the release metadata and new photo are correct", async t => {
  const input = await fixture(t, files => files.set("/app/assets/assets/cars/Genesis/GV70_360.png", Buffer.from("synthetic-wrong-car")));
  const { verify } = require("../tools/verify-published-app.cjs");
  await assert.rejects(verify(input), /hash mismatch.*GV70_360/);
});

test("a missing new photo stops verification without retrying or fetching a fallback", async t => {
  const input = await fixture(t, files => files.delete("/app/assets/assets/cars/Genesis/gv70_verified.png"));
  const { verify } = require("../tools/verify-published-app.cjs");
  await assert.rejects(verify(input), /HTTP 404/);
  assert.equal(input.requests.filter(r => r.url.endsWith("gv70_verified.png")).length, 1);
});

test("the previous root entry fails despite an otherwise updated app", async t => {
  const input = await fixture(t, files => files.set("/", Buffer.from("previous-root")));
  const { verify } = require("../tools/verify-published-app.cjs");
  await assert.rejects(verify(input), /HTML entry mismatch: \/ /);
});

test("invalid release responses do not leak their response body into diagnostics", async t => {
  const input = await fixture(t, files => files.set("/app/release.json", Buffer.from("private-response-marker")));
  const { verify } = require("../tools/verify-published-app.cjs");
  await assert.rejects(verify(input), error => {
    assert.match(error.message, /invalid release JSON/);
    assert.ok(!error.message.includes("private-response-marker"));
    return true;
  });
});

test("Cloudflare-added scripts preserve a valid app and root without requiring identical HTML bytes", async t => {
  const input = await fixture(t, files => {
    for (const entry of ["/", "/app/"]) {
      const html = files.get(entry).toString();
      files.set(entry, Buffer.from(html.replace("</body>", '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></body>')));
    }
  });
  const { verify } = require("../tools/verify-published-app.cjs");
  const result = await verify(input);
  assert.equal(result.checked.length, 6);
  assert.notEqual(result.checked.find(row => row.path === "/").sha256, digest(rootHtml));
  assert.notEqual(result.checked.find(row => row.path === "/app/").sha256, input.expected.sha256["index.html"]);
});

test("missing or non-executable bootstrap fails even when its name is present in a comment", async t => {
  for (const replacement of ['<!-- <script src="flutter_bootstrap.js?build=synthetic-release" async></script> -->', '<script type="text/plain" src="flutter_bootstrap.js?build=synthetic-release" async></script>']) {
    const input = await fixture(t, files => files.set("/app/", Buffer.from(appHtml.replace(/<script[^>]*><\/script>/, replacement))));
    const { verify } = require("../tools/verify-published-app.cjs");
    await assert.rejects(verify(input), /HTML entry mismatch.*bootstrap/);
  }
});

test("a previous HTML build, wrong base, or missing main preload is rejected", async t => {
  for (const html of [appHtml.replaceAll("synthetic-release", "previous-release"), appHtml.replace('href="/app/"', 'href="/old-app/"'), appHtml.replace(/<link[^>]*>/, "")]) {
    const input = await fixture(t, files => files.set("/app/", Buffer.from(html)));
    const { verify } = require("../tools/verify-published-app.cjs");
    await assert.rejects(verify(input), /HTML entry mismatch/);
  }
});

test("a retained migration marker does not excuse changed or missing root migration code", async t => {
  for (const html of [rootHtml.replace("keep-referral", "wrong-referral"), rootHtml.replace(/<script data-recar-entry-migration>[\s\S]*?<\/script>/, "")]) {
    const input = await fixture(t, files => files.set("/", Buffer.from(html)));
    const { verify } = require("../tools/verify-published-app.cjs");
    await assert.rejects(verify(input), /HTML entry mismatch.*migration/);
  }
});

test("HTTP 403 stops immediately without retries or further requests", async t => {
  const input = await fixture(t, files => files.set("/app/release.json", { status: 403, body: "private-denial-marker" }));
  const { verify } = require("../tools/verify-published-app.cjs");
  await assert.rejects(verify(input), error => {
    assert.match(error.message, /HTTP 403/);
    assert.ok(!error.message.includes("private-denial-marker"));
    return true;
  });
  assert.equal(input.requests.length, 1);
});

test("HTML tolerance does not allow changed JavaScript asset bytes", async t => {
  const input = await fixture(t, files => files.set("/app/main.dart.js", Buffer.from("synthetic-wrong-code")));
  const { verify } = require("../tools/verify-published-app.cjs");
  await assert.rejects(verify(input), /hash mismatch.*main.dart.js/);
});


test("local app HTML must retain its release manifest digest before remote checks", async t => {
  const input = await fixture(t);
  input.appHtml += "<!-- locally changed -->";
  const { verify } = require("../tools/verify-published-app.cjs");
  await assert.rejects(verify(input), /local app HTML hash mismatch/);
  assert.equal(input.requests.length, 0);
});
