const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const { createServer } = require("node:http");
const { createHash } = require("node:crypto");

const source = readFileSync(require.resolve("../crew/session.js"), "utf8");

test("Crew entry pages invalidate the browser cache when the session script changes", () => {
  const version = createHash("sha256").update(source).digest("hex").slice(0, 12);
  for (const file of ["../crew/login.html", "../crew/index.html"]) {
    const html = readFileSync(require.resolve(file), "utf8");
    assert.ok(html.includes(`src="./session.js?v=${version}"`), `${file} must use the current session content hash`);
  }
});

function harness(fetch) {
  const timers = new Map();
  const window = {};
  runInNewContext(source, {
    window, fetch, AbortController,
    setTimeout(callback, delay) {
      const id = Symbol("timeout");
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  return { crew: window.RecarCrew, timers };
}

function streamingResponse() {
  let complete;
  let reject;
  const body = new Promise((resolve, rejectBody) => { complete = resolve; reject = rejectBody; });
  return {
    response: { status: 200, clone: () => ({ text: () => body }) },
    complete,
    abort: () => { const error = new Error("Aborted"); error.name = "AbortError"; reject(error); },
  };
}

test("Crew request keeps the timeout active while the response body is pending", async () => {
  const stream = streamingResponse();
  const h = harness(async () => stream.response);
  let settled = false;
  const request = h.crew.request("/api/v1/friends/status").then(response => { settled = true; return response; });
  await new Promise(resolve => setImmediate(resolve));
  const settledBeforeBody = settled;
  const timerDelays = [...h.timers.values()].map(timer => timer.delay);
  stream.complete("{}");
  assert.equal(await request, stream.response);
  assert.equal(settledBeforeBody, false);
  assert.deepEqual(timerDelays, [15000]);
  assert.equal(h.timers.size, 0);
});

test("Crew request aborts a stalled body and reports a readable timeout", async () => {
  const stream = streamingResponse();
  let signal;
  const h = harness(async (_url, options) => {
    signal = options.signal;
    signal.addEventListener("abort", stream.abort, { once: true });
    return stream.response;
  });
  const request = h.crew.request("/api/v1/friends/apply", { method: "POST" });
  const result = request.then(() => ({ resolved: true }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  const timer = [...h.timers.values()][0];
  if (timer) timer.callback();
  else stream.complete("{}");
  const outcome = await result;
  assert.equal(signal.aborted, true);
  assert.match(outcome.error?.message || "", /응답이 지연/);
  assert.equal(h.timers.size, 0);
});

test("Crew request preserves JSON, headers and status after reading its clone", async () => {
  const response = new Response(JSON.stringify({ login_id: "fixture", status: "PENDING" }), {
    status: 201, headers: { "Content-Type": "application/json", "X-Request-Id": "fixture" },
  });
  const h = harness(async () => response);
  const result = await h.crew.request("/api/v1/friends/apply", { method: "POST" });
  assert.equal(result, response);
  assert.equal(result.bodyUsed, false);
  assert.equal(result.status, 201);
  assert.equal(result.headers.get("X-Request-Id"), "fixture");
  assert.deepEqual(await result.json(), { login_id: "fixture", status: "PENDING" });
  assert.equal(h.timers.size, 0);
});

test("Crew request preserves a structured server error and empty responses", async () => {
  const responses = [
    new Response(JSON.stringify({ error: { message: "서비스 점검 중입니다." } }), { status: 503 }),
    new Response(null, { status: 204 }),
  ];
  const h = harness(async () => responses.shift());
  const errorResponse = await h.crew.request("/api/v1/friends/status");
  assert.equal(errorResponse.status, 503);
  assert.equal(await h.crew.errorMessage(errorResponse, "fallback"), "서비스 점검 중입니다.");
  assert.equal((await h.crew.request("/api/v1/friends/status")).status, 204);
  assert.equal(h.timers.size, 0);
});

test("Crew request clears its timer on a network failure", async () => {
  const h = harness(async () => { throw new TypeError("Network unavailable"); });
  await assert.rejects(h.crew.request("/api/v1/friends/status"), /서버에 연결하지 못/);
  assert.equal(h.timers.size, 0);
});

test("Crew request stops a real fetch stream after its headers arrive", async () => {
  let receivedHeaders;
  const ready = new Promise(resolve => { receivedHeaders = resolve; });
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write('{"status":');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const h = harness(async (_url, options) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/fixture`, options);
    receivedHeaders();
    return response;
  });
  try {
    const result = h.crew.request("/api/v1/friends/status").then(() => null, error => error);
    await ready;
    await new Promise(resolve => setImmediate(resolve));
    [...h.timers.values()][0].callback();
    assert.match((await result)?.message || "", /응답이 지연/);
    assert.equal(h.timers.size, 0);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
