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

    const homepage = new URL("/index.html", url);
    const response = await fetch(new Request(homepage, request));
    if (!response.ok || request.method === "HEAD") return response;

    return new HTMLRewriter()
      .on("head", {
        element(head) {
          head.prepend('<base href="/">', { html: true });
        },
      })
      .transform(response);
  },
};
