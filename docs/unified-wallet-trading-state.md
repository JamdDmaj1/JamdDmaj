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
and existing web signing/risk/recovery invariants. Native Robolectric assertions
were updated for the new public metadata and an UNKNOWN record, but cannot be
run on this workstation yet: no Android SDK is installed. Therefore Android
compilation/device behavior is **not claimed verified**, and point 3 should not
be called fully verified on Android until those checks run. Nothing is published.

Results on 2026-10-23: 106/106 scoped JavaScript regressions passed (65122 ms,
no skips); the 11 new shared-state tests also passed after final collateral-sum
and duplicate-market validation. Web build and the built-browser HTTP/native
fixture check passed on final source with headless installed Edge. The Android
SDK is neither configured nor present in the standard local SDK locations;
Robolectric/Android compilation and an installed-device check remain outstanding.
