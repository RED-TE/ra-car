const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.resolve(__dirname, "../../fixtures/legacy-home.html"), "utf8");

// Retained static-page coverage only; the live main entry is tested separately.
async function legacyHomeFixture(page) {
  await page.route(url => url.origin === "http://127.0.0.1:4175" && url.pathname === "/", route => {
    if (!route.request().isNavigationRequest()) return route.fallback();
    return route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
}

module.exports = { legacyHomeFixture };
