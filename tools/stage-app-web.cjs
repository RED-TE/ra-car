const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { syncAppEntrypoints } = require("./sync-app-entrypoints.cjs");
const root = path.resolve(__dirname, "..");
const config = require("../web_app/source.json");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function stage(appRoot) {
  if (!appRoot) throw new Error("Pass the prepared Flutter app directory after tests and release build");
  const built = path.join(appRoot, "build/web");
  const pin = JSON.parse(fs.readFileSync(path.join(appRoot, "../source-pin.json"), "utf8"));
  if (pin.commit !== config.commit || pin.buildId !== config.buildId) throw new Error("Source pin mismatch");
  if (pin.patchSha256 !== hash(path.join(root, "web_app/patches/runtime.patch"))) throw new Error("Patch changed; prepare and rebuild before staging");
  const manifest = JSON.parse(fs.readFileSync(path.join(built, "assets/FontManifest.json"), "utf8"));
  const font = manifest.find(family => family.family === "Pretendard");
  if (font?.fonts.length !== 1 || !font.fonts[0].asset.endsWith("PretendardVariable.ttf")) throw new Error("Variable font missing");
  if (hash(path.join(built, "assets", font.fonts[0].asset)) !== config.font.sha256) throw new Error("Built font mismatch");
  if (config.garageArtwork && hash(path.join(built, "assets", config.garageArtwork.target)) !== config.garageArtwork.sha256) throw new Error("Built garage artwork mismatch");
  if (!fs.readFileSync(path.join(built, "index.html"), "utf8").includes('__RECAR_BUILD_ID__')) throw new Error("Custom web loader missing");
  const entry = "서류 제출까지 직접 신청하기".replace(/[^\x00-\x7f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  if (!fs.readFileSync(path.join(built, "main.dart.js"), "utf8").includes(entry)) throw new Error("Document entry missing");
  const target = path.join(root, "app");
  // Overwrite generated build files only; never remove existing assets or backups.
  fs.cpSync(built, target, { recursive: true });
  for (const file of ["index.html", "flutter_bootstrap.js"]) {
    const filename = path.join(target, file);
    fs.writeFileSync(filename, fs.readFileSync(filename, "utf8").replaceAll("__RECAR_BUILD_ID__", config.buildId));
  }
  fs.copyFileSync(path.join(root, "web_app/assets/fonts/LICENSE.txt"), path.join(target, "assets/assets/fonts/pretendard/LICENSE.txt"));
  const notices = path.join(target, "assets/NOTICES");
  fs.writeFileSync(notices, fs.readFileSync(notices, "utf8").replace(/[ \t]+$/gm, ""));
  const files = ["index.html", "flutter_bootstrap.js", "main.dart.js", "assets/FontManifest.json", "assets/AssetManifest.bin.json"];
  const metadata = {
    source_repository: config.repository, source_commit: config.commit,
    web_source_patch_sha256: hash(path.join(root, "web_app/patches/runtime.patch")),
    build_id: config.buildId, target: "https://recarplan.com/app/", base_path: config.basePath,
    api_base_url: "https://api.recarplan.com", flutter_version: "3.41.1",
    native_app_modified: false,
    ...(config.garageArtwork ? { garage_artwork_sha256: config.garageArtwork.sha256 } : {}),
    validation: "See docs/app-web-price-garage-release-20261021.md, docs/app-web-new3-catalog-20261015.md and docs/app-web-speed-documents-20261015.md; local evidence is not deployment proof",
    sha256: Object.fromEntries(files.map(file => [file, hash(path.join(target, file))])),
  };
  fs.writeFileSync(path.join(target, "release.json"), JSON.stringify(metadata, null, 2) + "\n");
  syncAppEntrypoints(root);
  return metadata;
}
if (require.main === module) console.log(JSON.stringify(stage(process.argv[2]), null, 2));
module.exports = { stage };
