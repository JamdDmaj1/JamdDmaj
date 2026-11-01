# Simple mainnet issuer: completion and publication evidence

Date: 2026-10-31. Released source: a6f9d1bd85eef6e3b3e4decc22b50df321555803.

## Requirement-by-requirement audit

- Form inside JamdDmaj: `index.html` / `token-creator-ui.js`, with explicit
  identity, integer supply and decimals. Published root returns 1.38.15 and
  `tokenCreatorMainnet`; the intercepted 390x844 browser rehearsal uses the
  actual built page and SDK, not a substitute screen.
- Review before approval: actual UI displays mainnet, owner, supply, network
  and account-reserve costs, zero issuance platform fee and revoked/immutable
  permissions. Preparing invokes simulation only. Approval requires the fresh
  review and consent; cancellation, expiry, changed account and changed signed
  message are covered in `tests/token-creator.test.mjs`.
- User-wallet signing and one submission: Wallet Standard v0 signing,
  immutable-message comparison and owner-signature verification precede durable
  journal storage and one send attempt. Repeated submission on a consumed
  review is rejected. Browser rehearsal verifies consent and exactly one mocked
  submission using disposable keys. No real user signature was requested.
- Recovery without duplicate sends: reload preserves the journal and blocks
  new issuance. Recovery is read-only, checks finalized exact-message receipts
  and matching mint/owner/supply; uncertain or inconsistent evidence preserves
  the guard. Additional recovery tests cover rooted failure, expiry, reappearing
  status, an existing mint and RPC failure. Eighteen focused tests pass.
- Final local `npm run test:ci` exits 0; every emitted file summary reports
  success, zero failures. Log: `.perps-build/token-creator15-final-tests.log`.
  The release workflow also runs `test:ci` on the exact tagged source.
- Real network compatibility: allowlisted read-only mainnet simulation passed
  using genesis/rent/blockhash/simulation only. Browser-origin RPC CORS allows
  POST. This is not a real issuance test and never broadcasts.
- Separation: simple issuer explicitly does not create liquidity, price,
  vesting or protected distribution. Original protected-launch API remains
  `ready:false`, `documentaryOnly:true`; none of its safety gates was removed.
- Discover: published `/discover.html` contains matching separate-issuer
  information and `1.38.15-token-creator`. Its JS/CSS/tour were reviewed; no
  unrelated style or navigation changes were necessary.

## Delivery receipts

Production deployment: `dpl_HxeggcXc6ygGzgz5bnqaTQPJJK51`, promoted after candidate
checks. Public root, Discover and `/api/status` return HTTP 200. Status reports
both webVersion and latestVersion 1.38.15 and the released APK URL.

Android run: https://github.com/JamdDmaj1/JamdDmaj/actions/runs/41257269316
All four jobs succeeded: wallet SDK, launcher API30, wallet native compilation
and release. Release is non-draft and contains `JamdDmaj-AI.apk` and its checksum:
https://github.com/JamdDmaj1/JamdDmaj/releases/tag/v1.38.15

Downloaded APK checksum matches the release asset:
`12d1e5442dd792ea06bf6e6146e46934292125fe00cdd4bf3fb92da2ac3e7599`.
apksigner verification succeeds with permanent certificate SHA256
`d4799319516f9b243b12ef4678823baed39d9203e42fa70f8de0ba0f7c0080d6`.
Package `com.jamddmaj.ai`, versionName 1.38.15, versionCode 171.
No installation, uninstall or user-data changes performed.

## Compatibility boundary

The issuer requires a compatible Solana mainnet Wallet Standard wallet with v0
transaction signing and browser Web Locks. It does not implement arbitrary token
issuance using the native Android wallet key. Shipping the web assets inside
Android does not prove that a wallet provider is present inside its WebView.
No pool, protected allocation, audit certification, or guaranteed token sale is
claimed. Real issuance remains a deliberate user action with real SOL costs.
