# Phoenix: same-wallet integration checkpoint

Status: development only. Not connected to production signing or execution.

## Authenticated close-service/client checkpoint

`phoenix-manual-service.js` now composes the existing scoped vault, native account
and simulation proofs, durable attempts, receipt reconciliation and split payout
behind owner-bound status/positions/history and close-review/confirm/recover
operations. It has no default sender. The existing `/v1/automation` adapter accepts
strict Phoenix action fields only when an explicit service is injected; default
production composition still returns `phoenix-unavailable`.

The browser-safe `phoenix-manual-client.js` uses the existing JamdDmaj bearer
session and selected public wallet, not a new exchange login. Its close review is
one-use and bound to the same wallet/session. Unknown responses never authorize a
retry. The client rejects a broader tolerance, forged/expired reviews and a falsely
credited pending state. It is not yet mounted into the terminal's rendered UI.

A durable close consent binds the exact close message, owner/control revision,
five-minute payout deadline and explicit total network/rent cap. Subsequent payout
steps require that consent and stay within the remaining cap. Confirmation refreshes
native data while clamping the price to the stricter of the new 0.5% bound and the
original approved absolute bound. It cannot change the position quantity/side or
raise the approved protocol taker-fee rate. Failed/no-fill attempts require another
review; repeated polling cannot silently resend them. Status/history never sign.

The actual-program VM now includes a THIRD lifecycle through the real session
client → authenticated API → service → vault/journal → VM response path. It loses
the first close transport reply, returns UNKNOWN, closes/reopens SQLite and creates
a fresh service/client, then completes withdrawal and USDC conversion using the
stored bounded consent. Exactly three close/payout sends occur in the LOCAL VM;
the original close is not sent twice. The completed history and empty positions
return through the same client. Output includes `authenticatedCloseApiRestartVerified:
true`, `existingSessionClientVerified: true` and `networkSubmissions: 0`.

Validation: 175 selected tests, 171 passed, 4 platform-specific skips, zero failures;
all 82 focused Phoenix tests are included, as are the existing automation API,
control client, custody/backup/runtime regression files from earlier checkpoints.
A final focused client rerun passed after tightening key/nested-wallet validation.
This is not the full repository suite or rendered-browser verification.

Entry is explicitly unavailable until onboarding/setup, fee assessment/collection
and shared runtime exclusions are complete. The development history intentionally
does not invent a net PnL while platform-fee accounting is uncomposed. Remaining
recovery cases include queued withdrawal completion, interrupted never-broadcast
signed attempts, expired consent renewal and zero-collateral close settlement.
Combined equity/performance/sharing and terminal rendering remain pending.
No VPS/Vercel changes or public-market enablement occurred. Discover content,
navigation and styles were reviewed; no new availability claims are appropriate.

## Finalized collateral and scoped-vault lifecycle checkpoint

- `phoenix-collateral-receipt.js` verifies the exact wallet signature, finalized
  status/transaction bytes, native token balances, rent/SOL fees and the actual
  SPL transfer from the derived Phoenix/Ember vault to the wallet's correct ATA.
  A successful withdrawal without canonical credit is AWAITING_PAYOUT, not money
  received. Missing/confirmed-only responses stay unresolved and are not retried.
- Conversion evidence is bound to one verified canonical payout for the same
  wallet, child and amount. Read-only restart reconstruction carries the original
  withdrawal wire and rechecks its finalized payout before accepting conversion.
  Existing canonical balance or a mutable archive cannot substitute another
  position's payout. A conversion cannot precede its source payout's slot.
- The private ledger now persists WITHDRAW/UNWRAP attempts through the same wallet
  exclusion as orders. Workflows progress SETTLING → CANONICAL_READY → COMPLETE
  only on sealed finalized receipts. Accepted but unpaid requests remain held in
  PAYOUT_PENDING. COMPLETE releases the child for reuse; unsigned cancellation,
  failed conversion and unknown signatures cannot manufacture that state.
- A separate Phoenix collateral signing profile checks the exact simulated wire,
  paused owner controls, current durable phase, conflict checks and restored
  custody backup scopes. Its narrow vault method stores signed bytes before
  returning them and cannot be reused as an order or generic token-transfer grant.
- The real-program local VM rehearsal now runs both LONG and SHORT through the
  actual encrypted test vault, restored encrypted backup proof, order and payout
  signing capabilities, durable journal and exact native receipt verification.
  It closes/reopens SQLite between payout steps, verifies no remaining holds after
  credited USDC, and reuses the same isolated child for the second lifecycle.

