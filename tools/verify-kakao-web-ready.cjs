const crypto = require("node:crypto");

const endpoint = "https://api.recarplan.com/api/v1/users/oauth/kakao/web/start";
const redirects = ["https://recarplan.com/", "https://recarplan.com/app/"];

async function verify({ fetchImpl = fetch } = {}) {
  const checked = [];
  for (const redirect of redirects) {
    const challenge = crypto.createHash("sha256").update(crypto.randomBytes(48)).digest("base64url");
    const response = await fetchImpl(endpoint, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ redirect_uri: redirect, code_challenge: challenge }),
    });
    if (!response.ok) throw new Error(`Kakao web API unavailable for ${redirect}: HTTP ${response.status}`);
    if (!/\bno-store\b/i.test(response.headers.get("cache-control") || "")) throw new Error("Kakao web start response must not be cached");
    let data;
    let url;
    try {
      data = await response.json();
      url = new URL(data.authorization_url);
    } catch {
      throw new Error("Kakao web start response is invalid");
    }
    if (data.app_id !== 1451784 || url.origin !== "https://kauth.kakao.com" || url.pathname !== "/oauth/authorize" || url.username || url.password ||
        !data.state || url.searchParams.get("state") !== data.state ||
        url.searchParams.get("redirect_uri") !== redirect ||
        url.searchParams.get("code_challenge") !== challenge || url.searchParams.get("code_challenge_method") !== "S256" ||
        url.searchParams.get("response_type") !== "code" || !url.searchParams.get("client_id") ||
        url.searchParams.has("client_secret") || url.searchParams.has("code_verifier")) {
      throw new Error("Kakao web authorization contract is invalid");
    }
    checked.push({ redirect, status: response.status });
  }
  return checked;
}

if (require.main === module) {
  verify().then(checked => console.log(JSON.stringify({ checked }))).catch(() => {
    // Never print provider URLs, signed state, credentials or remote response bodies.
    console.error("Kakao web API is not ready. Stop web deployment; verify API/configuration first.");
    process.exitCode = 1;
  });
}

module.exports = { verify };
