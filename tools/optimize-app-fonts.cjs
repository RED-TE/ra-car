const fs = require("node:fs");
const path = require("node:path");

function optimizeAppFonts(root = path.resolve(__dirname, "..")) {
  const appRoot = path.join(root, "app");
  const manifestPath = path.join(appRoot, "assets/FontManifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const compiledApp = fs.readFileSync(path.join(appRoot, "main.dart.js"), "utf8");
  // Keep original font files and every glyph. Drop only an unused legacy family.
  const removable = manifest.filter((family) => family.family === "SUIT" && !compiledApp.includes("SUIT"));
  const removedBytes = removable.flatMap((family) => family.fonts)
    .reduce((sum, font) => sum + fs.statSync(path.join(appRoot, "assets", font.asset)).size, 0);
  const optimized = manifest.filter((family) => !removable.includes(family));
  if (removable.length) fs.writeFileSync(manifestPath, JSON.stringify(optimized));
  return { removedFamilies: removable.map((family) => family.family), removedBytes };
}

if (require.main === module) console.log(JSON.stringify(optimizeAppFonts()));
module.exports = { optimizeAppFonts };
