# Account-linked public wallet display — 2026-10-24

## Published

- Source: `148e7fb816006a11346de546672447fd2daa3d1b`.
- Production deployment: `dpl_7pdSoWWjuaxRVPkhBidmzd8XJeF9`.
- Tested production candidate: https://jamd-dmaj-o4di7a8wo-jamd-dmaj-s-projects.vercel.app
- Promoted without rebuilding to https://www.jamddmaj.com.
- Existing Google session authentication and existing Redis storage retained. No environment or custody changes.

## Scope

An authenticated user can explicitly save a public Solana address once, then restore the same view-only address and public balances in another session of that account. Server-side account identity scopes the record; another account cannot retrieve it. Atomic revision checks prevent stale updates from overwriting a newer link.

This is a public watch-address association, not proof of wallet ownership. No keys, recovery phrases, signing authority or biometric credentials are synchronized. A watch account cannot become available signing capital. Existing Phantom/native selections are not overwritten; the user can choose the linked wallet with **View this wallet balance**.

The real user's link has not been created by the agent. In Assets, while signed in with Google, they must enter their native wallet's public address, check the public-address consent and select **Link public address** once. Future sessions of that same account restore it. Android source includes an optional public-address autofill, but no new Android package was released for this web change.

## Verification

- Full current regression: 980 tests, 966 passed, 0 failed, 14 skipped.
- Additional opt-in compiled browser integration: 6/6 passed, including separate same-account and different-account browser contexts. It exercised the real route handler against isolated test storage; no production account was impersonated.
- Build succeeded; candidate READY. Candidate compiled panel present; unauthenticated route returns LOGIN_REQUIRED.
- Fresh public mobile browser: Assets panel visible, Google login required when signed out, save disabled; public API returns HTTP 401 LOGIN_REQUIRED.
- Public screenshot inspected: `.perps-build/account-wallet-publish-20261024/public-assets.png` (local QA only).
- Initial deployment error-log scan: 0 records returned over the prior 10 minutes. This is a point-in-time scan, not ongoing monitoring.
- No wallet unlock, signatures, transactions, deposits, bot activation or private-key access performed.

Production authenticated persistence still requires the user's first linking action; local authenticated fixtures do not substitute for that live acceptance check.
