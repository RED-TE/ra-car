const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const config = require("../web_app/source.json");

function prepare(sourceRepo, buildRoot) {
  if (!sourceRepo) throw new Error("Pass a local clone of RECAREA/recar_app");
  const resolved = execFileSync("git", ["-C", sourceRepo, "rev-parse", `${config.commit}^{commit}`], { encoding: "utf8" }).trim();
  if (resolved !== config.commit) throw new Error("Published source pin mismatch");
  const fontHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "web_app/assets/fonts/PretendardVariable.ttf"))).digest("hex");
  if (fontHash !== config.font.sha256) throw new Error("Font provenance mismatch");
  if (buildRoot && fs.existsSync(buildRoot)) throw new Error("Build root must be new; existing work is never overwritten");
  buildRoot = buildRoot || fs.mkdtempSync(path.join(os.tmpdir(), "recar-web-source-"));
  fs.mkdirSync(buildRoot, { recursive: true });
  const archive = path.join(buildRoot, "baseline.tar");
  execFileSync("git", ["-C", sourceRepo, "archive", "--format=tar", `--output=${archive}`, config.commit, "app"]);
  execFileSync("tar", ["-xf", archive, "-C", buildRoot]);
  const patch = path.join(root, "web_app/patches/runtime.patch");
  execFileSync("git", ["apply", "--check", patch], { cwd: buildRoot });
  execFileSync("git", ["apply", patch], { cwd: buildRoot });
  const appRoot = path.join(buildRoot, "app");
  fs.copyFileSync(path.join(root, "web_app/assets/fonts/PretendardVariable.ttf"), path.join(appRoot, "assets/fonts/pretendard/PretendardVariable.ttf"));
  for (const file of fs.readdirSync(path.join(root, "web_app/test"))) {
    if (file.endsWith(".dart")) fs.copyFileSync(path.join(root, "web_app/test", file), path.join(appRoot, "test", file));
  }
  let html = fs.readFileSync(path.join(root, "app/index.html"), "utf8");
  html = html.replace('<base href="/app/">', '<base href="$FLUTTER_BASE_HREF">')
    .replace(/\?build=[A-Za-z0-9._-]+/g, "?build=__RECAR_BUILD_ID__")
    .replace(/^.*<link rel="preload".*Pretendard[^\n]*\.otf[^\n]*\n/gm, "");
  if (!html.includes('href="assets/assets/fonts/pretendard/PretendardVariable.ttf"')) {
    html = html.replace('  <style>', '  <link rel="preload" href="assets/assets/fonts/pretendard/PretendardVariable.ttf" as="fetch" crossorigin>\n  <style>');
  }
  fs.writeFileSync(path.join(appRoot, "web/index.html"), html);
  const bootstrap = fs.readFileSync(path.join(root, "app/flutter_bootstrap.js"), "utf8");
  const position = bootstrap.indexOf("async function startRecar()");
  if (position < 0) throw new Error("Missing compatible loader wrapper");
  const startup = bootstrap.slice(position).replace(/\?build=[A-Za-z0-9._-]+/g, "?build=__RECAR_BUILD_ID__");
  fs.writeFileSync(path.join(appRoot, "web/flutter_bootstrap.js"), `{{flutter_js}}\n{{flutter_build_config}}\n${startup}`);
  const patchSha256 = crypto.createHash("sha256").update(fs.readFileSync(patch)).digest("hex");
  fs.writeFileSync(path.join(buildRoot, "source-pin.json"), JSON.stringify({ ...config, patchSha256 }, null, 2));
  return { buildRoot, appRoot, buildId: config.buildId };
}
if (require.main === module) console.log(JSON.stringify(prepare(...process.argv.slice(2))));
module.exports = { prepare };
