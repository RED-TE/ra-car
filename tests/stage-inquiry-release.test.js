const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { stageInquiryRelease } = require("../tools/stage-inquiry-release.cjs");

function write(root, file, body) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "recar-inquiry-stage-test-"));
  const root = path.join(directory, "repo");
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = message => git("-c", "user.name=Local Release Test", "-c", "user.email=local-test@example.invalid", "commit", "-m", message);
  git("init", "--initial-branch=main");
  const baseline = {
    "index.html": "baseline-app-entry",
    "app/index.html": "baseline-app",
    "app/assets/catalog.bin": Buffer.from([0, 255, 13, 10, 1]),
    "crew/welcome.html": "baseline-crew",
    "inquiry/index.html": "baseline-inquiry",
    "inquiry/catalog.mjs": "export const baseline = true;",
    "server.js": "baseline-server",
    "package.json": '{"name":"baseline"}',
    "package-lock.json": '{"lockfileVersion":3}',
    "tools/private.cjs": "not-public-tool",
    "tests/private.test.js": "not-public-test",
    "docs/private.md": "not-public-doc",
    "web_app/private.dart": "not-public-native-source",
    ".github/workflows/pages.yml": "not-public-workflow",
    ".gitignore": ".env*\nsecret/\nnode_modules/\n",
  };
  for (const [file, body] of Object.entries(baseline)) write(root, file, body);
  git("add", ".");
  commit("Baseline public release fixture");
  const base = git("rev-parse", "HEAD");
  git("checkout", "-b", "codex/inquiry-fixture");
  write(root, "inquiry/index.html", "current-inquiry");
  write(root, "inquiry/style.css", ".inquiry{color:blue}");
  write(root, "server.js", "branch-server-must-not-replace-baseline");
  write(root, "package.json", '{"name":"branch-must-not-replace-baseline"}');
  git("add", ".");
  commit("Only inquiry changes enter the staged release");
  write(root, ".env.local", "TEST_ONLY_SECRET");
  write(root, "secret/ignored.txt", "TEST_ONLY_SECRET");
  write(root, "inquiry/untracked-private.txt", "TEST_ONLY_SECRET");
  const out = name => path.join(directory, name);
  return { root, base, baseline, out, git, commit };
}

const digest = bytes => createHash("sha256").update(bytes).digest("hex");

test("inquiry-only release overlays tracked inquiry files while retaining exact baseline app, crew and server bytes", t => {
  const sample = fixture(t), out = sample.out("release");
  const result = stageInquiryRelease({ root: sample.root, base: sample.base, out });
  assert.equal(result.base, sample.base);
  assert.equal(result.out, out);
  assert.equal(fs.readFileSync(path.join(out, "inquiry/index.html"), "utf8"), "current-inquiry");
  assert.equal(fs.readFileSync(path.join(out, "inquiry/style.css"), "utf8"), ".inquiry{color:blue}");
  for (const file of ["index.html", "app/index.html", "app/assets/catalog.bin", "crew/welcome.html", "server.js", "package.json", "package-lock.json"]) {
    assert.equal(digest(fs.readFileSync(path.join(out, file))), digest(sample.baseline[file]), file);
  }
  for (const file of [".git", ".github", "tools", "tests", "docs", "web_app", "node_modules", ".env.local", "secret", "inquiry/untracked-private.txt"]) {
    assert.equal(fs.existsSync(path.join(out, file)), false, file);
  }
});

test("public changes outside inquiry are rejected instead of entering a limited release", t => {
  const sample = fixture(t);
  for (const file of ["index.html", "app/index.html", "crew/welcome.html"]) {
    write(sample.root, file, "unexpected-public-change");
    sample.git("add", file);
    sample.commit(`Unexpected public branch change in ${file}`);
    try {
      assert.throws(() => stageInquiryRelease({ root: sample.root, base: sample.base, out: sample.out(`rejected-${file.replaceAll("/", "-")}`) }), /SCOPE_PUBLIC_CHANGE/);
    } finally {
      write(sample.root, file, sample.baseline[file]);
      sample.git("add", file);
      sample.commit(`Restore baseline ${file}`);
    }
  }
});

test("an existing output and an invalid baseline are refused without overwriting files", t => {
  const sample = fixture(t), existing = sample.out("existing");
  fs.mkdirSync(existing);
  write(existing, "preserve.txt", "preserve-existing-output");
  assert.throws(() => stageInquiryRelease({ root: sample.root, base: sample.base, out: existing }));
  assert.equal(fs.readFileSync(path.join(existing, "preserve.txt"), "utf8"), "preserve-existing-output");
  assert.throws(() => stageInquiryRelease({ root: sample.root, base: "f".repeat(40), out: sample.out("invalid-base") }));
  assert.throws(() => stageInquiryRelease({ root: sample.root, base: "HEAD^{tree}", out: sample.out("invalid-tree") }));
});

test("a tracked inquiry path replaced with a symlink cannot publish data from outside the checkout", t => {
  const sample = fixture(t), target = sample.out("outside-private.txt");
  fs.writeFileSync(target, "TEST_ONLY_SECRET");
  fs.unlinkSync(path.join(sample.root, "inquiry/style.css"));
  fs.symlinkSync(target, path.join(sample.root, "inquiry/style.css"));
  assert.throws(() => stageInquiryRelease({ root: sample.root, base: sample.base, out: sample.out("symlink-release") }), /INQUIRY_WORKTREE_CHANGED|SYMLINK/i);
});
