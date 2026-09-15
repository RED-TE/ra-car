const REFERRAL_PATH = /^\/r\/RC-[A-Z0-9]{4,16}\/?$/i;
const HOMEPAGE_URL = "https://recarplan.com/index.html";

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    if (!REFERRAL_PATH.test(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    const response = await fetch(new Request(HOMEPAGE_URL, {
      method: request.method,
      headers: { Accept: "text/html" },
    }));
    if (!response.ok || request.method === "HEAD") return response;

    return new HTMLRewriter()
      .on("head", {
        element(head) {
          head.prepend('<base href="https://recarplan.com/">', { html: true });
        },
      })
      .transform(response);
  },
};
