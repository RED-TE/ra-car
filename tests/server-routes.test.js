const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { test } = require("node:test");
const { getStableVehicleMargin, vehicleMarginMax, vehicleMarginMin } = require("../lib/vehicle-margin");

const rootDir = path.resolve(__dirname, "..");

function htmlFilesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFilesUnder(filePath);
    return entry.isFile() && entry.name.endsWith(".html") ? [filePath] : [];
  });
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function startServer(nodeEnv) {
  const port = await availablePort();
  const child = spawn(process.execPath, ["server.js", "--port", String(port)], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: nodeEnv,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server_start_timeout")), 10000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("RE:CAR server running")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`server_exited_${code}`));
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill();
      await new Promise((resolve) => {
        child.once("exit", resolve);
        setTimeout(resolve, 2000);
      });
    },
  };
}

test("development serves public aliases and the preview route", async () => {
  const server = await startServer("development");
  try {
    const routes = [
      "/crew/guide",
      "/crew/guide/",
      "/crew/knowledge",
      "/crew/knowledge/",
      "/crew/content-guide/",
      "/crew/guide/preview/",
      "/crew/knowledge/preview/",
    ];

    for (const pathname of routes) {
      const response = await fetch(`${server.baseUrl}${pathname}`);
      assert.equal(response.status, 200, pathname);
      assert.match(await response.text(), /RE:CAR 크루 안내서/, pathname);
    }

    const crewResponse = await fetch(`${server.baseUrl}/crew/`);
    assert.equal(crewResponse.status, 200);
    const crewHtml = await crewResponse.text();
    assert.match(crewHtml, /https:\/\/recarplan\.com\/crew/);
    assert.match(crewHtml, /params\.get\("ref"\)/);
    assert.match(crewHtml, /new URL\(`\/app\/\?ref=/);
    assert.doesNotMatch(crewHtml, /vercel\.app/);

    const friendsResponse = await fetch(`${server.baseUrl}/friends/?ref=RC-QA1234`);
    assert.equal(friendsResponse.status, 200);
    const friendsHtml = await friendsResponse.text();
    assert.match(friendsHtml, /new URL\("\/app\/", window\.location\.origin\)/);
    assert.match(friendsHtml, /target\.search = window\.location\.search/);

    const guideResponse = await fetch(`${server.baseUrl}/crew/guide/`);
    assert.match(await guideResponse.text(), /href="\/crew\/"/);

    const robotsResponse = await fetch(`${server.baseUrl}/robots.txt`);
    assert.equal(robotsResponse.status, 200);
    assert.match(robotsResponse.headers.get("content-type"), /^text\/plain/);
    assert.match(await robotsResponse.text(), /Sitemap: https:\/\/recarplan\.com\/sitemap\.xml/);

    const sitemapResponse = await fetch(`${server.baseUrl}/sitemap.xml`);
    assert.equal(sitemapResponse.status, 200);
    assert.match(sitemapResponse.headers.get("content-type"), /^application\/xml/);
    const sitemapXml = await sitemapResponse.text();
    assert.match(sitemapXml, /<loc>https:\/\/recarplan\.com\/<\/loc>/);
    assert.match(sitemapXml, /<loc>https:\/\/recarplan\.com\/crew\/guide\/<\/loc>/);

    const downloadResponse = await fetch(`${server.baseUrl}/download?ref=RC-QA1234`);
    assert.equal(downloadResponse.status, 200);
    assert.match(await downloadResponse.text(), /window\.location\.replace/);

    for (const pathname of [
      "/crew/guide/knowledge.css",
      "/crew/guide/knowledge.js",
      "/crew/guide/knowledge-data.js",
      "/crew/guide/lucide.min.js",
      "/assets/crew-knowledge/hero-car-1600.webp",
    ]) {
      const response = await fetch(`${server.baseUrl}${pathname}`);
      assert.equal(response.status, 200, pathname);
    }

    const quickGuideResponse = await fetch(`${server.baseUrl}/assets/crew-docs/recar-crew-quick-guide.pdf`);
    assert.equal(quickGuideResponse.status, 200);
    assert.match(quickGuideResponse.headers.get("content-type"), /^application\/pdf/);
    assert.ok((await quickGuideResponse.arrayBuffer()).byteLength > 1_000_000);
  } finally {
    await server.stop();
  }
});

test("production keeps public routes and returns 404 for preview", async () => {
  const server = await startServer("production");
  try {
    const publicResponse = await fetch(`${server.baseUrl}/crew/guide/`);
    const friendsResponse = await fetch(`${server.baseUrl}/friends/?ref=RC-QA1234`);
    const previewResponse = await fetch(`${server.baseUrl}/crew/guide/preview/`);
    const removedStartResponse = await fetch(`${server.baseUrl}/crew/start/`);
    assert.equal(publicResponse.status, 200);
    assert.equal(friendsResponse.status, 200);
    assert.equal(previewResponse.status, 404);
    assert.equal(removedStartResponse.status, 404);
  } finally {
    await server.stop();
  }
});

test("app preloaded fonts are served as fonts rather than blocked by the web preview", async () => {
  const server = await startServer("development");
  try {
    const response = await fetch(`${server.baseUrl}/app/`);
    const html = await response.text();
    const manifest = await (await fetch(`${server.baseUrl}/app/assets/FontManifest.json`)).json();
    for (const family of manifest) {
      for (const font of family.fonts) {
        const pathname = `/app/assets/${font.asset}`;
        const asset = await fetch(`${server.baseUrl}${pathname}`);
        assert.equal(asset.status, 200, pathname);
        assert.match(asset.headers.get("content-type"), /^font\//, pathname);
        assert.ok((await asset.arrayBuffer()).byteLength > 1000, pathname);
      }
    }
    const release = require("../app/release.json");
    assert.ok(html.includes(`main.dart.js?build=${release.build_id}" as="script"`));
  } finally {
    await server.stop();
  }
});

test("main and inquiry serve the published app build and keep test fixtures private", async () => {
  const server = await startServer("production");
  try {
    const release = require("../app/release.json");
    for (const entry of ["/", "/inquiry", "/inquiry/", "/app/"]) {
      const response = await fetch(`${server.baseUrl}${entry}?ref=RC-QA1234`);
      assert.equal(response.status, 200, entry);
      const html = await response.text();
      assert.match(html, /<base href="\/app\/">/, entry);
      assert.ok(html.includes(`flutter_bootstrap.js?build=${release.build_id}`), entry);
      assert.doesNotMatch(html, /home\.js|\.\.\/script\.js|quote-form/, entry);
    }
    assert.equal((await fetch(`${server.baseUrl}/tests/fixtures/legacy-home.html`)).status, 404);
  } finally {
    await server.stop();
  }
});

test("private data and unknown knowledge files stay blocked", async () => {
  const server = await startServer("development");
  try {
    const privateData = await fetch(`${server.baseUrl}/data/leads.jsonl`);
    const unknownFile = await fetch(`${server.baseUrl}/crew/guide/missing.js`);
    assert.equal(privateData.status, 404);
    assert.equal(unknownFile.status, 404);
  } finally {
    await server.stop();
  }
});

test("legacy crew links redirect to the app and preserve referral codes", async () => {
  const server = await startServer("production");
  try {
    const response = await fetch(`${server.baseUrl}/r/RC-QA1234`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/app/?ref=RC-QA1234");
    const destination = await fetch(`${server.baseUrl}${response.headers.get("location")}`);
    assert.equal(destination.status, 200);
    assert.match(await destination.text(), /<base href="\/app\/">/);
    assert.equal((await fetch(`${server.baseUrl}/r/not-a-code`)).status, 404);
    assert.equal((await fetch(`${server.baseUrl}/r/RC-QA1234/other`)).status, 404);
  } finally {
    await server.stop();
  }
});

test("vehicle margin stays fixed per model across every quote condition", async () => {
  const server = await startServer("development");
  try {
    const modelId = "pricing-모닝";
    const conditions = [
      "term=36&deposit_pct=0&mileage_limit=10000",
      "term=48&deposit_pct=20&mileage_limit=20000",
      "term=60&deposit_pct=30&mileage_limit=40000",
    ];
    const vehicles = [];

    for (const query of conditions) {
      const response = await fetch(`${server.baseUrl}/api/recar/vehicles/${encodeURIComponent(modelId)}?${query}`);
      assert.equal(response.status, 200);
      vehicles.push((await response.json()).vehicle);
    }

    const expectedMargin = getStableVehicleMargin(modelId);
    assert.ok(expectedMargin >= vehicleMarginMin && expectedMargin <= vehicleMarginMax);
    assert.equal(new Set(vehicles.map((vehicle) => vehicle.calculation.displayMonthlyLift)).size, 1);

    for (const vehicle of vehicles) {
      assert.equal(vehicle.calculation.displayMonthlyLift, expectedMargin);
      assert.equal(vehicle.monthlyPayment - vehicle.calculation.baseMonthlyPaymentBeforeLift, expectedMargin);
      for (const quote of vehicle.quotes) {
        assert.equal(quote.monthlyPayment - quote.monthlyPaymentBeforeLift, expectedMargin);
      }
    }
  } finally {
    await server.stop();
  }
});

test("crew application CTAs always open the application form", async () => {
  const loginHtml = fs.readFileSync(path.join(rootDir, "crew/login.html"), "utf8");
  const applicationLinks = htmlFilesUnder(path.join(rootDir, "crew")).flatMap((filePath) => {
    const html = fs.readFileSync(filePath, "utf8");
    return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g)]
      .filter((match) => /크루 (?:N잡 )?(?:신청|시작하기)/.test(match[0]))
      .map((match) => ({ filePath, href: match[1] }));
  });

  assert.ok(applicationLinks.length >= 6, "expected every crew application CTA to be covered");
  for (const { filePath, href } of applicationLinks) {
    const context = `${path.relative(rootDir, filePath)}: ${href}`;
    assert.match(href, /(?:^|\/)login\.html\?action=apply$/, context);
    assert.doesNotMatch(href, /^mailto:/, context);
  }

  assert.match(loginHtml, /id="crewApplyPanel"/);
  assert.match(loginHtml, /id="crewApplyForm"/);
  assert.match(loginHtml, /name="name"/);
  assert.match(loginHtml, /name="phone"[^>]*type="tel"[^>]*inputmode="numeric"|type="tel"[^>]*inputmode="numeric"/);
  assert.match(loginHtml, /name="snsAccount"/);
  assert.match(loginHtml, /name="loginId"/);
  assert.match(loginHtml, /name="password"/);
  assert.match(loginHtml, /placeholder="이메일 또는 원하는 아이디"/);
  assert.doesNotMatch(loginHtml, /LOGIN_ID_PATTERN/);
  assert.doesNotMatch(loginHtml, /pattern="\[a-zA-Z0-9\._-\]\+"/);
  assert.match(loginHtml, /get\("action"\) === "apply"/);
  assert.match(loginHtml, /loginForm\.hidden = true/);
  assert.match(loginHtml, /applyPanel\.hidden = false/);
  assert.match(loginHtml, /\/api\/v1\/friends\/apply/);

  const requiredConsentIds = [
    "crewApplyTerms",
    "crewApplyPrivacy",
    "crewApplySettlementPolicy",
    "crewApplyAdDisclosure",
    "crewApplyAdvertisingGuide",
  ];
  const consentAllControls = loginHtml.match(/id="crewApplyConsentAll"[^>]*aria-controls="([^"]+)"/);
  assert.ok(consentAllControls, "required consent select-all control is missing");
  assert.deepEqual(consentAllControls[1].split(/\s+/), requiredConsentIds);
  for (const consentId of requiredConsentIds) {
    assert.match(loginHtml, new RegExp(`id="${consentId}"[^>]*required`), `${consentId}: required consent is missing`);
  }
  assert.match(loginHtml, /consentAllInput\.addEventListener\("change"/);
  assert.match(loginHtml, /input\.checked = consentAllInput\.checked/);
  assert.match(loginHtml, /consentAllInput\.indeterminate = partiallyChecked/);
  assert.doesNotMatch(loginHtml, /id="crewServiceNotice"|SERVICE_NOTICE_KEY/);
  assert.match(loginHtml, /id="crewId"/);
  assert.match(loginHtml, /승인 후 전용 링크 발급/);
  assert.match(loginHtml, /계약·인도 완료 건당 20~45만원/);
});

test("crew surfaces expose the same quick guide PDF", () => {
  const surfaces = [
    ["crew/index.html", "../assets/crew-docs/recar-crew-quick-guide-20261014.pdf"],
    ["crew/login.html", "../assets/crew-docs/recar-crew-quick-guide-20261014.pdf"],
    ["crew/njob/index.html", "../../assets/crew-docs/recar-crew-quick-guide-20261014.pdf"],
    ["crew/guide/index.html", "/assets/crew-docs/recar-crew-quick-guide-20261014.pdf"],
    ["crew/welcome.html", "../assets/crew-docs/recar-crew-quick-guide-20261014.pdf"],
    ["crew/policy.html", "../assets/crew-docs/recar-crew-quick-guide-20261014.pdf"],
  ];

  for (const [relativePath, expectedHref] of surfaces) {
    const html = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    const matchingAnchors = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g)]
      .filter((match) => /빠르게 리카 알아보기/.test(match[0]));

    assert.ok(matchingAnchors.length > 0, `${relativePath}: quick guide link is missing`);
    for (const anchor of matchingAnchors) {
      assert.equal(anchor[1], expectedHref, `${relativePath}: wrong PDF path`);
      assert.match(anchor[0], /\sdownload(?:\s|>)/, `${relativePath}: download attribute is missing`);
    }
  }

  const pdfPath = path.join(rootDir, "assets/crew-docs/recar-crew-quick-guide-20261014.pdf");
  const pdf = fs.readFileSync(pdfPath);
  assert.ok(pdf.length > 10_000, "quick guide PDF is truncated");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.subarray(-100).toString().includes("%%EOF"), "quick guide PDF is incomplete");
});

