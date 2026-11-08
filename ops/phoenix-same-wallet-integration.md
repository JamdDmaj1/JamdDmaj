# Phoenix: same-wallet integration checkpoint

Status: development only. Not connected to production signing or execution.

## Latest checkpoint: native-program rehearsal and receipt verification

The foundation below now has additional implementation and evidence:

- Fresh, sealed mainnet account snapshots independently verify wallet ATAs,
  parent/child ownership, actual native positions, cash, delegates and preferences.
  Frozen tokens are visible but not spendable. Donated lamports at an uninitialized
  ATA are not fabricated token balance and do not block its eventual creation.
- Reusable native market verification checks global configuration, book, spline,
  asset map, vault, mint, active arenas, restart state, native fee and risk tiers.
- Locally compiled legacy order wires have one wallet signer, exact instructions,
  bounded compute fees and no arbitrary builder message or lookup table.
- Same-wire simulation verifies full-size fills, native CPI events, exact USDC
  debit, token state, collateral, rent and network fees. Foreign exchange-key
  evidence cannot authorize another account set. Close is reduce-only and does
  not require a wallet USDC transfer or successful collateral payout.
- Native CPI decoding matches an official published transaction fixture. Free-form
  log strings, success HTTP responses and a missing position are not fill proofs.
- Exact signed-wire receipt reconciliation verifies Ed25519 signatures, network,
  finalized transaction bytes, status, protected fill and post-position events.
  It remains usable after the short review expires. Missing/confirmed-only replies
  remain unresolved with no resend. Failure/no-fill incurs no platform fee; a
  successful no-fill opening can still hold deposited collateral. This receipt
  module is process-local evidence, NOT restart recovery or a custody grant.
- 54 focused Phoenix tests pass. A read-only mainnet check also compiled a
  986-byte unsigned order and obtained its 5,600-lamport fee quote. These numbers
  are snapshots, not fixed fees for all account setup or transactions.

`scripts/rehearse-phoenix-mainnet-fork.mjs` loads public protocol accounts and
program binaries into a local LiteSVM with fictitious SOL/USDC and zero signatures.
Using the actual native programs, it passed parent registration, isolated setup,
LONG opening/closing/payout and then SHORT opening/closing/payout on the same child.
The final child collateral and canonical token balances were zero. No network
transaction, real signature, user balance lookup or funding action was performed.
The harness rejects network submission routes. Install its isolated interpreter
dependencies using `scripts/phoenix-svm-requirements.txt`; the venv is ignored.

Two important protocol behaviors were found and tested:

1. Permissionless parent-to-child sync copies parent preferences and can undo a
   child-only sweep setting. Setup protects the owned parent before registration
   and sync, then sets the child preference. A sync replay test confirms both stay
   protected. Unmanaged parent funds or a foreign delegate prevent this setup.
2. Closing and payout are separate. A withdrawal request may queue; appending
   conversion before payout could roll back that request. The rehearsal first
   requests collateral, then unwraps only the confirmed canonical amount to USDC
   and revokes the temporary Ember allowance. Production still needs this split
   bound to durable approved intent and independently reconciled receipts.

Initial parent/child/ATA creation has real rent costs (roughly 0.012 SOL in one
snapshot). Never assume the user's wallet has enough SOL, silently swap funds,
promise rent recovery, or sponsor creation without authorization.

This is NOT a browser/API/custody integration or availability claim. Production
and Discover remain unchanged. The next implementation boundary is a durable
workflow journal with exact one-use signing permissions, backup/restart recovery
and cross-venue exclusions, followed by the existing UI and full-flow verification.

## Approved product direction

Keep the existing Solana wallet and Long/Short interface. Additional markets must
use native Phoenix market identities, not aliases or simulated trades. Preserve
the user's 0.5% price protection. No separate EVM wallet onboarding.

## Implemented and checked

- Fixed-origin, read-only native crypto market catalog.
- Exact integer price ticks and base lots, including negative lot decimals.
- Isolated child-account intent; account zero/cross is not selected implicitly.
- Explicit protected IOC packet with full-size minimum, bounded quote amount,
  client order identifier and slot expiry; never SDK default unprotected pricing.
