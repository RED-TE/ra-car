const { defineConfig } = require("@playwright/test");
const base = require("./playwright.config");

module.exports = defineConfig({
  ...base,
  webServer: undefined,
  use: { ...base.use, baseURL: process.env.RECAR_TEST_URL || "http://127.0.0.1:4176" },
});
