const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const config = require("../web_app/source.json");
const [sourceRepo, modifiedRoot] = process.argv.slice(2);
if (!sourceRepo || !modifiedRoot) throw new Error("Pass source repository and modified extraction root");
const newFiles = ["app/lib/services/kakao_web_browser.dart", "app/lib/services/kakao_web_browser_stub.dart", "app/lib/services/kakao_web_browser_web.dart", "app/lib/services/kakao_web_login.dart"];
const files = ["app/lib/main.dart", "app/lib/services/application_api.dart", "app/lib/screens/application_documents_screen.dart", "app/lib/screens/quote_result_screen.dart", "app/lib/screens/auth_screen.dart", "app/lib/services/api_client.dart", "app/lib/services/vehicle_api.dart", "app/lib/services/vehicle_cache.dart", "app/lib/services/quote_api.dart", "app/lib/screens/home_screen.dart", "app/lib/screens/recommendation_screen.dart", "app/lib/screens/vehicle_list_screen.dart", "app/lib/screens/vehicle_detail_screen.dart", "app/lib/widgets/recar_loading_state.dart", "app/lib/widgets/micro_interactions.dart", "app/pubspec.yaml", "app/pubspec.lock", ...newFiles];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "recar-patch-input-"));
let patch = "";
for (const [index, file] of files.entries()) {
  const baseline = path.join(temporary, String(index));
  const isNew = newFiles.includes(file);
  fs.writeFileSync(baseline, isNew ? "" : execFileSync("git", ["-C", sourceRepo, "show", `${config.commit}:${file}`]));
  try {
    patch += execFileSync("diff", ["-u", "--label", isNew ? "/dev/null" : `a/${file}`, "--label", `b/${file}`, baseline, path.join(modifiedRoot, file)], { encoding: "utf8" });
  } catch (error) {
    if (error.status !== 1) throw error;
    patch += error.stdout;
  }
}
fs.writeFileSync(path.join(root, "web_app/patches/runtime.patch"), patch);
console.log({ patchBytes: Buffer.byteLength(patch), files });
