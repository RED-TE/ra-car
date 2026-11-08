const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { test } = require("node:test");

const rootDir = path.resolve(__dirname, "..");
const fixture = require("./fixtures/synthetic-public-rental.cjs");
const vehicleId = fixture.rows[0].id;
const detailRoute = `/api/recar/vehicles/${encodeURIComponent(vehicleId)}`;

function syntheticPreload(mode) {
  return `
const fs = require("node:fs");
const path = require("node:path");
const fixture = require(${JSON.stringify(path.join(__dirname, "fixtures/synthetic-public-rental.cjs"))});
const mode = ${JSON.stringify(mode)};
const dataDir = ${JSON.stringify(path.join(rootDir, "data"))};
const emit = value => { if (process.connected) process.send(value); };
let releaseDetail;
const rejectFile = (name, write) => {
  const value = Buffer.isBuffer(name) ? name.toString() : String(name);
  if (write || path.resolve(value).startsWith(dataDir + path.sep)) {
    emit({ type: "blocked-file", write, name: value });
    throw new Error("Price/customer file access is outside gateway test scope");
  }
};
for (const name of ["readFileSync", "readFile", "openSync", "open", "createReadStream"]) {
  const original = fs[name];
  fs[name] = function (filename, ...args) { rejectFile(filename, false); return original.call(this, filename, ...args); };
}
for (const name of ["readFile", "open"]) {
  const original = fs.promises[name];
  fs.promises[name] = function (filename, ...args) { rejectFile(filename, false); return original.call(this, filename, ...args); };
}
for (const name of ["writeFileSync", "writeFile", "appendFileSync", "appendFile", "createWriteStream"]) {
  fs[name] = filename => rejectFile(filename, true);
}
for (const name of ["writeFile", "appendFile"]) fs.promises[name] = filename => rejectFile(filename, true);
process.on("unhandledRejection", error => emit({ type: "unhandled", message: String(error) }));
process.on("message", message => {
  if (message.type === "release-detail" && releaseDetail) {
    releaseDetail();
    setImmediate(() => setImmediate(() => emit({ type: "late-response-drained" })));
  }
});
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  const method = options.method || "GET";
  if (url.origin !== "https://api.recarplan.com") {
    emit({ type: "blocked-fetch", url: url.href });
    throw new Error("All external network is mocked or denied");
  }
  const body = options.body === undefined ? null : JSON.parse(options.body);
  emit({ type: "upstream", path: url.pathname, query: Object.fromEntries(url.searchParams),
    method, body, credentials: options.credentials, redirect: options.redirect,
    headerNames: Object.keys(options.headers || {}) });
  const json = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { "content-type": "application/json" },
  });
  if (method === "GET" && url.pathname === "/api/v1/vehicles/") {
    if (mode === "catalog-error") return json({ error: "SYNTHETIC_UPSTREAM_FAILURE" }, 503);
    return json(fixture.listPage(Number(url.searchParams.get("page")), fixture.rows.slice(0, 2)));
  }
  const match = url.pathname.match(/^\\/api\\/v1\\/vehicles\\/([^/]+)$/);
  if (method === "GET" && match) {
    if (mode === "detail-error") return json({ error: "SYNTHETIC_UPSTREAM_FAILURE" }, 503);
    const detail = fixture.detail(decodeURIComponent(match[1]));
    if (mode === "late-detail") {
      options.signal.addEventListener("abort", () => emit({ type: "upstream-aborted" }), { once: true });
      // Deliberately ignore cancellation in this adapter. The real shared
      // module must stop its own pipeline even if a late response arrives.
      await new Promise(resolve => { releaseDetail = resolve; emit({ type: "detail-pending" }); });
    }
    return json(detail, detail ? 200 : 404);
  }
  if (method === "POST" && url.pathname === "/api/v1/quotes/instant") {
    if (mode === "quote-error") return json({ error: "SYNTHETIC_UPSTREAM_FAILURE" }, 503);
    const quote = fixture.quote(body.vehicle_id);
    if (mode === "contradictory-source") quote.data.price_provenance.market_price.applied_conditions.term_months = 48;
    return json(quote);
  }
  emit({ type: "blocked-fetch", url: url.href, method });
  throw new Error("Unexpected upstream route or method");
};
`;
}

async function availablePort() {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function startGateway(t, mode) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "recar-public-rental-gateway-"));
  const preload = path.join(scratch, "synthetic-fetch.cjs");
  fs.writeFileSync(preload, syntheticPreload(mode));
  const port = await availablePort();
  const events = [];
  const child = spawn(process.execPath, ["--require", preload, "server.js", "--port", String(port)], {
    cwd: rootDir,
    // Do not forward credentials, NODE_OPTIONS, or user runtime configuration.
    env: { PATH: process.env.PATH, NODE_ENV: "production", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.on("message", event => events.push(event));
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => { child.once("exit", resolve); child.kill(); });
    }
    assert.equal(stderr, "", "child must not report runtime errors");
    assert.deepEqual(events.filter(event => ["blocked-fetch", "blocked-file", "unhandled"].includes(event.type)), [],
      "gateway must not access static/customer price files or an unmocked upstream");
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("gateway_start_timeout")), 5000);
    const fail = code => { clearTimeout(timeout); reject(new Error(`gateway_exit_${code}: ${stderr}`)); };
    child.once("exit", fail);
    child.stdout.on("data", chunk => {
      if (String(chunk).includes("RE:CAR server running")) {
        clearTimeout(timeout);
        child.off("exit", fail);
        resolve();
      }
    });
  });
  return {
    baseUrl: `http://127.0.0.1:${port}`, child, events,
    waitFor(type) {
      const recorded = events.find(event => event.type === type);
      if (recorded) return Promise.resolve(recorded);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { child.off("message", onMessage); reject(new Error(`missing_event_${type}`)); }, 5000);
        function onMessage(event) {
          if (event.type !== type) return;
          clearTimeout(timeout);
          child.off("message", onMessage);
          resolve(event);
        }
        child.on("message", onMessage);
      });
    },
  };
}