test("crew referral surfaces disclose commission relationships", () => {
  const surfaces = [
    "crew/index.html",
    "crew/login.html",
    "crew/njob/index.html",
    "crew/guide/index.html",
  ];

  for (const relativePath of surfaces) {
    const html = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    assert.match(html, /RE:CAR 크루 활동의 일환으로/, `${relativePath}: crew relationship disclosure is missing`);
    assert.match(html, /수수료를 지급(?:합니다|받습니다)/, `${relativePath}: commission disclosure is missing`);
  }

  for (const relativePath of ["crew/login.html", "crew/njob/index.html", "crew/guide/index.html"]) {
    const html = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    assert.match(html, /고객에게 크루 추천 수수료를 별도로 청구하지 않습니다/, `${relativePath}: customer fee clarification is missing`);
  }
});

test("trust update preserves the original guide and consent PDF bytes", () => {
  for (const [file, expected] of [
    ["crew/friends/recar-friends-terms-v1.3.pdf", "48c3f29502436d7c844cea8f22a388d2c1aae3831b716dfd9c589b488f361d96"],
    ["assets/crew-docs/recar-crew-quick-guide.pdf", "6f391a80d8c51f5878a8711e3c2dcb5526287e5e1ed3215525acd7987ba14731"],
  ]) assert.equal(createHash("sha256").update(fs.readFileSync(path.join(rootDir, file))).digest("hex"), expected, file);
});