The VM now creates a fresh encrypted temporary TEST identity rather than using
the fixed zero-signed wallet for every phase. Wallet-only transactions receive
real signatures from that isolated test vault; provider onboarding signatures
remain zero and signature checking remains local-only. No user keys, operator
production credentials, funded user balances or network submissions are used.
The harness's RPC finality responses represent its local VM, NOT mainnet finality.
The temporary test directory and its new keys are removed after the rehearsal.

Validation: 139 selected tests completed: 135 passed, 4 platform-specific skips,
zero failures. This includes all 75 Phoenix tests and the existing server runtime,
backup/recovery, custody, signing and recovery-CLI regression files used at the
previous checkpoint. The actual-program VM emitted
`durableWorkflowRestartVerified: true`, `scopedVaultAndBackupVerified: true`,
`localPayoutReceiptsVerified: true`, `networkSubmissions: 0` and
`readyForTrading: false`. A final focused receipt rerun also passed after adding
the source-payout slot check.

Still pending before availability: production parent/onboarding authorization and
setup simulation; queued payout completion evidence; native platform-fee payment;
complete managed-account inventory; cross-venue runtime composition; bounded
approval across setup/finality with the original 0.5% protection; authenticated
API/client/UI, combined positions/equity/history/sharing and browser verification.
The existing executor still refuses to ignore an uncomposed Phoenix ledger.
These development schemas have not been installed on production or migrated from
any real Phoenix database. Discover was reviewed: no new tradability claims or
public changes are appropriate until the remaining flow is actually available.

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

### Parent receipt/finality checkpoint — 2026-11-08 (internal only)

The parent receipt reader now checks finalized status, the exact approved message
and wallet signature, a valid signature from the pinned Phoenix onboarder, native
parent PDA, canonical register/onboard instructions, slot/block-time, full SOL
balance conservation, the separately approved rent/fee cap, empty token effects
and native System transfer/allocate/assign CPI evidence for the 1520-byte parent.
Missing/confirmed-only data remains UNKNOWN and never authorizes a resend.
Failed transaction accounting uses the network fee only, no rented account credit.

The database has an internal FINALIZED transition accepted only from the receipt
reader's private proof, with complete provider-signed bytes archived and checked
on restart. A provider response or copied transaction-facts object is not a proof.
This remains unconnected to production dispatch, activation and public UI.

Evidence scope is important: a bounded read-only public RPC capture found real
two-signature 32-position legacy parent registrations, but the matching captured
sample uses a sponsor payer DIFFERENT from its trader authority. It is explicitly
marked sponsoredFixtureOnly. It proves the pinned provider signature and native
creation effects, NOT owned same-wallet consent. The capture script defaults to
same-wallet filtering; --allow-sponsored-fixture is explicit and is only a fixture
option, not an execution-policy override. No send endpoint was called.

Transaction-facts verification is deliberately unbranded and can inspect that
public sponsored sample. The actual reconciliation entry point first checks the
strict SAME-WALLET durable setup profile; it rejects the sponsored sample. Tests
also prove those facts, even relabelled FINALIZED, cannot release an owned pending
setup after SQLite restart. Synthetic same-wallet records exercise pending reads
with fresh throwaway wallet signatures, not a forged Phoenix co-signature.
There is not yet a positive owned same-wallet parent finality/release fixture.
Do not claim that broader boundary verified or use the public sponsored sample
as permission to spend from another wallet.

Validation: 180 selected tests, 179 passed, one platform-specific skip, zero
failures; focused receipt rerun passed five tests after tightening token/loaded
address metadata checks. The five-lifecycle local program rehearsal still passes
with zero network submissions; its provider setup signature remains zero and
does not prove real provider dispatch. No user keys, funded tests or live schemas
were used. Remaining gates include provider-bound setup dispatch/recovery, child
setup authorization/simulation, complete inventory/runtime exclusions and UI.

Discover reviewed: discover.html/discover.js continue to describe only the
publicly supported BTC/ETH/SOL markets. discover.css and discover-tour.css need no
change for these internal receipt components. No publication/version change.

### Durable parent authorization checkpoint — 2026-11-08 (internal only)

The private Phoenix database now records parent setup independently of trading
workflows. Explicit approval binds the exact simulated message, owner, wallet,
control revision, maximum SOL cost and deadline. Root attempts progress PREPARED
→ SIGNED → UNKNOWN; only unsigned PREPARED attempts can be cancelled. There is
deliberately no FINALIZED/release transition until the provider co-signature and
native receipt verifier are implemented. A timeout cannot mark setup complete.

A separate one-use parent capability and signPhoenixParent vault method sign
only the wallet slot of the exact two-signer setup wire. The provider slot stays
zero. Signed bytes and the deterministic wallet transaction signature are stored
before returning from the vault. Current paused controls, sealed native evidence,
durable approval and all restored backup scopes are rechecked before and after
signing, and again before dispatch eligibility. No generic signing method or
existing Jupiter/order/withdrawal grant was broadened.

