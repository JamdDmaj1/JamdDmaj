# Hyperliquid additional venue — testnet candidate, NOT production trading-ready

User approved integrating Hyperliquid alongside Jupiter. This authorizes feature
development, not opening trades, deposits, bridges, withdrawals, agent grants,
moving funds, selecting new risk tolerance or modifying current Jupiter trades.
Existing 0.5% price tolerance retained; no interpretation as the earlier Beta/GUM
1% approval. No production version increment or promotion in this candidate.

## Implemented

- Fixed mainnet/testnet public info clients, bounded timeout/response shape.
- Native perps universe (not HIP-3/spot): original array indexes preserved as
  asset IDs including delisted entries. k-prefixed symbols remain distinct;
  there is no automatic substitution for similarly named Markets tokens.
- Separate EVM read-only connection, account value/margin/withdrawable, open
  positions, venue-reported PnL/ROE. No data enters Solana wallet portfolio or
  order sizing. Wallet identity changes invalidate late responses.
- Local terminal drawer, lazy queries only when opened; search and explicit
  unavailable-live-trading wording. No mainnet exchange or signing import.
- Pure exact decimal review planner: lot flooring, 5 significant figures /
  decimal rules, tighter-direction rounding within 0.5%, IOC with random
  supplied cloid, reduce-only full close. Preview refuses existing same-market
  exposure/orders on opening; close refuses unknown position or native orders.
- Pinned community SDK @nktkas/hyperliquid 0.33.3, linked by official venue
  docs. Validation-only testnet executor, bundled only into the standalone
  `hyperliquid-testnet.html` flow, never the main terminal's read-only panel.
  Mainnet rejects before any wallet access. Only EIP712 testnet Agent source b
  and a single exact approved IOC or isolated-leverage setting action accepted.
  Real IndexedDB transaction commit journal and exclusive Web Locks wired by
  the testnet coordinator. Neither falls back to memory/localStorage. Persistent
  monotonic nonces survive reload. In-memory dependencies appear only in tests.
  An HTTP success never becomes a reconciled position result.
  Unknown sends stay UNCERTAIN/CHECK_REQUIRED; no retries or auto-clear.
- Isolated leverage requires its own explicit review/signature; it never
  automatically opens an order. Live activeAssetData rechecked before opening.
  Settings changes refused when same-market positions/orders are observed.
- Reconciliation checks cloid, order identity, native terminal status, matched
  unique fills and fresh resulting position. Partial fills remain partial;
  unknownOid/missing fill evidence never clears an uncertain hold. A SIGNING
  intent can be released only after its expiry and acquisition of the exclusive
  lock: the executor commits SUBMITTING before every network send.

## Evidence and remaining gates

Actual read-only info calls decoded mainnet (179 active of 235 entries) and
testnet (159 active of 213). These counts change. Unit tests execute the pinned
SDK against fake signatures/network only; they are NOT a signed venue receipt.
Browser desktop/mobile tests use fixture accounts and intercepted testnet
requests; no real financial calls. Compiled real UI/SDK tests configure isolated
leverage, open, reconcile, fully close, and recover a lost response after reload
without resubmission. Actual browser mainnet public catalog/CORS read passes.
Ten focused unit/integration tests pass. Existing
Jupiter design/manual close regressions also pass. Run current tests again after
any change. Package audit reports existing Firebase/gRPC advisories; no automatic
dependency downgrade/fix performed and no advisory attributed to the new SDK.

Not validated, and required BEFORE mainnet signing:
1. Testnet UI explicit consent and fresh account/position binding through a real
   wallet signature and venue-confirmed open/read/close/recovery lifecycle.
   Current evidence uses synthetic signatures and API fixtures, not a live fill.
2. Venue edge cases not observed live: actual rejected order response shapes,
   settled fills latency/pagination, residual dust and oracle/market suspensions.
3. Fees/margin caps/price depth review and actual mainnet funding/account setup,
   approved and performed by the user. No transfer builder exists here.
4. Integration promotion only after these gates. Never remove the testnet-only
   guard as a shortcut or describe the read-only catalog as executable markets.

Discover HTML, JS, CSS and tour CSS reviewed: no public edits appropriate until
availability changes. Production Discover correctly still says BTC/ETH/SOL for
the shipped Jupiter execution connection. Do not announce this candidate on X.

## Preview evidence and next required action

Source `970ddea4c65478992e985eb0242ad9a92a9741aa` deployed ONLY as Preview,
READY deployment `dpl_6x2oobcH1MNdS6C8L273KXvz9hjo`:
https://jamd-dmaj-dbqnh8ayj-jamd-dmaj-s-projects.vercel.app/hyperliquid-testnet.html
No promote call, custom domain assignment, VPS restart or production release.
Authenticated comparison verified all nine preview assets: testnet HTML/bundle,
public client/panel, terminal and Discover HTML/JS/CSS/tour. Only the exact
Vercel-injected opt-in preview Toolbar trailing tag is removed for HTML byte
comparison; application code/body differences are not ignored.
Canonical public terminal separately matched the previous production source
`dcc05f89d85b97b5f937e6a3ae2ccb1f299c5cbd`. Production stays 1.38.27.

Final targeted run: 26 tests passed (10 Hyperliquid + 16 existing display/state
regressions). Compiled browser testnet configure/open/reconcile/close/reload
recovery passed at 1280/390 px, as did the read-only catalog/account panel.
Actual browser public catalog read returned 179 active native markets. Preview
bounded error-log query returned no entries; not evidence of real order success.

Remaining external verification requires the user to connect an EVM wallet and
an existing funded TESTNET account, then explicitly approve each test action.
No actual testnet account/signature/fill has been verified. Never ask the user
to deposit real funds merely to complete this test. If no testnet funds/session
are available, keep production signing disabled and report that dependency.
Mainnet fees/caps/depth and account funding remain separate later gates.

## Sources checked

- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets
- https://github.com/nktkas/hyperliquid
