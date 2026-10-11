const REFERRAL_PATH = /^\/r\/RC-[A-Z0-9]{4,16}\/?$/i;
export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    if (!REFERRAL_PATH.test(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    const code = url.pathname.split("/")[2].toUpperCase();
    return new Response(null, { status: 302, headers: { Location: `https://recarplan.com/app/?ref=${encodeURIComponent(code)}`, "Cache-Control": "no-store" } });
  },
};
