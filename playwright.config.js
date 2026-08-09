const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: {
    timeout: 8000,
  },
  outputDir: "test-results",
  reporter: [["list"]],
  webServer: {
    command: "node server.js --port 4175",
    url: "http://127.0.0.1:4175/crew/guide/preview/",
    reuseExistingServer: false,
    timeout: 120000,
  },
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
