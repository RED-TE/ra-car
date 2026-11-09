# GV70 image correction — 2026-11-09

The legacy GV70_360.png contained a BYD SEAL. It is replaced with original image bytes from the official Genesis GV70 page. A new gv70_verified_20261109.png filename prevents reuse of the old browser cache key. See assets/gv70-image-provenance-20261109.json for source and digest.

Known first-party representative image URLs are corrected; custom uploads, color photos and Electrified GV70 remain distinct. Existing prices, formulas, stored quotes and customer data are unchanged.

## Validation

- Final Flutter web source: 1,420 passed, 40 skipped, zero failures; release build passed.
- Web build checks (lint, types, static checks, Node tests): 245 passed, zero failures.
- Local HTTP: both legacy filename and new filename under /app/assets/assets/cars/Genesis/ return 200 image/png with the verified manufacturer SHA256. The obsolete /assets/assets/ prefix is corrected by Flutter to /app/assets/assets/; its raw URL is not newly exposed.
- Rebuild protection checks source and built image hashes before staging. Existing patched model, price and transport paths are retained by the source-patch capture tool.
- No production API calls, database writes, quote changes, or deployment are part of these validation results.

A first reconstruction exposed that the old capture helper dropped later runtime-patch files. That unsuccessful intermediate result and the original checkout were preserved; this final patch keeps the existing runtime patch and appends only image changes. Full checks were rerun on the final reconstructed source.
