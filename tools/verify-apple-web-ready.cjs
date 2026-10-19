const crypto = require("node:crypto");

const endpoint = "https://api.recarplan.com/api/v1/auth/apple/start";
const redirects = ["https://recarplan.com/", "https://recarplan.com/app/"];

async function verify({ fetchImpl = fetch } = {}) {
  const checked = [];
  for (const redirect of redirects) {
    const challenge = crypto.createHash("sha256").update(crypto.randomBytes(48)).digest("base64url");
    const response = await fetchImpl(endpoint, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ platform: "web", redirect_uri: redirect, code_challenge: challenge }),
    });
    if (!response.ok) throw new Error(`Apple web API unavailable: HTTP ${response.status}`);
    if (!/\bno-store\b/i.test(response.headers.get("cache-control") || "")) throw new Error("Apple web response must not be cached");
    const data = await response.json();
    if (data.client_id !== "com.johongcheol.recarapp.web" || data.redirect_uri !== redirect ||
      typeof data.state !== "string" || !data.state || typeof data.nonce !== "string" || !data.nonce) {
      throw new Error("Apple web login contract is invalid");
    }
    checked.push({ redirect, status: response.status });
  }
  return checked;
}

if (require.main === module) {
  verify().then(checked => console.log(JSON.stringify({ checked }))).catch(() => {
    console.error("Apple API/configuration is not ready. Stop web deployment; no login tokens were exchanged.");
    process.exitCode = 1;
  });
}

module.exports = { verify };
