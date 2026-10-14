# /app startup performance patch

## Scope

- Base: RED-TE/ra-car main `6d15fe032ebfef9e744e59a12a67eb44d635e416`.
- Preserve deployed Flutter application `garage-docs-readability-20261012` from RECAREA/recar_app `4b0498df0e63aa2c8bbae66e59e1c9a31037e7b0`.
- No changes to Dart, native apps, vehicle/pricing data, inquiry submission, customer storage or API contracts.
- No production publication, GitHub push or merge performed for this patch.

## Changes

1. Preload the existing versioned main script, asset/font manifests and five used Pretendard weights in parallel. Preconnect renderer/font CDN and the API.
2. Remove only the unused SUIT family from the startup FontManifest. The compiled application has zero SUIT references. All original font files and supported glyphs remain untouched. `npm run optimize:app` is repeatable and retains SUIT if a future compiled build references it.
3. Stop enumerating/deleting origin-wide Flutter caches on every visit. Unregister only the legacy worker registered at `/app/`. Normal startup does not await worker storage. Controlled legacy migration has a 1.5 second wait limit and preserves referral/query parameters with a one-reload guard.
4. Serve `.otf` with the correct MIME type in the local website server; these font requests previously returned 404 locally.
5. Release digests reflect the changed web wrapper; the compiled application's SHA-256 remains `151303049f30bf9440a89cc1f350848fc45194f1be83941306627d489a4ef660`.

## Measured Results

Six alternating desktop Chromium navigations: three baseline, three improved. Same read-only local server, gzip, cold HTTP cache, 5 Mbps download and 150 ms latency. No API mocks in these measurements. This is a controlled comparison, **not deployed production performance**.

| Median | Baseline | Improved |
| --- | ---: | ---: |
| Flutter first frame (includes startup gate) | 17,002 ms | 15,506 ms |
| Home-pick request completion | 20,353 ms | 18,767 ms |
| Font transfers including icon fonts | 6,576,815 bytes | 5,367,254 bytes |

- First frame: 8.8% faster; compressed font transfers: 1,209,561 bytes less (18.4%).
- Main script downloads once per navigation; fonts request count reduced from 12 to 7.
- Request completion is a network timing marker, not proof that home content is already interactive. Cross-origin resource timing masks some API response statuses.
- Separate browser fetches confirmed HTTP 200 for production home-pick (3 items), events (2 items) and vehicles (3 requested items).
- Real local desktop and 390px mobile screens render; no mobile horizontal overflow. Original UI and images remain.
- A lossless CFF/font pilot preserved all 14,716 glyph outlines but saved only 12 bytes. It was not applied. No font subsetting, unsupported WOFF2 conversion or visual font replacement is shipped.

## Verification

- `npm run build`: lint, types, syntax and 27 tests passed.
- `npm run test:crew`: 75 browser regression tests passed. These Crew tests use mock API responses and do not prove live signup/approval.
- Release file hashes match; original compiled application, image and font bytes unchanged.
- Existing dependency audit: one high-severity development-only brace-expansion advisory. Dependency versions are unchanged by this patch.
- Remote CI not run for this unpushed branch.

## Reproduce

Start identical read-only servers:

```sh
node tools/app-performance-server.cjs /path/to/baseline-checkout 3350
node tools/app-performance-server.cjs /path/to/improved-checkout 3351
```

In one Ego-browser task, call `measureAppLoading(task, outputPath)` from `tools/measure-app-loading.mjs`. The report is written only to a fresh requested output file. It restores normal network settings after measurement. Baseline app files should match the published build.

Remaining cold-start costs include CanvasKit, five full Korean font weights and application initialization before home API requests. Reducing those further requires a separately scoped, source-level web build; replacing the published app with an unrelated native/main build is not part of this patch.
