const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { verify } = require("../tools/verify-kakao-web-ready.cjs");

function response(body, { host = "kauth.kakao.com", cache = "no-store" } = {}) {
  const url = new URL(`https://${host}/oauth/authorize`);
  url.search = new URLSearchParams({ redirect_uri: body.redirect_uri, code_challenge: body.code_challenge, code_challenge_method: "S256", state: "synthetic-state", response_type: "code", client_id: "synthetic-id" });
  return new Response(JSON.stringify({ authorization_url: url.href, state: "synthetic-state" }), { status: 200, headers: { "cache-control": cache } });
}

test("deployment preflight checks only two fixed start requests, never a token exchange or user data", async () => {
  const calls = [];
  const checked = await verify({ fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    return response(body);
  } });
  assert.equal(checked.length, 2);
  assert.deepEqual(checked.map(item => item.redirect), ["https://recarplan.com/", "https://recarplan.com/app/"]);
  for (const call of calls) {
    assert.equal(call.url, "https://api.recarplan.com/api/v1/users/oauth/kakao/web/start");
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.redirect, "manual");
    assert.deepEqual(Object.keys(call.body).sort(), ["code_challenge", "redirect_uri"]);
    assert.match(call.body.code_challenge, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(call.options.headers.Authorization, undefined);
  }
});

test("missing API blocks publication rather than deploying an unusable login button", async () => {
  await assert.rejects(verify({ fetchImpl: async () => new Response("not found", { status: 404 }) }), /HTTP 404/);
});

test("cached responses and non-provider targets block publication", async () => {
  await assert.rejects(verify({ fetchImpl: async (_url, options) => response(JSON.parse(options.body), { cache: "max-age=60" }) }), /must not be cached/);
  await assert.rejects(verify({ fetchImpl: async (_url, options) => response(JSON.parse(options.body), { host: "not-kakao.example.test" }) }), /contract is invalid/);
});

test("Pages checks the Kakao API and real web callback before uploading public assets", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/pages.yml", `file://${__filename}`), "utf8");
  assert.ok(workflow.indexOf("npm run verify:kakao:production") < workflow.indexOf("uses: actions/upload-pages-artifact"));
  assert.ok(workflow.includes("npm run test:kakao"));
});
