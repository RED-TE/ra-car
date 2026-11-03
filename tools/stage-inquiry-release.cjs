const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const excluded = new Set(["node_modules", "test-results", "playwright-report", "artifacts", ".git", ".github", "docs", "tools", "tests", "web_app"]);
const previewPdf = "crew/friends/recar-friends-terms-v1.4-preview.pdf";
const sourceOnlyChanges = new Set(["server.js", "package.json", "package-lock.json"]);
const publicFile = name => !excluded.has(name.split("/")[0]) && name !== previewPdf;
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function stageInquiryRelease({ root, base, out }) {
  root = path.resolve(root);
  out = path.resolve(out);
  if (fs.existsSync(out)) throw new Error("OUTPUT_ALREADY_EXISTS");
  if (!/^[a-f0-9]{40}$/.test(base || "")) throw new Error("BASE_COMMIT_INVALID");
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try { if (git(["rev-parse", `${base}^{commit}`]) !== base) throw new Error(); }
  catch { throw new Error("BASE_COMMIT_INVALID"); }
  const changed = git(["diff", "--name-only", "-z", base, "HEAD"]).split("\0").filter(Boolean);
  if (changed.some(name => publicFile(name) && !name.startsWith("inquiry/") && !sourceOnlyChanges.has(name))) {
    throw new Error("SCOPE_PUBLIC_CHANGE");
  }
  const listed = revision => git(["ls-tree", "-r", "--name-only", "-z", revision]).split("\0").filter(Boolean);
  const baseline = listed(base).filter(publicFile);
  const currentInquiry = listed("HEAD").filter(name => name.startsWith("inquiry/") && publicFile(name));
  if (!currentInquiry.includes("inquiry/index.html")) throw new Error("INQUIRY_ENTRY_MISSING");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "recar-inquiry-stage-"));
  try {
    const archive = path.join(temp, "baseline.tar"), source = path.join(temp, "baseline");
    fs.mkdirSync(source);
    const fd = fs.openSync(archive, "wx");
    try { execFileSync("git", ["archive", "--format=tar", base], { cwd: root, stdio: ["ignore", fd, "pipe"] }); }
    finally { fs.closeSync(fd); }
    execFileSync("tar", ["-xf", archive, "-C", source], { stdio: ["ignore", "ignore", "pipe"] });
    const copy = (fromRoot, name) => {
      const from = path.join(fromRoot, name), target = path.join(out, name);
      if (!fs.lstatSync(from).isFile()) throw new Error("SCOPE_SYMLINK_OR_NONFILE");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(from, target);
    };
    fs.mkdirSync(out, { recursive: true });
    // All non-inquiry bytes come from the already published base, not the branch.
    for (const name of baseline.filter(name => !name.startsWith("inquiry/"))) copy(source, name);
    // Only committed inquiry files may overlay the retained release.
    for (const name of currentInquiry) {
      const tracked = execFileSync("git", ["show", `HEAD:${name}`], { cwd: root, maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
      const local = path.join(root, name);
      if (!fs.lstatSync(local).isFile() || !fs.readFileSync(local).equals(tracked)) throw new Error("INQUIRY_WORKTREE_CHANGED");
      copy(root, name);
    }
    const unchanged = baseline.filter(name => !name.startsWith("inquiry/"));
    for (const name of unchanged) {
      if (hash(path.join(source, name)) !== hash(path.join(out, name))) throw new Error("BASE_FILE_CHANGED");
    }
    return { base, files: unchanged.length + currentInquiry.length, out, inquiryFiles: currentInquiry.length, unchangedFiles: unchanged.length };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    const base = args[args.indexOf("--base") + 1], out = args[args.indexOf("--out") + 1];
    if (!args.includes("--base") || !args.includes("--out") || !out) throw new Error("RELEASE_ARGUMENTS_INVALID");
    console.log(JSON.stringify(stageInquiryRelease({ root: path.resolve(__dirname, ".."), base, out })));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { stageInquiryRelease };
