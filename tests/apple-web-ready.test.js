const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { verify } = require("../tools/verify-apple-web-ready.cjs");

function response(body, changes = {}, cache = "no-store") {
  return new Response(JSON.stringify({ client_id: "com.johongcheol.recarapp.web", redirect_uri: body.redirect_uri,
    state: "synthetic-state", nonce: "synthetic-nonce", ...changes }), { headers: { "cache-control": cache } });
}

test("Apple preflight checks only fixed root/app starts, not member or token endpoints", async () => {
  const calls = [];
  const checked = await verify({ fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    return response(body);
  } });
  assert.equal(checked.length, 2);
  assert.deepEqual(checked.map(item => item.redirect), ["https://recarplan.com/", "https://recarplan.com/app/"]);
  for (const call of calls) {
    assert.equal(call.url, "https://api.recarplan.com/api/v1/auth/apple/start");
    assert.equal(call.options.redirect, "manual");
    assert.equal(call.body.platform, "web");
    assert.match(call.body.code_challenge, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(Object.keys(call.body).sort(), ["code_challenge", "platform", "redirect_uri"]);
    assert.equal(call.options.headers.Authorization, undefined);
  }
});

test("unavailable or misconfigured Apple API blocks publication", async () => {
  await assert.rejects(verify({ fetchImpl: async () => new Response("", { status: 503 }) }));
  for (const changes of [{ client_id: "wrong.app" }, { nonce: "" }, { state: "" }, { redirect_uri: "https://evil.test/" }]) {
    await assert.rejects(verify({ fetchImpl: async (_url, options) => response(JSON.parse(options.body), changes) }));
  }
  await assert.rejects(verify({ fetchImpl: async (_url, options) => response(JSON.parse(options.body), {}, "max-age=60") }));
});

test("Apple readiness is required before uploading Pages assets", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/pages.yml", `file://${__filename}`), "utf8");
  assert.ok(workflow.includes("npm run verify:apple:production"));
  assert.ok(workflow.indexOf("npm run verify:apple:production") < workflow.indexOf("uses: actions/upload-pages-artifact"));
  const checks = fs.readFileSync(new URL("../.github/workflows/crew-checks.yml", `file://${__filename}`), "utf8");
  assert.ok(checks.includes("npm run test:kakao"));
  assert.ok(checks.includes("npm run test:apple"));
});
