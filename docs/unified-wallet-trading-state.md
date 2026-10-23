# Point 3: selected-wallet account state (local implementation)

Assets, Trade and Futures now use one document-local, account-bound public
projection and one read-only refresh controller. This is display state, never
funding, signing, settlement or custody authority. No production deployment,
bot activation, provider approval or financial send is part of this change.

## Data and boundaries

- `/api/wallet-trading-state?address=…` reuses the native mainnet account decoder
  for one confirmed bank containing the SOL payer, canonical USDC ATA and all
  six supported Jupiter position PDAs. Position collateral in USD is separate
  from wallet USDC; it is not subtracted from wallet funds a second time.
- Owner/discriminator-filtered native position requests are bounded to 100.
  Exact supported TP/SL requests reuse the existing native decoder. Unknown
  request types, live orphan requests and incomplete discovery withhold sizing
  availability instead of being represented as no orders.
- The recent Solana signature page is capped at 50 and explicitly not a complete
  trade/fill/P&L history. Confirmed/finalized and failed status is retained;
  unavailable data is not treated as an empty verified history. No USD values
  or trade labels are invented from signatures.
- Browser holds are read from the existing validated signing journal. Invalid,
  unavailable or pending records prevent an available-capital claim. Journal
  invalidation events refresh all views immediately and notify other tabs;
  notifications never clear or settle a financial record.
- Android public account metadata adds only pending-known and public operation
  identity/phase from the existing durable Solana journal. It neither opens a
  wallet nor unlocks hardware keys. Unreadable native storage becomes unknown.
  The controller re-reads this public metadata instead of caching a no-hold
  assertion across a native operation.
- The bot's separate server-custodied wallet is not added to the selected main
  or Phantom account. This route does not access server journals, account
  credentials, bot settings or private balances belonging to another account.

## Freshness and sizing

All three views share the same 30-second display lease and reject foreign,
regressed or late account responses, including switching A -> B -> A. Explicit
refresh, resume and operation changes immediately invalidate sizing. A routine
refresh polls every 20 seconds while visible; errors/expiry withhold availability.
Percent sizing uses integer micro-USDC arithmetic and never changes an amount
the user is editing merely because a public balance refreshed. Network fee,
rent, final funds and signatures remain mandatory in the transaction review.

The build keeps the portfolio and trading-state modules external/singleton in
the Assets bundle. Copying these stores into separate bundles would recreate
the original split-state bug and is covered by the built-browser check.

## Verification

The built browser check (`scripts/check-unified-trading-state.mjs`) hosts an
actual loopback API handler backed by deterministic native account bytes. It
verifies the shared Assets/Trade/Futures panels, Assets valuation, exact futures
slider, unreadable pending storage, disconnect clearing, browser errors and
mobile overflow. All non-loopback requests are blocked. No wallet is connected,
no keys exist in the fixture, and no transaction is constructed or sent.

JavaScript regressions cover the selected wallet boundary, real native position
and TP decoding, stale/unknown funds, HTTP validation, private-field exclusion,
and existing web signing/risk/recovery invariants. At the initial implementation
checkpoint the native Robolectric assertions could not run because no Android
SDK was configured. That local blocker is resolved below. Nothing is published.

Results on 2026-10-23: 106/106 scoped JavaScript regressions passed (65122 ms,
no skips); the 11 new shared-state tests also passed after final collateral-sum
and duplicate-market validation. Web build and the built-browser HTTP/native
fixture check passed on final source with headless installed Edge. The Android
SDK was not configured at that checkpoint; native compilation/tests had not yet
run. This historical checkpoint is superseded by the following results.

## Native validation completed (2026-10-23)

After explicit user approval of the SDK installation and Google license, the
official Windows command-line tools were downloaded and their SHA-256 matched
the [official Android tools download](https://developer.android.com/studio).
Platform 36 and Build Tools were installed in an isolated local cache. The SDK
path is kept in ignored `android/local.properties`, never in tracked source.

The native Java source and tests compile. All **6 public-account Robolectric
tests pass, with 0 failures/errors/skips**. They cover persistent public account
selection, ambiguous/unknown profiles, UNKNOWN/SUBMITTED holds, terminal states,
malformed journals, foreign journal ownership and exclusion of private fields.
The first Windows run exposed directory-fsync failure while creating fixture
profiles. These read-only projection tests now seed already-persisted metadata
directly; production `WalletStorageBarrier`, profile/journal writers and their
separate persistence tests were not weakened, bypassed or marked verified here.

An additional client test proves that native resume immediately invalidates
availability before re-reading a public pending hold, without opening a wallet
or requesting biometrics. Percent sizing also rechecks the current lease at
input time so a suspended WebView expiry timer cannot reuse stale funds.

The final `testWalletPreviewUnitTest` + `assembleWalletPreview` invocation
succeeded (55 s). `scripts/check-unified-wallet-android.ps1` independently checks
the 6-test report, APK v2 signature, separate `com.jamddmaj.ai.walletpreview`
identity and SHA-256 equality of the seven critical bundled public account/UI
assets against the current web build. It passed on the final APK. The final
built-browser HTTP/native-fixture flow passed again after the lease-input fix.

Point 3 implementation and local web/native verification are complete. This is
not a production rollout or a claim of testing an installed physical device.
No release was published, no app was installed/replaced, no real wallet was
unlocked, and no funded transaction was signed or sent. Production connection,
broader deployment/device acceptance and publication remain later numbered
points, not implicit consequences of these local checks.

Final scoped JavaScript regression: **108/108 passed**, 0 failures/skips
(79466 ms), including native resume and suspended-timer expiry. Along with the
6 native tests this is 114 passing scoped tests, plus the separate built-browser
flow and final APK signature/identity/asset checks. No broader full-project or
physical-device acceptance result is implied by that count.
