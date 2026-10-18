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

## Release and recurrence safeguards

The static `crew/login.html`, `crew/index.html`, and `crew/welcome.html` are
the Crew screens. The administrator's `/crew` and `/crew/login` routes only
redirect to them. Do not restore the old login-only Next document or point a
post-login destination at the public `/crew/` alias.

`crew/login/index.html` is the static-origin fallback for `/crew/login/?...`:
exact Worker bindings do not match those query-bearing URLs. Keep this file
published along with the HTML screens. Do not add a broad `/crew*` Worker
route, which could capture assets, the guide, and dashboard requests.

Crew API reads use `cache: no-store`. Explicit account-status notices stop
automatic login resumption. A tab-local 30-second budget permits at most two
automatic dashboard transitions; it stores only a timestamp and count, not
credentials. If exhausted, the login form remains usable. A successful
manual login resets the budget. Never clear customer storage to repair a
deployment or retry form submissions automatically.

Every Pages release now checks the eight public route contracts before
publishing and then checks all three HTML screens, their session-script hash,
the script bytes, and query-bearing static fallbacks. A routing mismatch or
stale/mixed release fails the workflow instead of reporting success. These
checks are read-only and require no account tokens or customer submissions.

Manual verification commands:

```sh
npm run verify:crew:production -- --routing-only
npm run verify:crew:production -- --expect-local
```

If a pre-publish route check fails, fix only the approved entry bindings first.
If the post-publish check fails, do not announce the release as verified:
compare the failed route or script version, repair the responsible deployment,
and rerun the check. Do not republish an unrelated old worktree as a rollback.
Real account login, approval and inquiry attribution still need a separate
authorized end-to-end check; public HTTP checks do not prove those flows.
