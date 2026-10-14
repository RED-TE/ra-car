import fs from "node:fs";

export async function measureAppLoading(task, output) {
  const page = task.page("p1");
  const injection = await page.cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: 'window.addEventListener("flutter-first-frame", () => { window.__recarFirstFrame = performance.now(); }, { once: true });',
  });
  await page.cdp("Network.setCacheDisabled", { cacheDisabled: true });
  await page.cdp("Network.emulateNetworkConditions", {
    offline: false, latency: 150, downloadThroughput: 625000,
    uploadThroughput: 125000, connectionType: "cellular4g",
  });
  const samples = [];
  try {
    for (let round = 1; round <= 3; round += 1) {
      for (const [version, port] of [["before", 3350], ["after", 3351]]) {
        await page.goto(`http://127.0.0.1:${port}/app/`);
        await page.waitForFunction(() => window.__recarFirstFrame > 0, undefined, { timeout: 90000 });
        await page.waitForFunction(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/api/v1/home-pick")), undefined, { timeout: 60000 });
        const sample = await page.evaluate(() => {
          const resources = performance.getEntriesByType("resource");
          const fonts = resources.filter((entry) => /\/fonts\/|CupertinoIcons/.test(entry.name));
          const core = resources.find((entry) => entry.name.includes("main.dart.js"));
          const home = resources.find((entry) => entry.name.includes("/api/v1/home-pick"));
          return {
            firstFrameMs: Math.round(window.__recarFirstFrame),
            homeDataReadyMs: Math.round(home.responseEnd),
            mainStartMs: Math.round(core.startTime),
            fontBytes: fonts.reduce((sum, entry) => sum + entry.transferSize, 0),
            fontRequests: fonts.length,
            coreRequests: resources.filter((entry) => entry.name.includes("main.dart.js")).length,
            resources: resources.map((entry) => ({ name: entry.name, start: Math.round(entry.startTime), end: Math.round(entry.responseEnd), bytes: entry.transferSize })),
          };
        });
        samples.push({ version, round, ...sample });
        console.log(JSON.stringify({ version, round, ...sample, resources: undefined }));
      }
    }
  } finally {
    await page.cdp("Page.removeScriptToEvaluateOnNewDocument", { identifier: injection.identifier });
    await page.cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.cdp("Network.setCacheDisabled", { cacheDisabled: false });
  }
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const summary = Object.fromEntries(["before", "after"].map((version) => {
    const group = samples.filter((sample) => sample.version === version);
    return [version, {
      firstFrameMs: median(group.map((sample) => sample.firstFrameMs)),
      homeDataReadyMs: median(group.map((sample) => sample.homeDataReadyMs)),
      fontBytes: median(group.map((sample) => sample.fontBytes)),
    }];
  }));
  const report = { measuredAt: new Date().toISOString(), environment: "same desktop browser, cold HTTP cache, local gzip server, 5 Mbps download, 150 ms latency, real production API; not deployed performance", samples, summary };
  fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify(summary));
  return report;
}