The setup table has one pending attempt per wallet; order, payout and fee
preparation reject an outstanding setup. Conversely root preparation checks the
shared pending view inside BEGIN IMMEDIATE, excluding concurrent order/setup
writers across database connections. Restart inventory validates signed bytes,
wallet signature, message hash, fixed native registration/onboarding data and
account identities, owner scope, cost/deadline and cross-table pending conflicts.
Schema hashing includes the new setup table/index in canonical order, and the
existing locked six-store recovery snapshot/paused restore validates pending
root records instead of silently dropping them. No live schema was migrated.

Evidence: the scoped-vault test uses a fresh encrypted temporary wallet and real
restored backup proof. It checks missing approval, insufficient cap, cloned
proofs, changed control revision, duplicate and cross-connection reservation,
order exclusion, persist-before-return, one-use signing, UNKNOWN before dispatch,
closed/reopened SQLite after expiry, refusal to cancel/re-sign and a locked
six-store snapshot/paused restore containing the unresolved setup. No sender is
called. Selected regression: 175 tests, 174 passed, one platform-specific skip,
zero failed; final focused registration/signing rerun also passed six tests.
The unchanged five-lifecycle native VM rehearsal still passes with zero network
submissions. Its parent execution remains zero-signed local-only, NOT proof of a
real provider co-signature or finalized parent receipt.

Remaining onboarding gates: actual provider-bound dispatch/reconciliation,
finalized co-signature and rent/state proof, wallet-only child setup simulation
and durable consent spanning setup and the original protected entry. Runtime,
rendered UI, full inventory/shared venue reservations, queued settlement and
other recovery gates remain pending; Phoenix is not publicly enabled.

Discover reviewed: discover.html/discover.js correctly retain the currently
available BTC/ETH/SOL descriptions. discover.css and discover-tour.css need no
change for this internal custody/journal checkpoint. No public version bump.

### Parent registration profile checkpoint — 2026-11-08 (internal only)

The documented no-referral builder path was checked against the current official
SDK docs and unsigned public builder output for a fresh, unfunded test address.
It uses build-register-ixs followed by a locally compiled, fee-payer-signed
transaction and send-register-ixs, where the provider adds its onboarding signature
and submits. The latter endpoint has NOT been called during this work.
Source: https://docs.phoenix.trade/sdk/register

phoenix-parent-onboarding.js independently reconstructs exactly two native
instructions for the default parent (0/0), maximum 32 positions: register and
delegated onboarding. Wallet payer, parent PDA, native exchange arenas, program,
log/global accounts and current pinned production onboarder/permission identity
are checked. Arbitrary builder instructions, additional signers, substituted
permissions and modified parameters are rejected, not copied into a transaction.
The canonical two-signer legacy wire has no deposit, trade or token transfer.

Read-only simulation verifies the exact wire, two-signature network fee, actual
1520-byte account rent, empty parent state, wallet position authority, native
capability flags 62, unchanged token accounts and unchanged onboarder SOL. The
permission identity remains fixed while its remaining signer-action count must
decrease by exactly one. Despite the SDK field name allowedSignerActions, actual
native execution proves it is a consumed quota here, not a static bitmask. The
entire permission data must otherwise remain identical. Quota exhaustion fails.
This corrects assumptions exposed by the actual native-program rehearsal, rather
than weakening checks to accept arbitrary post-state.

phoenix-parent-signature.js validates only the exact wallet partial signature
against the sealed preparation/simulation, retaining a zero provider signature.
It grants no custody access and cannot broadcast. Modified messages re-signed
by the same wallet, altered provider-signature slots and cloned proofs fail.
Tests use fresh throwaway keys only, never a user key or live transaction.

The five-lifecycle actual-program LiteSVM rehearsal now prepares and simulates
the parent through this module before its existing zero-signed LOCAL registration.
Output includes parentProfileAndSimulationVerified:true and networkSubmissions:0.
Root provider signatures remain zero in RAM; no live co-signature/finality claim
is made. Durable setup authorization/journal, scoped vault grant, provider-bound
dispatch/reconciliation and wallet-only child setup simulation still need wiring.
The public UI/runtime remain disabled for Phoenix while these gates are pending.
Validation: 151 selected tests passed, zero failed/skipped (all Phoenix tests,
existing automation API, platform fee and custody vault). The final focused
five-test registration/signature file also passed after adding partial-signature
and expired-proof cases. Full repository/browser verification remains pending.

