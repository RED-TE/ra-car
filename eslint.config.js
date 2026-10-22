const globals = require("globals");

module.exports = [
  {
    ignores: [
      "app/**",
      "artifacts/**",
      "assets/**",
      "data/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "crew/guide/lucide.min.js",
    ],
  },
  {
    files: ["crew/guide/knowledge.js", "crew/guide/knowledge-data.js", "crew/terms.js", "crew/session.js", "home.js", "inquiry/*.mjs", "landing/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-unreachable": "error",
    },
  },
  {
    files: ["tests/**/*.js", "tools/verify-crew-production.cjs", "tools/verify-kakao-web-ready.cjs", "playwright.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.browser,
        ...globals.node,
        fetch: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-unreachable": "error",
    },
  },
];
