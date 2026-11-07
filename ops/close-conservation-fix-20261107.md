# Manual full close conservation fix

Goal: fix protected full-close review without a real close, signing, fund move,
automatic activation or wider 0.5% JLP tolerance.

Root causes reproduced in read-only mainnet simulation:
1. The old custody immutable-tail check rejected the legitimate native impact
   history update. Candidate validates the exact signed i64[60] update, monotonic
   clock, same-second accumulation, elapsed bucket clearing and all fixed fees.
2. USDC borrow-index/debt/accrued-interest updates need the existing independent
   accrual validator, composed without exempting any byte from both checks.
3. SHORT collateral is segregated from JLP owned token assets. The observed
   conservation gap equals the privately decoded native position collateral
   exactly. Old policy wrongly charged that principal refund to owned assets.

Correct SHORT USDC equation: before(owned+fee reserves) - after(owned+fee
reserves) + full native position collateral = exact token-vault debit. Apply
ONLY to the bound SHORT collateral custody, pinned USDC mint/6 decimals/stable
flag. LONG and internal swap-vault accounting retain the original equation.
No unbounded credit, approximate gap tolerance, debt precision guess or choice
between accounting models is accepted. Position identity, observed collateral,
full-close effects and same-bank proof remain independently bound. Native
signer refresh uses the same corrected validation and its independent clock.

Primary references checked:
- Confirmed program-owned native Anchor IDL SHA256
  1d90a653a1cc88bddb7c5876acee52d3f26c6b1e3306e0833234020dc6f7d653.
- https://developers.jup.ag/docs/perps/position-account (collateral USD precision,
  native identity, locked tokens and fees).
- https://developers.jup.ag/docs/perps/custody-account (owned assets and fee
  reserves; general docs do not fully describe segregated SHORT principal).

Read-only complete real-position preparation succeeded with
FULL_CLOSE_SIMULATED_WALLET_ONLY, readyForSigning=false, submitted=false.
Diagnostic-only JSON-RPC batching reduces sampling skew without changing
methods, commitments or slot equality. It is NOT installed in production.

Tests: 152 native/manual/journal/history/API cases, 151 pass, 1 browser case
skipped, 0 fail. Includes all six routes; profit/loss/break-even/zero payouts;
one-unit book gaps; borrowed interest; immutable byte/ring/sign/clock attacks;
original approvals, uncertainty and no-resubmission paths. Installer DB
fingerprint test separately verifies schema/large integer preservation.

Install plan: exact old binary hashes, committed candidate SHA256s, paused
automation, no pending signing/close/entry/swap/fee actions and no unpaid fee
assessment. Preserve OPEN rows, all logical financial DB contents and policies.
Fingerprint controls/journal/manual policy/swaps/fees/payments/backup; exclude
only request quota counters. Back up old binaries; graceful stop incoming
transport before worker; recheck state; atomically replace binaries; start;
verify healthy and unchanged financial state. Roll back ONLY binaries on any
failure; never restore old DBs or use previous empty-journal installers.

Discover HTML/JS/CSS/tour reviewed. Internal correctness fix: no new capability,
market, price plan or UI feature to advertise; web version/APK unchanged.
## Installed and verified

Source 52d0b2734135445dc9743947fda467ea722f2a60 installed using the reviewed
open-position-preserving operator. Preflight succeeded. Graceful binary-only
update succeeded; all services healthy and all seven logical financial state
fingerprints unchanged. No pending actions or unpaid fee assessments at install;
all automation remained paused. Existing OPEN position preserved; no financial
send, policy change, schema migration or DB restoration performed.

Installed worker SHA256
158fa791910425f0ad2e8f64e19c9eada4b06c5eb33bfafd2833391aa9fce561;
web SHA256
270050d9b4c3ff38a670de275326f2065b5cb67f290e6fd58ceaeaa1ea27dffe.
After restart the isolated read-only diagnostic again completed real-position
FULL_CLOSE_SIMULATED_WALLET_ONLY with readyForSigning=false, submitted=false.
These checks used the corrected financial source matching the installed build.
Diagnostic sampling may batch read calls; production RPC pacing is unchanged,
so exact-bank mismatch may still require a fresh user review. No relaxation or
automatic send retry was introduced. Recent logs show only the graceful stop /
start and expected SQLite experimental warnings, not a runtime failure.

Goal implementation/installation verified without executing a user trade.
Actual authenticated user confirmation/settlement has NOT been performed or
claimed. User still controls whether to close. Web/APK unchanged.
