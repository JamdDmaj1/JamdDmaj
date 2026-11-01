# Pool creation and deposits, source audit 2026-10-31

## Scope

Separate Token/USDC mainnet form in Fair Launch. Canonical USDC, fixed Raydium
CPMM program, deterministic standard-config pool, Wallet Standard v0 signer.
The exact mint is entered by the user; no claim that a ticker verifies identity.
Existing pool -> proportional deposit with exact LP target and user-specified
maximum token spends. Missing pool -> initialization with exact initial amounts.

No 1% purchase fee, automatic liquidity, permanent LP lock, token distribution,
native Android key signing or pool withdrawals are claimed. Review and consent
explicitly disclose that LP ownership is retained by the contributing wallet
and is NOT locked. The earlier approved 1% policy remains disabled; its scope
now records the user's later choice of JamdDmaj-integrated buys only.

## Financial boundaries

Fixed mainnet RPC/genesis; no server-generated transaction. Local construction
uses documented Raydium accounts/ABI. Reads validate owners, discriminators,
config and pool bindings, canonical source accounts, supply permissions and
supported metadata-only extensions. Arbitrary transfer fees/hooks/delegates
are rejected rather than silently substituted.

Costs are simulation estimates, not guaranteed SOL caps: Raydium admin-controlled
configuration may change. Config is re-read before wallet invocation. Token
deposit spends have on-chain maxima and LP issuance has an explicit target.
Review expires after 45 seconds; wallet output must preserve the exact message
and carry a verified owner signature. No platform contribution fee is added.

Durable public journal before one send attempt; cross-tab Web Locks; reload
blocks a second operation. Rooted reconciliation binds the exact signed message
and LP balance delta to the expected deterministic pool. Missing-history deposit
results stay pending (not treated as safe to repeat). Expired creation requires
finalized block height, repeated absent signature and absent pool.

## Evidence

- 13 pool unit tests pass: exact units, maximums, create/deposit, no preapproval
  signing, single submission, wrong network/message/config, expiry, insufficient
  funds, unsupported mint, failed simulation, uncertain send, invalid receipt.
- Mobile browser rehearsal passes on actual built assets at 390x844: explicit
  review/consent, one intercepted send, reload and read-only rooted recovery.
  No external network or user key. Screenshot `.perps-build/cpmm-review-mobile.png`
  inspected: readable wrapping, no panel horizontal overflow.
- Real mainnet read-only compound mint+pool simulation passes: 1210-byte wire,
  125104 compute units. A second read-only existing-pool deposit simulation
  passes: 758-byte wire, 43414 compute units. These probes simulate prerequisite
  account creation and then the actual integration instructions. RPC allowlists
  prohibit sends, wallet calls and journal writes. No chain state changed.
- Live standard CPMM config/pool owners and ABI lengths observed: 236 and 637.
- Existing token creator browser rehearsal remains part of regression checks.
- Discover HTML adds accurately scoped pool description. Discover JS/CSS/tour
  reviewed: no changed selectors/navigation or style requirements; no gratuitous
  edits. Protected lab readiness gates remain unchanged.

## Official protocol references inspected

- https://github.com/raydium-io/raydium-sdk-V2/tree/master/src/raydium/cpmm
- https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/instructions/initialize.rs
- https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/instructions/deposit.rs

Publication is not implied by this source audit; deployment/release receipts
must be checked separately before declaring the feature available.

## Publication receipts

Source `b4b580a` staged in production deployment
`dpl_EVN1qGAaNG5zoRy42KhjC26RX1MH`. Authenticated candidate checks passed for
main form/version, bundled financial checks, CSS, Discover, status and unchanged
protected-launch gate. The tested production candidate was then promoted to
the canonical public domain. No protection setting was disabled.

Final `npm run test:ci`: 1301 tests, 1282 passed, 19 skipped, zero failures.
Log `.perps-build/cpmm-release16-tests.log`. Both browser rehearsals pass on
the rebuilt 1.38.16 assets. Android tag `v1.38.16` starts signed release run
https://github.com/JamdDmaj1/JamdDmaj/actions/runs/41266280710
and must not be described as a published APK until the non-draft asset is verified.
