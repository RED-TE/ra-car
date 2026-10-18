const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");

async function redirect(path, init) {
  const worker = (await import("../workers/crew-entry.mjs")).default;
  return worker.fetch(new Request(`https://recarplan.com${path}`, init));
}

test("Crew entry routes escape the cached extensionless login document", async () => {
  for (const method of ["GET", "HEAD"]) {
    for (const path of ["/crew", "/crew/", "/crew/login", "/crew/login/"]) {
      const response = await redirect(path, { method });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("Location"), `https://recarplan.com/crew/${path.includes("login") ? "login" : "welcome"}.html`);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("Cloudflare-CDN-Cache-Control"), "no-store");
      assert.equal(await response.text(), "");
    }
  }
});

test("application intent and validated referral codes are preserved", async () => {
  for (const path of ["/crew", "/crew/", "/crew/login", "/crew/login/"]) {
    assert.equal((await redirect(`${path}?action=apply&ref=RC-QA1234`)).headers.get("Location"), "https://recarplan.com/crew/login.html?action=apply");
    assert.equal((await redirect(`${path}?mode=apply`)).headers.get("Location"), "https://recarplan.com/crew/login.html?action=apply");
    assert.equal((await redirect(`${path}?ref=rc-qa1234&next=https://invalid.example&token=private`)).headers.get("Location"), "https://recarplan.com/app/?ref=RC-QA1234");
  }
});

test("an HTTP entry always upgrades its destination to HTTPS", async () => {
  const worker = (await import("../workers/crew-entry.mjs")).default;
  const response = await worker.fetch(new Request("http://recarplan.com/crew/login"));
  assert.equal(response.headers.get("Location"), "https://recarplan.com/crew/login.html");
});

test("only supported session notices survive and arbitrary targets are discarded", async () => {
  for (const status of ["PENDING", "REJECTED", "SUSPENDED", "NOT_APPLIED", "EXPIRED", "LOGGED_OUT"]) {
    assert.equal((await redirect(`/crew/login?status=${status}`)).headers.get("Location"), `https://recarplan.com/crew/login.html?status=${status}`);
  }
  assert.equal((await redirect("/crew/login?status=unknown&next=https://invalid.example&token=private")).headers.get("Location"), "https://recarplan.com/crew/login.html");
  for (const ref of ["RC-X", "RC-1234/other", "https://invalid.example"]) {
    assert.equal((await redirect(`/crew?ref=${encodeURIComponent(ref)}`)).headers.get("Location"), "https://recarplan.com/crew/welcome.html");
  }
});

test("worker cannot capture dashboards, forms, assets, APIs or other hosts", async () => {
  for (const path of ["/crew/index.html", "/crew/login.html", "/crew/njob/", "/crew/guide/", "/crew/session.js", "/api/friends-proxy/api/v1/friends/status", "/dashboard"]) {
    assert.equal((await redirect(path)).status, 404);
  }
  assert.equal((await redirect("/crew", { method: "POST" })).status, 405);
  const worker = (await import("../workers/crew-entry.mjs")).default;
  assert.equal((await worker.fetch(new Request("https://other.invalid/crew"))).status, 404);
  const config = JSON.parse(fs.readFileSync(require.resolve("../workers/wrangler-crew-entry.jsonc"), "utf8"));
  assert.deepEqual(config.routes.map(route => route.pattern), ["recarplan.com/crew", "recarplan.com/crew/", "recarplan.com/crew/login", "recarplan.com/crew/login/"]);
  assert.equal(config.workers_dev, false);
});
