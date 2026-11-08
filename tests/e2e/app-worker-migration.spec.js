const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { createHash } = require("node:crypto");

const workerPath = path.resolve(__dirname, "../../app/flutter_service_worker.js");
const oldDocument = "<!doctype html><title>Old app</title><h1>OLD</h1>";
const freshDocument = "<!doctype html><title>Fresh app</title><h1>FRESH</h1>";
const oldWorker = `
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.mode === "navigate") {
    event.respondWith(new Response(${JSON.stringify(oldDocument)}, {
      headers: { "content-type": "text/html; charset=utf-8" }
    }));
  }
});
`;

async function startMigrationServer(replacementWorker) {
  let released = false;
  const requests = [];
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    requests.push({ method: request.method, pathname, released });
    response.setHeader("cache-control", "no-store, max-age=0");
    if (request.method !== "GET") {
      response.writeHead(405).end();
    } else if (pathname === "/app/flutter_service_worker.js") {
      response.writeHead(200, {
        "content-type": "application/javascript; charset=utf-8",
        "service-worker-allowed": "/app/",
      });
      response.end(released ? replacementWorker : oldWorker);
    } else if (pathname === "/app/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(freshDocument);
    } else if (pathname === "/favicon.ico") {
      response.writeHead(204).end();
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    release: () => { released = true; },
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

async function migrationState(page) {
  return page.evaluate(async () => ({
    heading: document.querySelector("h1")?.textContent,
    controller: navigator.serviceWorker.controller?.scriptURL ?? null,
    registrations: (await navigator.serviceWorker.getRegistrations()).map(registration => ({
      scope: registration.scope,
      active: registration.active?.state ?? null,
      waiting: registration.waiting?.state ?? null,
      installing: registration.installing?.state ?? null,
    })),
    quote: localStorage.getItem("synthetic-saved-quote"),
    cachedCatalog: await (await caches.match("/synthetic-catalog-entry"))?.text() ?? null,
    updateError: window.migrationUpdateError ?? null,
  }));
}

// Catches a staged build replacing the migration worker with an empty worker:
// an already-controlled tab must leave OLD without a test-driven reload.
test("published worker moves an old controlled tab to the fresh app", async ({ browser }, testInfo) => {
  const replacementWorker = fs.readFileSync(workerPath);
  const server = await startMigrationServer(replacementWorker);
  const blockedRequests = [];
  const appUrl = `${server.origin}/app/?synthetic=worker-migration#saved-quote`;
  let context;
  let page;
  let beforeUpdate;
  try {
    context = await browser.newContext({ serviceWorkers: "allow" });
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === server.origin) return route.continue();
      blockedRequests.push(url.origin);
      return route.abort();
    });
    page = await context.newPage();
    await page.goto(appUrl);
    await page.evaluate(async () => {
      localStorage.setItem("synthetic-saved-quote", '{"id":"fixture-quote","amount":123456}');
      const cache = await caches.open("synthetic-saved-catalog");
      await cache.put("/synthetic-catalog-entry", new Response("catalog-preserved"));
      await navigator.serviceWorker.register("/app/flutter_service_worker.js", {
        scope: "/app/", updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
      }
    });
    const oldResponse = await page.reload();
    expect(oldResponse.fromServiceWorker()).toBe(true);
    await expect(page.getByRole("heading", { name: "OLD", exact: true })).toBeVisible();
    beforeUpdate = await migrationState(page);
    expect(beforeUpdate.controller).toBe(`${server.origin}/app/flutter_service_worker.js`);
    expect(beforeUpdate.registrations).toHaveLength(1);

    server.release();
    await page.evaluate(() => {
      navigator.serviceWorker.getRegistration().then(registration => registration.update())
        .catch(error => { window.migrationUpdateError = String(error); });
    });
    // No goto/reload/unregister/skipWaiting from the test after publication.
    await expect(page.getByRole("heading", { name: "FRESH", exact: true })).toBeVisible();
    await expect.poll(async () => (await migrationState(page)).controller).toBeNull();
    const afterUpdate = await migrationState(page);
    expect(afterUpdate.registrations).toEqual([]);
    expect(afterUpdate.quote).toBe('{"id":"fixture-quote","amount":123456}');
    expect(afterUpdate.cachedCatalog).toBe("catalog-preserved");
    expect(afterUpdate.updateError).toBeNull();
    expect(page.url()).toBe(appUrl);
    expect(server.requests.some(request => request.released && request.pathname === "/app/")).toBe(true);
    expect(blockedRequests).toEqual([]);
  } finally {
    try {
      const finalState = page
        ? await migrationState(page).catch(error => ({ inspectionError: String(error) }))
        : { pageCreated: false };
      await testInfo.attach("migration-evidence", {
        body: Buffer.from(JSON.stringify({
          workerBytes: replacementWorker.length,
          workerSha256: createHash("sha256").update(replacementWorker).digest("hex"),
          beforeUpdate, finalState, requests: server.requests, blockedRequests,
        }, null, 2)),
        contentType: "application/json",
      });
    } finally {
      try {
        if (context) await context.close();
      } finally {
        await server.close();
      }
    }
  }
});
