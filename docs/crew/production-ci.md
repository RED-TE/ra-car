# Crew production CI boundary

The public site's Pages release and the `/crew/*` Worker release are independent.
The active Crew deployment is `recar-crew-entry`; Pages must not compare its legacy
`crew/session.js` with the new dashboard's modules.

`npm run verify:crew:production -- --expect-local` now checks the approved Worker
contract in `tools/crew-worker-release.json`. It verifies the manifest's exact
SHA-256, source/legacy commit identifiers, every served file's bytes and release
header, required screen markers, MIME/cache protections, and canonical entry,
application, referral, guide and N-job redirects. The intentionally redirected
`crew/njob/index.html` is checked as a redirect, rather than a served file.
Manifest paths, file counts and streamed response sizes are bounded. A missing
Worker release header cannot silently fall back to the legacy Pages contract.

The legacy Pages verifier remains covered by isolated fixtures. `--routing-only`
still checks the shared route boundary before a Pages deployment. For the Worker,
`--expect-local` validates the pinned deployed Worker manifest, independently of
local legacy Pages bytes. For the legacy fixture it retains the session.js hash
comparison. This does not deploy either site or run authenticated business flows.

## Updating the approved release

After a separately authorized Worker deployment, confirm its public manifest and
all asset hashes against that release's build output, then review changes to:

- `source_sha`: exact Crew source commit
- `legacy_sha`: exact public-site commit preserving the guide and agreement
- `manifest_sha256`: SHA-256 of the exact published `release-manifest.json` bytes

Do not update the pin merely to silence a failed check. Review the new release
and agreement bytes first. Push this contract change on a feature branch and run
the PR workflow; do not merge or redeploy automatically.

`crew-checks.yml` runs the public release verifier in a separate read-only job.
It needs no secrets, login, production database access, quote calls, settlement or
reward writes. The existing local browser regressions remain enabled.
