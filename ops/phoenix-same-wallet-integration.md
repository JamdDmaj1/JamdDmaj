# Phoenix: same-wallet integration checkpoint

Status: development only. Not connected to production signing or execution.

## Split collateral checkpoint

`phoenix-collateral.js` now obtains the native withdrawal routes independently
of a token catalog, active market or price quote. Expired trading evidence cannot
by itself prevent preparation of a fresh collateral payout. It verifies mainnet,
global configuration, canonical vault, mints and bounded arena headers, then
prepares one full flat-child withdrawal or an exact confirmed-amount unwrap.
A child already in the withdrawal queue produces a WAIT state with no second
transaction. An unwrap requires a later finalized-payout binding before signing;
its unsigned amount parameter is not evidence of such a payout.

`phoenix-collateral-simulation.js` compiles the exact one-wallet-signer legacy
wire with bounded compute fees and simulates it without replacing its blockhash.
It checks token amounts, flat position/policy conservation, rent, SOL fees and
temporary-delegate revocation. A queued result remains uncredited. Simulation
is NOT finality, durable settlement authorization or proof of queued completion.

The real-program local VM rehearsal now uses these production preparation/wire/
simulation modules for both LONG and SHORT withdrawal and USDC conversion, not
the former ad-hoc SDK harness pieces. Both lifecycle rehearsals passed with
zero final child collateral/canonical balance and no network submission. An
initial real-program failure exposed Ember's configured mint/account ordering;
the implementation was corrected to match the resolved SDK builder and native
execution. A parity regression test covers that ordering.

All 68 focused Phoenix tests pass, including seven new collateral tests. Native
queued effects currently have synthetic test coverage; the normal immediate
payout path has actual-program VM coverage. Durable collateral attempts,
finalized receipt/queue reconciliation and their scoped custody authorization
still need composition with the existing workflow ledger before enabling the
HTTP/UI flow. No production or Discover changes were made for this internal
checkpoint; available-market advertising remains unchanged.

## Durable execution checkpoint (not runtime-enabled)

- `phoenix-execution-journal.js` stores owner-bound workflows and exact native
  order attempts in a private SQLite ledger with FULL synchronization, strict
  schema/inventory checks and one unresolved attempt per wallet. It preserves
  signed bytes before returning them, commits UNKNOWN before a network attempt,
  and keeps position/collateral workflows held after an order finalizes.
- Signed evidence can be archived and reconstructed after a process restart.
  Reconstruction checks the wallet signature, exact native order packet, child
  PDA and funding amount, and is usable only for read-only reconciliation. It
  cannot become a pre-signing review or custody grant.
- An owner can cancel a never-signed preparation after restart. This releases
  only that unsigned opening reservation (or leaves the original position open
  for a cancelled close). SIGNED/UNKNOWN attempts cannot use that path. Unknown
  transactions are never automatically sent again. A changed opening policy
  revision does not prevent preparing a close under the current authorization.
- A separate one-use Phoenix signing capability checks the exact simulated wire,
  durable claim, paused owner controls, conflict checks, existing pending Jupiter
  and swap work, fee terms and restored backup scopes. The vault's new narrow
  `signPhoenixOrder` method persists the signed attempt before returning it.
  Jupiter's existing three-signature envelope policy was not widened.
- Encrypted runtime snapshots and paused restores support a `phoenix` database
  kind. The registry attests this scope only when it was actually included and
  restored. Backup CLI supports `--phoenix /private/path/phoenix.sqlite` alongside
  the existing fees/payments/swaps paths. An older executor refuses to start if
  it encounters a Phoenix ledger it cannot reconcile; it must not forget it.
- Unit tests use temporary unfunded custody identities, fabricated local bank
  fixtures and no broadcast transport. The real-program LiteSVM rehearsal from
  the previous checkpoint still uses zero signatures and fictitious balances.

These are server components, NOT an enabled HTTP action. Setup/onboarding,
collateral withdrawal/unwrap, fee collection, complete managed-account inventory,
shared cross-venue runtime exclusions and the existing-screen routing still need
composition and full-flow verification. There is deliberately no generic method
to release a funded workflow before verified settlement, and no publication yet.
Discover was reviewed: these internal-only changes do not justify advertising new
tradable markets or changing the public feature descriptions.

Verification at this checkpoint: 125 selected tests completed, 121 passed and
4 platform-specific tests were skipped; zero failures. This includes all 61
Phoenix tests plus the existing backup registry, runtime recovery, custody vault,
manual signing, recovery CLI argument and composed server runtime tests. Command:

```
node --test tests/phoenix-*.test.mjs tests/perps-backup-registry.test.mjs tests/perps-runtime-recovery.test.mjs tests/perps-custody-vault.test.mjs tests/perps-bot-manual-signing.test.mjs tests/perps-recovery-cli-stores.test.mjs tests/perps-server-runtime.test.mjs
```

This is a selected regression suite, not the full repository suite or browser
verification. The next broken/unimplemented boundary remains runtime composition:
no authenticated HTTP/UI action reaches this new ledger and signer yet.

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
  module by itself is NOT a durable journal or a custody grant. The durable
  checkpoint above adds reconstruction from private stored evidence.
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

This is NOT a browser/API integration or availability claim. Production
and Discover remain unchanged. The next implementation boundary is a durable
workflow journal with exact one-use signing permissions, backup/restart recovery
and cross-venue exclusions, followed by the existing UI and full-flow verification.
The durable checkpoint above implements the ledger and narrow order-signing
components; it does not yet compose the complete runtime workflow.

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