test("approved terms addendum stays an unpublished preview with a matching digest", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "docs/verification/crew-terms-v14-preview.json"), "utf8"));
  const preview = fs.readFileSync(path.join(rootDir, manifest.preview_path));
  assert.equal(manifest.state, "UNPUBLISHED_PREVIEW");
  assert.equal(manifest.publication_effective_at, null);
  assert.equal(manifest.original_pages_preserved, 16);
  assert.equal(manifest.original_page_content_streams_and_text_unchanged, true);
  assert.equal(manifest.preview_pages, 17);
  assert.deepEqual(manifest.sections, { terms: 1, privacy: 9, settlement: 7, disclosure: 16, advertising: 16 });
  assert.equal(createHash("sha256").update(preview).digest("hex"), manifest.preview_sha256);
  assert.equal(fs.existsSync(path.join(rootDir, "crew/friends/recar-friends-terms-v1.4.pdf")), false);
});

test("trust information and versioned guide are public without exposing source files", async () => {
  const server = await startServer("production");
  try {
    for (const file of ["/crew/welcome.html", "/crew/policy.html", "/crew/trust.css", "/assets/crew-docs/recar-crew-quick-guide-20261014.pdf", "/crew/friends/recar-friends-terms-v1.4-preview.pdf"]) {
      assert.equal((await fetch(`${server.baseUrl}${file}`)).status, 200, file);
    }
    assert.equal((await fetch(`${server.baseUrl}/tools/build-crew-quick-guide.py`)).status, 404);
    assert.equal((await fetch(`${server.baseUrl}/tools/build-crew-terms-preview.py`)).status, 404);
    assert.equal((await fetch(`${server.baseUrl}/docs/verification/crew-terms-v14-preview.json`)).status, 404);
    assert.equal((await fetch(`${server.baseUrl}/crew/friends/recar-friends-terms-v1.4.pdf`)).status, 404);
    const root = await fetch(`${server.baseUrl}/crew`, { redirect: "manual" });
    assert.equal(root.headers.get("location"), "/crew/welcome.html");
    const apply = await fetch(`${server.baseUrl}/crew/?action=apply&ref=RC-QA1234`, { redirect: "manual" });
    assert.equal(apply.headers.get("location"), "/crew/login.html?action=apply");
  } finally { await server.stop(); }
});
