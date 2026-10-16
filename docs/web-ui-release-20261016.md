# 2026-10-16 Homepage UI Release

## Scope

- Publish the verified vehicle-detail, price-transition and login-decoration
  cleanup to the existing homepage, `/app/` and `/inquiry/` entries.
- Release build ID: `web-login-clean-20261016`.
- Base: `205a39c76c01851e3273530c1160c0ca27602172`.
- UI source changes through `6c557923`; branch `codex/web-ui-release-20261016`.
- No API, database, pricing formula, saved quote, native store release or Crew
  attribution changes are included.

## Kakao Gate

The full Kakao web-login implementation remains in draft PR #22. The production
API host has no configured `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET` or explicit
web redirect setting. Do not publish that client before its server and provider
configuration are ready. This UI-only release preserves the prior authentication
flow; it does not claim that Kakao login is repaired.

## Checks

Run the production build, Crew regressions and main/app/inquiry entry tests.
Merge only after PR checks pass, and verify the GitHub Pages deployment and live
build ID afterward. See `vehicle-detail-cleanup-20261016.md` for prior visual and
price-response evidence.

## Rollback

Revert the release PR through a new reviewed commit and publish through the same
Pages workflow. Preserve referral query parameters and all existing Crew pages.
Do not reset the main branch, delete stored data or run database migrations.