- Reduce-only close instructions do not include deposits or withdrawals.
- Official SDK instruction data is decoded and compared against the intent.
- Native fresh mark/oracle price evidence, symbol binding and short expiry.
  Unsupported price precision, stale prices and excessive oracle divergence
  fail closed. Browser-supplied price/packet cannot override server evidence.
- Independent derivation of wallet USDC/canonical ATAs, isolated trader PDA,
  Phoenix vault and Ember state/vault. Exact instruction account ordering,
  signer/writable roles and data are matched, then copied into immutable evidence.
  Native-chain evidence is now a separate reusable signing prerequisite.
- The original fifteen unit tests passed across `tests/phoenix-*.test.mjs`, including tampered
  recipients, markets, permissions, amounts, extra instructions and stale reviews.
- `node scripts/check-phoenix-unsigned-live.mjs` builds four checked unsigned
  instruction pieces with a fresh native DOGE quote and current slot. Read-only
  end-to-end preparation passed. It is NOT a simulation, funding check or
  execution proof. An earlier catalog check observed 55 active crypto markets;
  that count is a snapshot, not a product availability promise.
- `node scripts/check-phoenix-unsigned-live.mjs --all-markets` then prepared
  both LONG and SHORT unsigned instructions with exact bindings for all 55
  active crypto markets in that snapshot. No trade was submitted. The checker
  shares one fresh catalog/price snapshot instead of hammering public endpoints;
  it stops on expired evidence or an unavailable upstream service.
- A separate public mainnet RPC read decoded the live global configuration and
  matched its canonical mint, vault, asset map, arena headers and withdrawal
  queue to the API keys; the global account is Phoenix-owned and the vault is
  a 165-byte SPL Token account. Reusable verification is now implemented as
  described above; the user's live account has not been funded or traded here.
- Quote decimal precision is preserved before computing the strict 0.5% bound;
  reference/display rounding cannot silently increase the approved tolerance.

No network signatures, registration, deposits, orders or withdrawals were submitted.
Receipt unit tests use newly generated ephemeral local test keys only.

Validation limit: `npm run test:ci` was started but deliberately cancelled after
a prolonged run while an existing entry-conversion test file was still active.
There was no failure annotation in the captured output, but this is NOT a full
suite pass. The latest 54 focused Phoenix tests completed separately with zero failures;
syntax checks and `git diff --check` passed. No web build, browser execution flow,
custody integration, deployment or production readiness claim follows from this.

## Release blockers (do not bypass)

1. Complete managed-account inventory and native proof integration into the real
   owner-bound runtime; reusable native verification alone does not enable trading.
2. Production onboarding co-signer profile and exact setup simulation/approval,
   accurate rent preview and guarded parent/child activation.
3. Durable, bounded approval spanning setup/finality, with unchanged original
   0.5% absolute price protection. The current short quote/review TTL cannot
   simply be reused across a multi-transaction onboarding workflow.
4. Scoped one-use custody authorization, durable intent journal, reconciliation
   after lost responses and shared reservations across existing venues.
5. Close/fill reconciliation independently of collateral withdrawal. A queued
   withdrawal is pending settlement, not spendable wallet USDC.
6. Existing-screen routing, positions, history, equity and sharing must become
   venue-aware. No enabled market buttons before these boundaries pass.

`readyForSigning: false` is intentional. Unsigned pieces are not a custody grant.
Do not extend the Jupiter signing allowlist to accept these instructions.

## Public documentation review

Reviewed the impact on discover.html, discover.js, discover.css and
discover-tour.css: no public changes are appropriate at this checkpoint because
Phoenix trading is not available. Do not advertise the catalog as tradable.

## References

- https://docs.phoenix.trade/sdk/orders
- https://docs.phoenix.trade/sdk/register
- https://docs.phoenix.trade/sdk/collateral
- https://docs.phoenix.trade/phoenix/collateral-and-accounts/collateral
- https://github.com/Ellipsis-Labs/rise-public

Phoenix collateral withdrawal can be queued. Closing a position and returning
USDC to the wallet must therefore have separate status and recovery handling.
