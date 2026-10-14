const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const zlib = require("node:zlib");

// Read-only comparison server: identical gzip and cache policy for both builds.
const root = fs.realpathSync(process.argv[2]);
const port = Number(process.argv[3]);
const files = new Map();
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".otf": "font/otf", ".ttf": "font/ttf", ".wasm": "application/wasm" };
http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); } catch { response.writeHead(400).end(); return; }
  if (!pathname.startsWith("/app/")) { response.writeHead(404).end(); return; }
  const filename = path.resolve(root, `.${pathname === "/app/" ? "/app/index.html" : pathname}`);
  if (!filename.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end(); return; }
  try {
    if (!files.has(filename)) {
      const content = fs.readFileSync(filename);
      files.set(filename, { content, gzip: zlib.gzipSync(content) });
    }
    const file = files.get(filename);
    const gzip = /\bgzip\b/.test(request.headers["accept-encoding"] || "");
    const body = gzip ? file.gzip : file.content;
    response.writeHead(200, { "Content-Type": types[path.extname(filename)] || "application/octet-stream", "Cache-Control": "public, max-age=600", Vary: "Accept-Encoding", "Content-Length": body.length, ...(gzip ? { "Content-Encoding": "gzip" } : {}) }).end(body);
  } catch { response.writeHead(404).end(); }
}).listen(port, "127.0.0.1", () => console.log(`app performance preview: http://127.0.0.1:${port}/app/`));
