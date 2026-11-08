# Phoenix: same-wallet integration checkpoint

Status: development only. Not connected to production signing or execution.

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
  API metadata matching is NOT yet independent on-chain account verification.
- Fifteen unit tests pass across `tests/phoenix-*.test.mjs`, including tampered
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
  a 165-byte SPL Token account. This observation is not yet a reusable signing
  gate or proof of the user's trader account readiness.
- Quote decimal precision is preserved before computing the strict 0.5% bound;
  reference/display rounding cannot silently increase the approved tolerance.

No signatures, registration, deposits, orders or withdrawals were submitted.

Validation limit: `npm run test:ci` was started but deliberately cancelled after
a prolonged run while an existing entry-conversion test file was still active.
There was no failure annotation in the captured output, but this is NOT a full
suite pass. The 15 focused Phoenix tests completed separately with zero failures;
syntax checks and `git diff --check` passed. No web build, browser execution flow,
custody integration, deployment or production readiness claim follows from this.

## Release blockers (do not bypass)

1. Independent on-chain account/token/position verification. Fresh public price
   retrieval and preflight instruction binding are implemented, not this gate.
2. Isolated account setup, parent permission validation and onboarding cosigner
   flow; never inherit an unexpected external delegate.
3. Exact-wire validation and same-wire simulation with actual effects checked.
   Full-size IOC cancellation must not be mistaken for a successfully filled
   position, and platform fees must not be charged on a no-fill order.
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