Discover reviewed: discover.html/discover.js correctly retain publicly supported
BTC/ETH/SOL only; discover.css/discover-tour.css need no changes for this internal
unsigned profile. No release/version or available-market claim was changed.

### Entry service/session checkpoint — 2026-11-08 (internal only)

The native service now implements entry review, explicit confirmation and
signature-based recovery through the existing authenticated automation API and
same-session client. The browser supplies symbol, side, margin and leverage,
never a raw packet, account index, wallet owner identity or reference price.
The server selects an existing policy-compliant flat child that is not held by
another workflow. Missing setup reports ONBOARDING_REQUIRED: it does not invent
registration approval, pay rent or request a second wallet behind the scenes.

Confirmation refreshes native evidence while retaining original full FOK size,
margin, notional cap and the stricter absolute tick bound. Native/API risk tiers
and protocol fee cap are rechecked. SOL budget includes the separate bounded
fee-payment authorization; sufficient USDC includes the original 20bps charge.
After signing, UNKNOWN is durable before the sole network dispatch. Entry and
fee finality are reconciled separately. A later fee-preparation failure must
return the known opening operation with attention required, not a failed-entry
error that could encourage another opening.

The local native-program rehearsal now has five complete lifecycles. The fourth
starts at prepareEntry/confirmEntry through the real client/API/service, loses
the send response, reopens SQLite and verifies the opening and one commission
without a duplicate send, then fully closes and settles. The fifth injects a
fee-preparation error after a finalized opening, verifies OPEN is still returned,
recovers only the commission and closes. All sends terminate in LiteSVM RAM.
Published program state is only read; no user keys or live orders are used.

Browser negative tests reject changed side/margin/leverage, wrong recipient or
commission, widened tolerance, oversized approval window, session change,
cloned review, missing approval and repeat confirmation. Planner tests cover
retained full size, spend cap and strict tick bounds under quote movement.
Selected regression: 146 tests passed, zero failed/skipped (all Phoenix tests,
automation API, platform fee and custody vault). The native rehearsal reports
authenticatedEntryApiRestartVerified and feePreparationFailureKeepsEntryVerified
with networkSubmissions:0 and readyForTrading:false.

The public terminal is NOT wired to these entry methods, runtime activation is
still disabled and status intentionally reports entry release gates pending.
Initial parent/co-signer setup, full inventory/shared reservations, queued
payouts, interrupted/expired authorization recovery and rendered UI verification
remain required before enabling markets. This does not prove universal token
support or production latency under the short native evidence TTL.

Discover reviewed again: discover.html/discover.js still accurately describe
BTC/ETH/SOL as the publicly supported futures markets. discover.css and
discover-tour.css need no change for these internal service/client additions.

### Native fee checkpoint — 2026-11-08 (internal only)

The Phoenix execution ledger now binds commercial fee consent to the original
unsigned opening attempt, wallet, owner, control revision, terms version, expiry
and cumulative SOL budget. Only a verified finalized opening fill can produce a
namespaced assessment. The fixed commission is 20 basis points of contributed
margin, not leveraged exposure. Failed/no-fill openings cannot assess a charge.

Payment uses a separately sealed native review and one-use scoped vault grant.
It reuses only the exact fixed-recipient USDC wire/effect verifier; Jupiter's
custody grant and payment journal explicitly reject the native review stage.
SIGNED and UNKNOWN payment records survive process interruption. Only matching
finalized signed bytes and actual token/SOL effects mark PAID. Failed payments
consume their network fee from the approved total budget; they are not an
automatic retry authorization. A paid assessment cannot be charged again.

Local rehearsal additionally loads the published Memo program and executes the
exact signed fee transfer in LiteSVM after a genuine native fill. Recipient ATA
and wallet balances are fictitious RAM state. It loses the payment response,
reopens the private SQLite ledger, verifies finality and continues the existing
long/short close/withdraw/unwrap and authenticated service/client scenarios.
No network submissions or user keys are used. This is NOT a live trading test.

Evidence: journal tests cover absent/retroactive consent, brand forgery,
cross-venue rejection, concurrency exclusion, lost response/restart, paid-once
and failed-payment budget exhaustion. The native fee grant is also exercised
through the real encrypted temporary test vault in the local VM rehearsal.

Still pending: entry service/API/browser composition, root setup/co-signer
authorization, queued payout completion, expired-consent recovery, interrupted
signing recovery, cross-venue runtime exclusion and full user-interface checks.
Fee debt/status and realized result projections are not yet connected to the
native service history. Runtime activation and deployment remain disabled.

Discover review: discover.html, discover.js, discover.css and discover-tour.css
remain unchanged: this checkpoint is internal and does not make more markets
available on the public web. No public availability or release claim is made.

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
