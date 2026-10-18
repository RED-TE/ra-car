# Kakao web reconnect

## Scope and build

Preserve the current root, `/app/`, `/inquiry/`, Crew and guide screens. Add
Kakao browser OAuth and its regression/deployment checks. Keep the existing pinned
Flutter source and all current web overlays for pricing proof, loading speed,
referrals, document upload and decorative-image removal.

- Source: `RECAREA/recar_app` at `4b0498df0e63aa2c8bbae66e59e1c9a31037e7b0`.
- Build: `web-kakao-reconnect-20261018`, Flutter 3.41.1, `/app/` base path.
- Source patch and compiled file hashes are in `app/release.json`.
- API counterpart: https://github.com/RECAREA/recar_app/pull/134

## Deployment gate

The user approved ordinary app 1451784 for public web login. The preflight must
also reject app 1451987. The API verifies the app ID using Kakao token information
before user lookup. Existing native behavior and existing account records are
preserved; cross-app account linking still requires proof of both identities.

Do not merge/publish this build until the API counterpart is checked and deployed,
and the correct existing production Kakao application is confirmed. Pages now
checks both fixed start endpoints before uploading assets; this does not exchange
tokens, create users, or prove a real provider login. It stops on 404, missing
configuration, unsafe authorization targets or cached responses.

The current source's fallback native key belongs to `리카-TEST` (1451987), not
the ordinary `리카` app (1451784). This is a **source default** finding, not proof
of the compile-time key used in the released store app. Never switch application
identity or migrate existing accounts without confirmation. Kakao documents that
test apps are for testing only and require the original app keys for production:
https://developers.kakao.com/docs/ko/app-setting/app#test-app

At preparation time the production API returned 404 and its service environment
had no Kakao web variables. On 2026-10-19 the approved ordinary-app credentials
were stored only in the existing API environment, with a protected backup.
Both redirect addresses, app ID and protected permissions were checked without
printing credentials. The API code has not yet been deployed or restarted, so
that setup does not prove a working public login. No credentials are recorded here.

## Local checks

- Flutter Chrome tests: 33 passed (Kakao, login layout 320/390/430px, document
  upload, application replacement and referral persistence; mocked APIs).
- Release web build: passed.
- Website build and unit checks: 50 passed, including rejection of the test app
  in the deployment preflight.
- Complete web E2E suite: 149 passed, with synthetic API responses where needed.
- Real compiled web E2E: root and `/app/` OAuth start/callback/error paths passed,
  and root, `/app/`, `/inquiry/` entry tests passed at 360/390/768/1440px.
- Production/provider login and real document submission remain separate checks.

The callback test proves the normal RE:CAR session is created, OAuth parameters
are removed, existing saved records are preserved, and missing browser proof does
not exchange tokens or reload the document. Test provider responses are synthetic.

## Approved Crew Inquiry Follow-up

The user separately requested the complete customer-to-crew/admin flow to be
verified and corrected. API counterpart RECAREA/recar_app#135 attributes new
customer inquiries to approved crews without creating referrals or rewards.
The static Crew dashboard displays these inquiry record counts separately from
confirmed referrals, contracts and settlement. It shows an unavailable state
rather than a fabricated zero when the API does not provide the aggregate.
No customer contact details or message text are displayed to the crew.

Local website checks: 50 unit tests and 12 Crew self-service browser tests pass,
including 320/390/1440px inquiry layout, copying, profile and support regressions.
Real production provider login, submission and document preview remain separate
checks. No new crew account is submitted after the user chose existing accounts.
