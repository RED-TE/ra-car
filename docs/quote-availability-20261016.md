# Quote Availability Fix - 2026-10-16

## Confirmed production behavior

- The former Korean message meaning "checking this price" was a terminal
  `QuoteConditionsUnverified` error, not an in-flight request.
- Vehicle detail defaults remain 60 months, annual 10,000 km, prepayment 0%.
- Recorded production Ray responses: 60m/10,000km passed
  `request_conditions_verified`; 60m/20,000km, 36m/20,000km and 48m/20,000km
  failed it with `MILEAGEMONTHLY_SOURCE_TERM_UNRECORDED`.
- `provider_generated_at` and `valid_until` were null. Request time, source
  revision hashes and deployment dates are not evidence of price freshness.

## Changes

- Terminal unavailable-price copy no longer implies background loading.
- Unverified selections offer condition editing and a price-confirmation inquiry
  instead of repeating an unsupported quote request.
- The inquiry preserves selected term, mileage, prepayment percentage, trim and
  options; it omits `quoted_monthly_payment` entirely.
- Quotes have a 20-second total deadline. Condition changes cancel stale requests;
  existing generation and selection guards remain in place.
- Monthly price captions explicitly identify the selected conditions. Default
  terms, sorting, formulas, stored quotes and database records are unchanged.
- Root, `/app/` and `/inquiry/` use the same rebuilt artifact.

## Verification

- Recorded public API responses are stored in
  `web_app/test/fixtures/ray_condition_quotes_20261016.json`.
- Regression coverage includes unavailable price, timeout and recovery, stale
  responses, condition editing, and 320/390/430px at 200% text.
- A Chrome-only mocked test submits 60m/20,000km without an unverified amount.
  This is not a real customer submission or proof of administrator processing.
- Source pin and patch hash are checked again before staging the release build.

## Remaining boundary

The server must recover the actual original term associated with mileage and
prepayment adjustment source rows, then revalidate the affected prices. Do not
infer that term from `bestTerm`, substitute another mileage, disable provenance
checks or label these prices as current finance-company offers.

Native app source receives equivalent state and provenance safeguards separately;
the static website release does not publish an App Store or TestFlight binary.
