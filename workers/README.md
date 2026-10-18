# Individual crew referral paths

`crew-referral.mjs` redirects legacy `/r/RC-<code>` links to
`https://recarplan.com/app/?ref=RC-<code>`. It returns a temporary, non-cached
302 redirect so existing shared links keep their referral code while using
the web app rather than a second copy of the homepage.

Verify the deployed `/app/` build handles `ref` before publishing this Worker
to `recarplan.com/r/*`. The current app source uses `WebReferralService` for
capture and attribution. Updating this Worker does not deploy or rebuild the
Flutter app. Keep unrelated `/_next/*` and friends-proxy routes unchanged.

After approved deployment, verify GET and HEAD return the expected Location,
invalid codes return 404, and unsupported methods return 405. In a dedicated
test environment, verify the web app captures the code and attributes an
inquiry to the correct crew account. A redirect check alone does not prove
inquiry attribution or reward eligibility; those need separate verification.

## Crew login entry protection

`crew-entry.mjs` and `wrangler-crew-entry.jsonc` cover only the four exact
extensionless Crew entry/login paths. They redirect to the published static
HTML screens and never fetch the cached Next login page. This prevents a
saved login from repeatedly navigating back to the same `/crew/` document.
Application intent, validated referral codes and supported session notices
are retained; arbitrary destinations and credentials are not forwarded.
Cloudflare matches exact routes against the full URL, including the query
string. Entries with query strings therefore continue through the existing
static site's application/referral handling; no wildcard route is added.
See https://developers.cloudflare.com/workers/configuration/routing/routes/#matching-behavior.

Deploy only after approval with `wrangler deploy --config workers/wrangler-crew-entry.jsonc`.
This must not replace the referral Worker or routes for APIs, `/_next`, the
dashboard HTML, N-job or guide. Verify GET/HEAD, application mode and login
after deployment. To roll back, restore the previous bindings on these exact
four routes; do not alter unrelated Worker routes or clear customer storage.