function assertSelectionPost(event, id) {
  assert.equal(event.path, "/api/v1/quotes/instant");
  assert.equal(event.method, "POST");
  assert.deepEqual(event.body, {
    vehicle_id: id, selection_contract_version: "selection_v1",
    selection: { vehicle_trim_id: `${id}-TRIM`, selected_option_ids: [] },
    product_type: "RENTAL", term: 60, prepayment_pct: 0,
    guarantee: 0, guarantee_pct: 0, mileage_limit: 10000,
  });
  assert.equal(event.credentials, "omit");
  assert.equal(event.redirect, "error");
  assert.ok(!event.headerNames.some(name => /authorization|cookie/i.test(name)));
}

test("public detail HTTP gateway passes through the validated selection price without a lift", async t => {
  const gateway = await startGateway(t, "valid");
  const response = await fetch(gateway.baseUrl + detailRoute);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.vehicle.id, vehicleId);
  assert.equal(body.vehicle.monthlyPayment, fixture.quote(vehicleId).data.monthly_payment);
  assert.notEqual(body.vehicle.monthlyPayment, fixture.rows[0].monthly_payment);
  assert.equal(body.vehicle.priceEvidence.verified, true);
  const upstream = gateway.events.filter(event => event.type === "upstream");
  assert.equal(upstream.length, 2);
  assert.equal(upstream[0].path, `/api/v1/vehicles/${vehicleId}`);
  assert.equal(upstream[0].method, "GET");
  assertSelectionPost(upstream[1], vehicleId);
});

test("public list HTTP gateway uses discovery then default trim and selection POST per vehicle", async t => {
  const gateway = await startGateway(t, "valid");
  const response = await fetch(`${gateway.baseUrl}/api/recar/vehicles`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items.length, 2);
  assert.deepEqual(body.conditions, { productType: "RENTAL", term: 60, depositPct: 0, guaranteePct: 0, mileageLimit: 10000 });
  for (const [index, item] of body.items.entries()) {
    assert.equal(item.id, fixture.rows[index].id);
    assert.equal(item.monthlyPayment, fixture.quote(item.id).data.monthly_payment);
    assert.equal(item.priceEvidence.verified, true);
  }
  const upstream = gateway.events.filter(event => event.type === "upstream");
  assert.equal(upstream.length, 5);
  assert.equal(upstream[0].path, "/api/v1/vehicles/");
  assert.equal(upstream[0].query.product_type, "RENTAL");
  for (const item of body.items) assertSelectionPost(upstream.find(event => event.body?.vehicle_id === item.id), item.id);
});

for (const [mode, route] of [["catalog-error", "/api/recar/vehicles"], ["detail-error", detailRoute]]) {
  test(`public gateway returns 502 for ${mode} without static price fallback`, async t => {
    const gateway = await startGateway(t, mode);
    const response = await fetch(gateway.baseUrl + route);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { ok: false, error: "vehicle_api_failed" });
    const upstream = gateway.events.filter(event => event.type === "upstream");
    assert.equal(upstream.length, 1);
    assert.equal(upstream[0].method, "GET");
  });
}

for (const mode of ["contradictory-source", "quote-error"]) {
  test(`public detail keeps metadata but no amount for ${mode}`, async t => {
    const gateway = await startGateway(t, mode);
    const response = await fetch(gateway.baseUrl + detailRoute);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.vehicle.id, vehicleId);
    assert.equal(body.vehicle.monthlyPayment, null);
    assert.equal(body.vehicle.priceEvidence.verified, false);
    assert.equal(body.vehicle.priceEvidence.reason, "PRICE_UNVERIFIED");
    assert.ok(!JSON.stringify(body).includes(String(fixture.rows[0].monthly_payment)));
    const upstream = gateway.events.filter(event => event.type === "upstream");
    assert.equal(upstream.length, 2);
    assertSelectionPost(upstream[1], vehicleId);
  });
}

test("client disconnect aborts the gateway and a late detail response cannot start a quote POST", async t => {
  const gateway = await startGateway(t, "late-detail");
  const request = http.get(gateway.baseUrl + detailRoute);
  request.on("error", () => {}); // Expected ECONNRESET after the deliberate disconnect.
  await gateway.waitFor("detail-pending");
  request.destroy();
  await gateway.waitFor("upstream-aborted");
  gateway.child.send({ type: "release-detail" });
  await gateway.waitFor("late-response-drained");
  const upstream = gateway.events.filter(event => event.type === "upstream");
  assert.equal(upstream.length, 1);
  assert.equal(upstream[0].method, "GET");
  assert.equal(upstream.filter(event => event.method === "POST").length, 0);
});
