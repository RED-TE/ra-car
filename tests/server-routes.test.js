const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { test } = require("node:test");

const rootDir = path.resolve(__dirname, "..");

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
      "/crew/start/",
      "/crew/start/preview/",
      "/crew/guide/preview/",
      "/crew/knowledge/preview/",
    ];

    for (const pathname of routes) {
      const response = await fetch(`${server.baseUrl}${pathname}`);
      assert.equal(response.status, 200, pathname);
      const html = await response.text();
      if (pathname.startsWith("/crew/start")) {
        assert.match(html, /RE:CAR 크루 스타터 가이드/, pathname);
      } else {
        assert.match(html, /RE:CAR 크루 안내서/, pathname);
      }
    }

    const crewResponse = await fetch(`${server.baseUrl}/crew/`);
    assert.equal(crewResponse.status, 200);
    assert.doesNotMatch(await crewResponse.text(), /crew-guide-link/);

    const guideResponse = await fetch(`${server.baseUrl}/crew/guide/`);
    assert.match(await guideResponse.text(), /href="\/crew\/start\/"/);

    const startResponse = await fetch(`${server.baseUrl}/crew/start/`);
    assert.match(await startResponse.text(), /href="\/crew\/guide\/"/);

    for (const pathname of [
      "/crew/guide/knowledge.css",
      "/crew/guide/knowledge.js",
      "/crew/guide/knowledge-data.js",
      "/crew/guide/lucide.min.js",
      "/crew/start/start.css",
      "/crew/start/start.js",
      "/assets/crew-knowledge/hero-car-1600.webp",
    ]) {
      const response = await fetch(`${server.baseUrl}${pathname}`);
      assert.equal(response.status, 200, pathname);
    }
  } finally {
    await server.stop();
  }
});

test("production keeps the public route and returns 404 for preview", async () => {
  const server = await startServer("production");
  try {
    const publicResponse = await fetch(`${server.baseUrl}/crew/guide/`);
    const previewResponse = await fetch(`${server.baseUrl}/crew/guide/preview/`);
    const startResponse = await fetch(`${server.baseUrl}/crew/start/`);
    const startPreviewResponse = await fetch(`${server.baseUrl}/crew/start/preview/`);
    assert.equal(publicResponse.status, 200);
    assert.equal(previewResponse.status, 404);
    assert.equal(startResponse.status, 200);
    assert.equal(startPreviewResponse.status, 404);
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
