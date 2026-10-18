const ENTRY_PATHS = new Map([
  ["/crew", false],
  ["/crew/", false],
  ["/crew/login", true],
  ["/crew/login/", true],
]);
const SESSION_NOTICES = new Set(["PENDING", "REJECTED", "SUSPENDED", "NOT_APPLIED", "EXPIRED", "LOGGED_OUT"]);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== "recarplan.com" || !ENTRY_PATHS.has(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const login = ENTRY_PATHS.get(url.pathname);
    const target = new URL(login ? "/crew/login.html" : "/crew/welcome.html", "https://recarplan.com");
    const ref = url.searchParams.get("ref")?.trim().toUpperCase();
    if (url.searchParams.get("action") === "apply" || url.searchParams.get("mode") === "apply") {
      target.pathname = "/crew/login.html";
      target.searchParams.set("action", "apply");
    } else if (ref && /^RC-[A-Z0-9]{4,16}$/.test(ref)) {
      target.pathname = "/app/";
      target.searchParams.set("ref", ref);
    } else if (login && SESSION_NOTICES.has(url.searchParams.get("status"))) {
      target.searchParams.set("status", url.searchParams.get("status"));
    }

    // Never fetch the cached login document or redirect to its extensionless URL.
    return new Response(null, { status: 302, headers: {
      Location: target.href,
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
    } });
  },
};
