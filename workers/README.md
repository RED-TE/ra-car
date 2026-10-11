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
