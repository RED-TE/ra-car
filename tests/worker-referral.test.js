const test = require("node:test");
const assert = require("node:assert/strict");

test("edge referral route proxies only valid individual paths to the homepage", async () => {
  const worker = (await import("../workers/crew-referral.mjs")).default;
  const previousFetch = globalThis.fetch;
  const previousRewriter = globalThis.HTMLRewriter;
  const fetched = [];
  globalThis.fetch = async request => {
    fetched.push(request);
    return new Response("<html><head></head><body>RE:CAR</body></html>", { headers: { "Content-Type": "text/html" } });
  };
  globalThis.HTMLRewriter = class {
    on(selector, handlers) {
      assert.equal(selector, "head");
      this.handlers = handlers;
      return this;
    }
    async transform(response) {
      let addition = "";
      this.handlers.element({ prepend(html) { addition = html; } });
      return new Response((await response.text()).replace("<head>", `<head>${addition}`), { headers: response.headers });
    }
  };

  try {
    const valid = await worker.fetch(new Request("https://recarplan.com/r/RC-QA1234", {
      headers: { Cookie: "private-session=must-not-forward" },
    }));
    assert.equal(valid.status, 200);
    assert.match(await valid.text(), /<base href="https:\/\/recarplan\.com\/">/);
    assert.deepEqual(fetched.map(item => item.url), ["https://recarplan.com/index.html"]);
    const preview = await worker.fetch(new Request("https://recar-crew-referral.jhxox666.workers.dev/r/RC-QA1234"));
    assert.equal(preview.status, 200);
    assert.equal(fetched[1].url, "https://recarplan.com/index.html");
    assert.equal(fetched[0].headers.get("Cookie"), null);
    assert.equal((await worker.fetch(new Request("https://recarplan.com/r/invalid"))).status, 404);
    assert.equal((await worker.fetch(new Request("https://recarplan.com/r/RC-QA1234/extra"))).status, 404);
    assert.equal((await worker.fetch(new Request("https://recarplan.com/r/RC-QA1234", { method: "POST" }))).status, 405);
    assert.equal(fetched.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.HTMLRewriter = previousRewriter;
  }
});
