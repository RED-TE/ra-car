# Promote the published app to the main website

## Scope

- Base: public website RED-TE/ra-car main at 74c577cc140cbd65a9380fcbe4cc8251d4b1215f.
- Serve the current Flutter web shell at `/` and `/inquiry/`, retaining `/app/`.
- `/inquiry/` is the existing route matching the user's approximate spelling.
- All three entries resolve the same assets under `/app/`; no redirect or second app build is introduced.
- Preserve query parameters, explicit referral codes and existing app attribution.
- Carry a valid legacy website referral into the app only when no newer attribution exists.
- Remove only known old website section fragments; preserve Flutter route fragments.
- No changes to app assets, pricing, APIs, catalog data, native apps, Crew or administrator screens.

## Preventing drift

`npm run sync:app-entries` derives the two public HTML entries from `app/index.html`.
The app staging tool invokes this generator. `npm run build` rejects stale entries.
Both PR checks and Pages publication run the real app entry browser tests before publishing.

The removed static homepage is retained only as `tests/fixtures/legacy-home.html` for
legacy JS regressions. Its mocked browser tests are not proof of the new live homepage.
The Pages artifact excludes tests, tools, docs and web_app source.

## Validation boundaries

- `npm run build`: lint, typecheck, generated-entry checks and 34 Node tests.
- `test:app-entries`: real compiled Flutter app at `/`, `/inquiry/` and `/app/`,
  360/390/768/1440px, vehicle-list navigation, explicit and migrated referral attribution.
- Browser test API reads use the existing recorded catalog fixture; writes are blocked.
- A separate interactive browser inspection uses live read-only catalog requests.
- Original app release hashes remain unchanged, including main.dart.js and font manifests.
- This routing change does not constitute a new customer document upload/admin end-to-end test.

## Publication and rollback

Publish only through a tested PR and the existing GitHub Pages workflow.
Verify normal public `/`, `/inquiry/` and `/app/` responses and actual rendering after deployment.
To undo the homepage promotion, revert this PR and use the same checked Pages workflow;
do not restore an unrelated old app build or modify customer records.
