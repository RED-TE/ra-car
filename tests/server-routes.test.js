const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { test } = require("node:test");

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
    assert.match(crewHtml, /target\.searchParams\.set\("ref", referralCode\)/);
    assert.doesNotMatch(crewHtml, /vercel\.app/);

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

test("production keeps the public route and returns 404 for preview", async () => {
  const server = await startServer("production");
  try {
    const publicResponse = await fetch(`${server.baseUrl}/crew/guide/`);
    const previewResponse = await fetch(`${server.baseUrl}/crew/guide/preview/`);
    const removedStartResponse = await fetch(`${server.baseUrl}/crew/start/`);
    assert.equal(publicResponse.status, 200);
    assert.equal(previewResponse.status, 404);
    assert.equal(removedStartResponse.status, 404);
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
  assert.match(loginHtml, /id="crewServiceNotice"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(loginHtml, /크루 가입 신청이[\s\S]*정상화되었습니다/);
  assert.match(loginHtml, /일부 가입 신청이 원활하지 않았습니다/);
  assert.match(loginHtml, /id="crewServiceNoticeDismiss"[^>]*>다시 보지 않기</);
  assert.match(loginHtml, /id="crewServiceNoticeClose"[^>]*aria-label="가입 신청 정상화 안내 닫기"/);
  assert.match(loginHtml, /localStorage\.setItem\(SERVICE_NOTICE_KEY, "dismissed"\)/);
});

test("crew surfaces expose the same quick guide PDF", () => {
  const surfaces = [
    ["crew/index.html", "../assets/crew-docs/recar-crew-quick-guide.pdf"],
    ["crew/login.html", "../assets/crew-docs/recar-crew-quick-guide.pdf"],
    ["crew/njob/index.html", "../../assets/crew-docs/recar-crew-quick-guide.pdf"],
    ["crew/guide/index.html", "/assets/crew-docs/recar-crew-quick-guide.pdf"],
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

  const pdfPath = path.join(rootDir, "assets/crew-docs/recar-crew-quick-guide.pdf");
  assert.ok(fs.statSync(pdfPath).size > 1_000_000, "quick guide PDF is unexpectedly small");
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
    assert.match(html, /수수료가 지급될 수 있습니다/, `${relativePath}: commission disclosure is missing`);
  }

  for (const relativePath of ["crew/login.html", "crew/njob/index.html", "crew/guide/index.html"]) {
    const html = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    assert.match(html, /고객에게 별도 수수료를 청구하는 구조/, `${relativePath}: customer fee clarification is missing`);
  }
});
