# Manual Long/Short with exclusive bot custody

Status: web 1.38.18 and worker published. Manual per-order feature available;
no account activated and no real financial operation performed by this work.

Worktree: `.perps-build/bot-manual-release`, branch `codex/bot-wallet-manual-futures`.
The original worktree retains unrelated unfinished Fair Launch/news edits. Do not
include those in this financial release or overwrite them.

## Implemented

- Authenticated `botManualStatus/Prepare/Confirm/Recover` actions check durable
  owner mapping before custody access. Public watch addresses confer no authority.
- Manual policy uses the existing owner/wallet manual-policy database, not bot
  activation settings. The shared execution journal holds capital/fees and
  enforces loss, position and daily limits again before signing.
- Paused automation is required throughout the manual review. A manual entry
  never activates automation, imports Android keys or reconnects Phantom.
- The original inspected exact-wire preparation is bound to a one-use grant.
  Durable SIGNING precedes key access; signature identity and UNCERTAIN precede
  the single Jupiter execution request. Lost responses cannot resend.
- Per-entry explicit 20-bps USDC fee consent is distinct from an automation
  mandate. A manual fee can settle while paused; paused standing automation
  mandates still cannot pay. Network costs remain trader SOL.
- Futures watch-account entry stays in Futures, verifies server ownership,
  displays review/consents and allows pending-state lookup. Manual policy UI
  now supports the selected watch account as well as Phantom.
- Runtime flag `--bot-manual` is opt-in and requires execute mode, swap exclusion
  and platform-fee integration. Startup does not create a policy database.

## Evidence

- Isolated real cryptographic fixture signs precisely the original manual
  preparation once, with genuine ephemeral custody, risk journal and backup
  proof, while controls remain paused. No funded key or real broadcast.
- Full service fixture verifies review, two consents, shared reservation, fee
  consent, one mocked send, timeout retention and no replay.
- API tests verify authenticated ownership before all four actions and default
  unavailable behavior. Client tests reject altered wallet/price/fee, expiration,
  cloned review, missing consent, replay and changed session.
- Fee test verifies manual per-entry payment authorization while paused, rejects
  foreign owner/changed amount and never creates an automation mandate.
- Browser-model regression verifies watch Long stays in Futures rather than
  redirecting to Assets or asking Android/Phantom to sign.

## Publication and verification

1. Final clean-worktree full suite: 1316 tests, 1297 passed, 19 skipped, zero
   failures, including the final client/API/policy and close regressions.
2. Compiled real DOM positions/close panel tested desktop and mobile, financial
   network blocked. Separate unchecked close consent required; pending recovery
   retained. Entry form regression stays in Futures for watch accounts.
3. VPS isolated crypto fixtures: manual inspected owner signature, complete
   entry service with timeout, and manual full close wrapper all pass on Node
   22.23.1. No funded keys, real sends, deposits or strategy activation.
4. Close UI uses existing native price-bound close and subsequent protected USDC
   conversion, with explicit consent to both stages and TP/SL cleanup. Does not
   claim an absolute first-leg payout minimum. Full tracked positions only.
5. Worker installed with --bot-manual. SHA256:
   17ab1fd592dadd7bc5ca7110da644dbbea3b31f9ed1ecc4226c2cc497258bda5.
   Previous worker, service files and stopped-store SQLite snapshots preserved
   privately at /opt/jamddmaj-perps/backups/manual-futures-20261101.
   HTTPS is a dependent unit and must be explicitly started after worker restart;
   restored, public TLS health and correct CORS/auth refusals verified.
6. Production candidate tested before promotion:
   dpl_G3TRwB24YVQrCH312hxDEZsMojUR,
   https://jamd-dmaj-ioar0pxq5-jamd-dmaj-s-projects.vercel.app.
   Public /api/status reports webVersion 1.38.18; entry/positions modules,
   Futures integration and Discover notice verified on www.jamddmaj.com.
   Compiled candidate entry module equals local tested module after normalizing
   only esbuild dependency-path comments. CSS/tour reviewed, unchanged.
7. No stored manual policies existed at rollout. User must explicitly save their
   own per-wallet manual limits before order review. No default risk values or
   bot limits were copied. Genuine signed-in user review requested; awaiting
   user result. Do not call this a completed real-money trade test.
8. Additional actual service regression passes: changing manual policy or control
   revision, or revoking custody backup after review, rejects confirmation before
   reservation/signing/send. These three scenarios use ephemeral fixture state.

Android APK remains 1.38.17 on the public update feed; this publication does not
claim an Android 1.38.18 release or a financial operation on a phone.

## Unpublished follow-up: strict 50 bps entry protection

The owner explicitly chose to retain 0.5 percent protection. The provider's
USDC-funded Long pre-swap floor remains insufficient; it is NOT waived.
Short preparation passed genuine unsigned server simulation after validating
the program-owned, readonly optional TokenLedger account. These local changes
are not installed in the production worker or published web.

The candidate web now retrieves the public market reference before a bot-wallet
review, discards stale responses on edits/market changes, and includes that
module in its browser build. Focused web review/navigation/import tests pass.
The full suite's two observed failures were the missing built module and the
outdated test transport fixture; both were corrected and their focused tests
passed. A complete post-fix suite has not yet been rerun.

A fixed, unsigned Swap2 first-leg constructor for USDC to BTC/ETH/SOL was added
for investigation of a protected collateral-funded Long. Actual mainnet RPC
simulations for all three assets returned `err: null` without signatures or
submission. This is NOT a complete entry path or spending authorization.

The new exact-effects validator remains fail-closed: genuine BTC simulation
changes custody suffix bytes beyond the older conversion policy's immutable
prefix/tail model. Observed USDC changed offsets include 972–976, 988,
1004–1010 and 1020–1026; BTC includes 988. These fields require native IDL
identification and bounded effect validation before any permission is granted.
No tail check was removed. Opening with exact received collateral, durable
first-leg reservation/receipt, recovery and explicit second-leg review are
still incomplete. No financial operation, signature or send was performed.

Discover HTML, JS, CSS and tour were reviewed. No public description changed:
this work is unpublished and does not yet establish Long trading availability.

### Follow-up native accounting validation

The genuine Anchor IDL was re-read at confirmed slot 464254894. Its SHA256
still matches the pinned 1d90a653...f7d653 layout. The previously rejected
suffix changes are borrowsFundingRateState (972), debt (1004) and
borrowLendInterestsAccured (1020), not changed permissions. A narrow helper
now preserves all other suffix/configuration bytes, requires monotonic clocks
and interest indices, and requires debt growth to equal accrued-interest growth
(no new principal). It does not claim to independently reproduce protocol
interest economics. Exact fixed Swap2 wire and vault/wallet conservation are
independent mandatory checks.

Actual read-only server diagnostics subsequently reached
PROTECTED_ENTRY_CONVERSION_EFFECTS_SIMULATED for BTC, ETH and SOL, all with
readyForSigning false and submitted false. SOL had one transient RPC failure
and passed a subsequent fresh read-only preparation. A stricter 2 bps output
buffer was used during unsigned construction; the independent cap remains
the user's 50 bps. No existing signed message was altered.

The post-fix CI suite completed: 1330 tests, 1311 passed, 19 skipped, zero
failed. New effect tests cover all three markets, existing/new collateral
ATAs, wallet/vault conservation, malformed principal/configuration changes,
oracle mutations, replaced blockhash, native errors and moving bank snapshots.
These prove only their covered boundaries, not a complete two-leg Long flow.
Durable entry-conversion coordination, finalized first-leg receipt binding,
exact-collateral opening and its UI/signing integration remain pending.

### Joined first-leg preparation and lifecycle (unpublished)

`prepareProtectedPerpsEntryConversion` now joins a validated Long draft to
fresh confirmed custodies, native oracle bounds, a fixed unsigned wire and
exact-effects simulation. Its public review contains no transaction bytes,
is bound by private evidence, expires within ten seconds and still reports
readyForSigning false. Actual unsigned server runs reached
PROTECTED_ENTRY_CONVERSION_PREPARED for BTC at 464271401, ETH at 464271406
and SOL at 464271413. None was signed or sent.

The separate first-leg engine requires explicit one-use approval and current
external authorization, re-simulates the original wire before consumption
and submission, compares reviewed costs, and writes durable uncertainty before
one send. Fixture tests use newly generated unfunded keys and mocked transport:
both success and transport-timeout paths record before send and reject reuse.
This engine is not an HTTP endpoint, a custody grant, or the complete Long
workflow. Bot ownership/manual-policy/risk/backup composition, finalized
collateral receipt binding and the second-leg opening remain required.

Discover was reviewed for this internal-only work. No page/tour change is
appropriate until the complete path is available and verified. No deployment
or real financial operation was performed.

Post-change CI completed with 1334 tests: 1315 passed, 19 skipped, zero failed.
The skipped tests and absence of a real financial send are not proof of a
completed production Long order. Publication remains pending.

### Finalized protected-entry receipt and signed-intent binding (local only)

The finalized conversion reader now has distinct private receipt brands for
entry collateral and close payout. Entry reconciliation verifies the exact
signed wire, finalized native CPI and vault/token/SOL deltas for BTC, ETH and
SOL, including new or existing collateral ATAs. Only the received delta is
reported; pre-existing collateral cannot inflate it. A pending status returns
no receipt. An entry receipt cannot pass the close-payout guard.

The entry binding reads the authoritative private swap journal, requires the
same owner, wallet, signed intent, wire hashes, protected review and finalized
receipt, and rejects a never-broadcast claim. It produces no signing authority
or risk release. Separate durable entry reservation and opening authorization
remain required; this component is not yet wired to the production service.
Eleven targeted tests passed using ephemeral unfunded keys and local fixtures.

Discover HTML, JS, CSS and tour applicability reviewed: no public content change
is appropriate for this unpublished internal reconciliation work. No financial
operation, deployment or change to the user's strict 0.5% limit was performed.

Full CI after this change: 1337 tests, 1318 passed, 19 skipped, zero failures.
These checks do not prove the still-unconnected production opening flow.

### Collateral-funded opening debit and builder transport (local only)

Added a separate funding inspector requiring the fresh private entry binding.
It debits exactly the finalized received collateral, preserves old collateral
and unrelated USDC, and reports zero new USDC debit. The original USDC funding
path is unchanged. WSOL debit and ATA closure account for native principal
separately from refunded rent; a fabricated principal refund is rejected.

The second-leg builder adapter now uses the bound collateral symbol and exact
received integer units. Original margin USD must match the conversion cost,
side must be Long, asset/wallet must match, and intent protection remains 50
bps while the builder is asked for a tighter 25 bps. Builder output remains
UNVERIFIED_PREPARATION; no transport result is signing authorization.
Official /positions/increase inputToken and integer-unit contract rechecked:
https://perps-api.jup.ag/v1/docs (2026-11-01).

Targeted BTC/ETH/SOL binding, funding and mocked builder tests passed. Web build
passed. Full service integration, independent collateral-opening transaction
inspection, durable risk reservation and separate confirmation remain pending.
No real financial send or deployment occurred. Discover page/script/styles/tour
were reviewed; no public content update is appropriate for unpublished work.

Final CI for this change: 1339 tests, 1320 passed, 19 skipped, zero failed.

### Joined collateral-opening inspection (local, 2026-11-02)

Manual preparation now accepts the private finalized entry binding explicitly.
The opening-instruction policy requires Long, exactly the received collateral
delta, canonical collateral ATA, native custody/PDA bindings and a chain bank
at or after the finalized conversion. Auxiliary pre-swap/ledger instructions
are forbidden on this explicit-amount path; a builder-supplied optional native
ledger must remain genuine, readonly and inert. The old USDC Long and Short
policies retain their existing behavior.

Exact-wire position simulation privately carries the binding and watches both
collateral and USDC. Its funding gate consumes that private evidence and checks
the collateral debit, original holdings, fees and rent without inventing an
additional USDC margin debit. The full manual-review function connects builder,
envelope/core inspection, native custody, token setup, funding-plan inspection,
position/exits simulation, exact spending and current account checks.

Joined tests pass for BTC, ETH and SOL with a provider-only fixture signature,
no owner signature/send, and only 3 USDC left after the modeled conversion.
Review remains non-signing and requires the original fresh private receipt.
Full CI: 1339 tests, 1320 passed, 19 skipped, zero failed. An earlier observation
handle was absent after the turn change; this result is from a new completed
run, not an assumption about the missing handle.

The production service still needs a reservation spanning both legs, signing
composition and durable recovery. In particular, do not feed the new review
into the old USDC-only signing reserve or fabricate available-USDC balances.
No deployment/financial operation occurred. Discover page, script and both
stylesheets/tour remain unchanged appropriately for internal unpublished work.

### Durable entry-conversion reservation (local, 2026-11-04)

Added a distinct entry hold in the execution journal, unique by conversion ID
and linked to the existing manual reservation. Holding requires the privately
constructed strict conversion wire, exact wallet/asset/USDC amount and canonical
Long draft. Finalization requires a fresh private finalized receipt binding.
Neither an unfinished hold nor a finalized one can be released using ordinary
unsigned cancellation. Signing and revalidation require the matching private
binding; the original margin continues to consume capital/loss/position limits.
Only the already-converted margin is excluded from the new USDC cash debit;
platform fees and other reservations still require available USDC.

BTC/ETH/SOL tests reopen the real temporary SQLite journal, retain the hold,
refuse missing bindings, enforce full capital limits and require fee reserves
even with only 3 USDC remaining after the modeled conversion. Encrypted archive
tests retain a pre-broadcast hold, restore it without permitting signing or
cancellation, and reject a changed draft margin or missing swap history.

The recovery schema now includes entry holds. Previous archives remain
recoverable, but startup cannot silently migrate the prior production schema.
The explicit paused-empty migration handles that precise prior schema by adding
only the hold table; a test verifies rollback copies and unchanged controls.
Historical rows are still refused by the empty-only migration, not erased.
The new migration has NOT been run on production.

Still required: service-level first-leg authorization, durable recovery for
finalized collateral and failed steps, daily-account history integration,
second-leg signing composition, API/UI integration and full-story verification.
No deployment, owner/custody signature, send, trade or bot activation occurred.
Discover HTML/JS/CSS/tour were reviewed as internal-only unchanged functionality;
no public claim or content update is appropriate yet.

Validation: full CI completed with 1341 tests, 1322 passed, 19 skipped and zero
failures. The expanded paused-migration refusal corpus also passed separately
for both legacy and prior-platform-fee schemas (9 tests total). The skipped
checks are not evidence of full production readiness.

### Recorded entry recovery (local, 2026-11-05)

Added read-only recovery from the original privately verified swap journal.
It checks ownership and mainnet genesis, reads finalized native custodies,
extracts only constructor inputs from the historical message and reconstructs
through the native strict constructor. Every original message byte must match;
there is no new blockhash, route, signature, send or JSON-to-proof conversion.
The existing exact finalized receipt reader checks signed wire identity,
transfers, balances and fees before constructing the fresh private binding.
The swap row must remain unchanged across asynchronous reads.

Recovery can join that binding to the original execution-journal entry hold.
It retains pending finality without releasing capital and finalizes the hold
only when the original wallet/asset/amount match. Repeated recovery is idempotent;
neither finality nor a recovered binding automatically opens a position.

BTC/ETH/SOL tests use a reopened swap database and a reopened risk journal,
reject a foreign owner, wrong network, stale bank and exchanged custody roles,
and preserve the held reservation while awaiting finality. These use unfunded
fixture keys and mocked read-only RPC, not real custody signatures or sends.
Service/API/UI integration and real unsigned-provider full-story verification
remain pending. No release or Discover functionality change is claimed.

Validation: full CI completed, 1341 total / 1322 passed / 19 skipped / zero
failed. Additional targeted adversarial recovery checks passed for all three
assets after that run: modified durable minimum and journal change during RPC.

### Pre-conversion risk revalidation (local, 2026-11-05)

The execution journal now exposes a distinct pre-conversion revalidation for
the RESERVED/HELD stage, requiring the privately constructed wire, original
conversion ID and exact canonical draft. It checks the complete original USDC
margin plus platform fee; no finalized-conversion cash discount is allowed at
this stage. A shared internal risk check preserves the existing opening-signing
capital/loss/position/daily limits and account freshness behavior.

BTC/ETH/SOL tests reject changed IDs/drafts, stale balances, insufficient USDC
including fees, lowered capital and reuse after hold finalization. The existing
journal concurrency/restart tests passed alongside these (11 tests total).
This is a risk gate, not custody authorization: first-leg signing composition,
service/API/UI integration and release remain incomplete. No financial action
or public functionality/Discover change occurred.

Full CI completed: 1341 total, 1322 passed, 19 skipped, zero failed. Targeted
tests also cover the new gate's daily-loss/position/trade quota refusals and
confirm refusals leave the reservation RESERVED, without signing or release.

### One-use first-leg custody authorization (local, 2026-11-05)

Added a distinct protected-entry authorization path to the existing one-use
custody capability module. Generic swap/transfer consent cannot authorize this
stage. It consumes the private engine grant, requires the private preparation,
and compares the exact native message with the durable swap claim and original
entry reservation/draft. A freshly branded finalized daily-account proof,
current owner control revision, unchanged manual policy, exclusive pending-work
checks, and restore-verified swap/platform-fee backup scope are mandatory.
All checks run again when the custody vault consumes the one-use permission.

Tests create new unfunded encrypted custody wallets and use the actual vault
signer, followed by one mocked send only after durable UNKNOWN state. They
verify one-use consumption and retain the original HELD reservation for later
finality. Changed controls, policy, backup or hold reject before vault signing;
copied preparation, weakened review and unbranded daily-account JSON reject.
The backup-attestation rows are an explicit persistence corpus; real encrypted
archive restore verification remains separately tested, not claimed by this
fixture. No production key/wallet, network send or real trade is used.

Service orchestration still must create and bind both reviews/reservations,
recover interrupted stages and wire the API/UI. This module does not make the
public Long/Short flow complete. No release occurred; Discover HTML/JS/CSS/tour
remain appropriately unchanged for this unpublished internal functionality.

Full CI completed with the new authorization code: 1353 total, 1334 passed,
19 skipped, zero failed. The subsequent expanded targeted corpus covers all
three assets with actual ephemeral vault signing and rejects changed controls,
unbranded daily accounts, foreign owners and copied execution journals; this
adds tests, not broader production-readiness evidence.

### Original-reservation opening continuation (local, 2026-11-05)

The manual service can review a collateral-funded opening against its original
entry reservation. Before builder access it checks the authenticated owner,
paused controls, exact stored draft, RESERVED parent, native swap journal and
fresh finalized recovery. Exact receipt recovery now settles the original swap
exclusion FINALIZED, without releasing the execution reservation. Other pending
orders still block continuation. The API accepts an optional entryReservationId
only on manual preparation, after existing authenticated ownership checks; it
does not accept transaction bytes or confer signing authority from that ID.

The review requires only remaining USDC fees, not a second margin debit. On
explicit confirmation the service reuses the original reservation and fee terms,
binds its fresh privately inspected exact position/exit plan, then uses the
existing one-use opening authorization with the finalized entry binding.
An already-bound different plan or a non-RESERVED parent cannot be overwritten.
Errors before signing do not cancel the already-converted collateral hold.

Joined BTC/ETH/SOL tests exercise the real service review with 3 USDC remaining,
one existing reservation, owner/draft refusal and missing confirmation consent.
The review-only harness forbids every vault signature, send and fee collection.
Its finalized-history RPC is an explicit empty-history model, not evidence that
production entry-conversion daily history is implemented. Real pending-entry
daily-account reconciliation, first-leg service creation, public UI progression,
opening signing/broadcast integration tests and release remain required.
Discover HTML/JS/CSS/tour remain unchanged: no public functionality was released.

Full CI for the continuation core completed: 1359 total, 1340 passed, 19 skipped,
zero failed. Subsequent API tests also verify the owner-bound continuation ID,
refusal of client transaction bytes, and a safe 409 pending-finality response
without automatic retry. The earlier test failure was a stale second settlement
expectation after recovery began settling the exact receipt; it was corrected
to assert the already-FINALIZED state, not to permit duplicate settlement.

### Service-owned protected first leg (local, 2026-11-05)

Added the first-leg orchestrator to the manual service, available only with an
explicit native swap journal, custody swap signer and separate send transport.
The default service remains unchanged when these dependencies are absent. A
Long rejected specifically for the native pre-swap minimum can offer a separate
strict 50-bps conversion review; other native inspection failures are not waived.
Review creation cannot reserve risk, sign, collect fees or submit transactions.

Explicit current-order and fee-term consent consumes that review once. The
service reserves original margin plus fee, records the exact original draft and
position, attaches the durable conversion hold, obtains the private one-use
custody grant, signs through the vault and journals UNKNOWN before one send.
No automatic opening follows; the existing finalized-collateral continuation
requires its own fresh review and explicit opening confirmation. Operation/status
projection retains conversion identity/state without exposing transaction bytes.

BTC/ETH/SOL service tests use actual new encrypted unfunded custody wallets and
mocked reads/sends. They cover preparation via the strict-floor fallback, direct
first-leg review, missing order consent, missing fee consent, wrong terms, one
send, duplicate refusal and a transport timeout. Reconstructing the service
retains UNKNOWN state and never resends. These tests do not prove live provider
or production daily-history compatibility.

Failure before a proven broadcast currently retains HELD capital for explicit
recovery rather than guessing that it is safe to release. Durable unsent/failed
recovery, entry-conversion daily history, browser progression, complete opening
confirmation/broadcast tests and deployment remain pending. No production funds,
keys, sends or bot activation were used. Discover HTML/JS/CSS/tour were reviewed;
no public change is appropriate for this unpublished internal-only increment.

Validation: full CI completed with 1367 total / 1348 passed / 19 skipped / zero
failed. The six service/funding timeout tests passed again with an additional
assertion that Short cannot enter this Long-only conversion path.

### Never-broadcast recovery without lost audit (local, 2026-11-05)

Added a separate terminal recovery path for an entry conversion still in swap
SIGNING or already ABORTED. The swap journal atomically aborts SIGNING before
risk release; it cannot abort UNKNOWN. The execution journal requires the real
swap journal, exact owner/wallet/conversion ID, original reservation ID, canonical
draft, amount, strict cap and terminal ABORTED record before cancelling the
RESERVED parent. Both the original hold and the swap record are retained.
Repeated recovery is idempotent and requires a new review for any new order.

Manual-service failure cleanup uses that same path. If failure occurs before
claim creation, it records an unsigned terminal ABORTED audit intent first.
The cached original wire used for that audit is never used as fresh signing
authority. Failure after durable UNKNOWN never releases capital or retries.
The authenticated recover endpoint also handles interrupted SIGNING without
any network call, new signature or transport attempt.

BTC/ETH/SOL tests cover consent-store failure, signer refusal, simulation failure
after an actual unfunded custody signature but before broadcast, and interrupted
SIGNING with an unused grant. The terminal journal transition invalidates that
grant before signing; foreign owners and UNKNOWN release attempts are refused.
An encrypted archive test restores CANCELLED + retained HELD + ABORTED history,
preserves the reduced pending-risk count, and rejects a contradictory SIGNING
record. No tables/rows or history are deleted to achieve recovery.

On-chain failed/expired attempts and finalized-collateral recovery remain
distinct; this increment does not release them. Complete daily entry accounting,
opening-confirmation integration, public interface, live unsigned verification
and deployment still remain. No real-funded signatures/sends/trades occurred.
Discover HTML/JS/CSS/tour were reviewed and left unchanged: internal unpublished
recovery work does not justify a public availability claim.

Validation: full CI completed, 1379 total / 1360 passed / 19 skipped / zero
failed. The expanded encrypted-recovery test also passed separately after
adding rejection of a mismatched reservation ID in the retained swap review.

### Rooted entry-conversion history facts (local, 2026-11-05)

Added a distinct private history proof for the protected first leg. It requires
the genuine finalized transaction, execution hold, original manual reservation
and swap journal. Signature lookup is bounded and does not whitelist unrelated
PoolSwap events. The exact recorded native wire is reconstructed and its strict
receipt verified again, using the complete-history reader's captured immutable
transaction bytes/metadata rather than a conflicting second RPC transaction.

The fact binds original wallet/asset/draft/amount, received collateral, fee in
collateral units, native CPI swap-USD field, slot/day and network fee. It is not
an opening, signing permission, complete daily account or an independent USD
valuation. The network fee remains a separate daily-account component; future
entry valuation must not count it twice or assume USDC equals one USD.

The original short-lived recovery proof is now returned by an internal evidence
reader shared with the history checker; the public recovery behavior is retained.
Historical facts can outlive a signing lease, but are invalidated if their journal
snapshot changes. An unchanged cached finalized fact cannot authorize a trade.
BTC/ETH/SOL tests reject copied facts/transactions, an unrelated journal,
conflicting token balances and stale journal snapshots, then rebuild the proof
from the original captured transaction. Fixture swap-USD fields now model the
entry's USD amount independently of collateral base-unit decimals.

Independent USD cost valuation and daily-reader integration are still required;
the existing reader continues rejecting unrecognized swaps instead of assuming
zero loss. No production deployment or financial operation occurred. Discover
HTML/JS/CSS/tour were reviewed: no public availability change is appropriate.

Validation: full CI completed, 1379 total / 1360 passed / 19 skipped / zero
failed. The focused entry history/receipt corpus also passed (5 tests), covering
captured contradictory token metadata and cache invalidation/reconstruction.

### Entry USD valuation and daily-account integration (local, 2026-11-05)

Added bounded read-only historical USD references for USDC/BTC/ETH/SOL, with
fixed Kraken pair identities and explicit assetVersion=1 display keys. API
contract rechecked against https://docs.kraken.com/api-reference/market-data/get-ohlc-data:
current last bars are uncommitted and retention is limited. Recent facts use
closed minute bars; older same-day facts or minute gaps use one bounded closed
five-minute fallback. Open/absent/zero-trade bars, malformed prices, wrong pairs,
overlarge bodies, stale leases and HTTP failures never become zero-cost data.
Only validated closed bars survive the current-day cache.

The privately branded entry valuation rounds spent-USDC upper USD value upward,
received collateral lower USD value downward, and observed collateral-fee upper
USD value upward. Per-entry risk is the greater of the nonnegative basis/value
gap and output-fee floor. The input basis also retains the verified native CPI
swap-USD value as a floor. Arithmetic is integer-only; gains cannot offset other
entry losses. Network fees are excluded here and counted once by the existing
network-fee valuation. BTC/ETH/SOL are underlying-market proxies, NOT guarantees
that the wrapped collateral mint tracks its underlying or an executable quote.

The finalized daily reader now recognizes only the exact journalled first leg,
requires this independent valuation, includes its cost in daily loss and counts
no futures Increase event for the conversion. Missing/forged valuation, missing
swap history or an unrecognized swap still fail closed. Runtime account-reader
construction now passes the native swap journal and this valuation reader.
This does not yet enable the first-leg send dependency or publish a release.

An opening's private entry binding forces the exclusive-custody baseline to
include that known finalized conversion and its costs, even if an otherwise
fresh five-second cached baseline predates it. Signing independently verifies
this inclusion. Binding metadata now retains verified execution day/block time;
an older-day conversion is not charged a second time today, while original held
margin and fees remain reserved. No caller-supplied dates create that binding.

Tests cover real private entry-history facts for all three markets, depegged
USDC reference bounds, exact rounding, fee floors despite a reference gain,
expiry, incomplete quote data, duplicate/forged facts, no extra futures trade,
one network-fee charge, stale pre-conversion cache refusal and overnight risk.
Public read-only smoke check also validated current closed OHLC response shapes
for all four fixed pairs, with zero signatures and zero sends. These market data
reads disclose no wallet/owner/balance or transaction bytes.

Still required: complete opening-confirmation/broadcast integration, failed or
expired on-chain conversion recovery, public client/UI progression, deployment
and full-story verification. Discover HTML/JS/CSS/tour were reviewed; unpublished
internal accounting changes do not justify an availability claim. No real funds
were signed, transferred or traded, and automation was not activated.

Validation: full CI completed, 1382 total / 1363 passed / 19 skipped / zero
failed. The final targeted accounting/history/bounds/signing corpus passed all
20 tests after the additional overnight-binding checks. The public quote-only
smoke probe validated four closed minute-bar shapes without logging prices,
wallet identities, balances, signatures or transaction bytes.

### Joined custody conversion and opening confirmation (local, 2026-11-05)

Added joined BTC/ETH/SOL tests that take the actual first-leg bytes signed by
new unfunded encrypted custody wallets, reconstruct those exact bytes through
the native constructor, and model a finalized strict receipt. The service then
reviews the collateral-funded opening using complete one-entry daily history
and independently branded USD/network cost evidence. Its second explicit
confirmation reaches the actual custody opening signer and one mocked provider
execution attempt. Conversion and opening keep one original risk reservation.
Timeout on the opening send leaves UNCERTAIN state and does not permit a second
attempt on the consumed review or after recreating the service.

The test uses the real fee-consent journal: both phase confirmations retain one
commercial consent and zero assessments/collections before a finalized opening.
It also requires separate order/fee approval at the opening step and preserves
the original collateral hold. Market data, account banks, fees, rent and provider
transport are explicit mocks. The result is an uncertain submitted opening, NOT
proof of a real finalized position or mainnet transaction success.

This exposed a missing durable exit-request link in the collateral continuation.
bindEntryOpeningReview now atomically persists each privately simulated native
SL/TP request in the same unique binding table used by ordinary reservations.
It rejects another reservation's address and preserves idempotent same-plan
binding. The joined tests include a native pending stop loss and verify its
durable address binding before broadcast. No direct-close/settlement authority
is inferred from the new records.

The finalized-receipt fixture can consume only an exact already-signed entry
wire for the explicitly supplied ephemeral wallet, without exporting its custody
key. This is test infrastructure, never an API path or production signer.
Still required: finalized-opening reconciliation, failed/expired conversion and
collateral recovery, full public client/UI flow, unsigned live-provider checks
and release verification. Discover HTML/JS/CSS/tour were reviewed as internal
unpublished work; no public functionality or funds were changed.

Validation: full CI completed, 1388 total / 1369 passed / 19 skipped / zero
failed. The six final joined opening/timeout cases passed again after adding
separate opening-consent refusal assertions and the persisted native SL link.

### Failed second-leg collateral retention (local, 2026-11-06)

Broadcast reconciliation now refuses to close a failed opening when an entry
conversion hold exists. A finalized failed second transaction does not undo
collateral acquired in the first transaction. The original UNCERTAIN reservation
therefore remains pending until explicit collateral recovery; this change does
not implement that recovery or allow a replacement send. It also fails closed
for a HELD row whose conversion reconciliation has not completed.

Regression coverage uses cryptographically verified finalized failed receipts
and seeded persisted HELD/FINALIZED rows to isolate the journal boundary. Two
recovery passes retain the exact reservation and pending margin. Existing
single-leg failure and midnight quota behavior remains covered. These are local
mock-transport tests, not mainnet execution. Discover files were reviewed; this
unpublished internal guard makes no new public availability claim.

### Joined opening receipt reconciliation (local, 2026-11-06)

The six joined BTC/ETH/SOL opening and transport-timeout cases now continue from
the exact custody-owner-signed opening bytes to a modeled finalized receipt.
A generated test keeper signs only that fixture's exact message; the production
receipt verifier checks all three signatures and the original pre-keeper hash.
Processed status remains UNCERTAIN; finalized success transitions the same
reservation to OPEN and retains the original margin plus uncollected fee reserve.
Another recovery pass performs no receipt reads and no replacement send.

All six targeted cases passed. This is mocked chain status, not an observed real
mainnet position. Finalized native Increase-event fee assessment, collateral
recovery and the complete public interface/release remain pending. Reviewed
Discover HTML/JS/CSS/tour: internal unpublished test coverage requires no public
content change. No real funds, trades or automation activation were involved.

### Joined finalized-opening fee assessment (local, 2026-11-06)

The same six joined opening/timeout cases now include a modeled native
InstantIncreasePositionEvent, bound to instruction 2 and its event-authority
self-CPI in the exact fully signed opening transaction. The production finalized
trade reader verifies provenance and decodes one Increase for the expected asset.
The real fee journal rejects a cloned receipt and creates exactly one 20,000
micro-USDC assessment for the original 10 USDC margin, never leveraged size.
Repeated assessment returns the same record; neither conversion nor opening is
resent. The assessment awaits payment review and is not a transfer or receipt
of collection. All six targeted cases passed; all chain/provider data remain
explicit test models. No public release or real-funded transaction occurred.

### Public client two-stage review support (local, 2026-11-06)

The browser client now accepts the explicit conversion-review stage only for
Long with the strict 50 bps floor, a positive minimum collateral amount and the
mandatory separate-opening-confirmation flag. Continuation passes only a
validated original reservation ID and rejects a mismatched or unsolicited ID in
the returned review. Both reviews retain separate one-use order/fee consent and
session binding; neither status recovery nor preparation signs or sends.

All four client tests passed, including refused widened tolerances, missing
separate confirmation, zero minimum, malformed mint and changed continuation
identity. This is client transport support, not a completed visible UI or public
release. Full CI session 62679 was already running before these client changes;
its result cannot certify these later edits. Discover review remains internal:
no new publicly available feature is claimed.

### Joined failed-opening evidence and resumed intent (local, 2026-11-06)

Three additional joined BTC/ETH/SOL cases model a finalized failure of the exact
custody-signed second leg, after independently verified first-leg finality. Two
recovery passes preserve UNCERTAIN and the 10.02 USDC risk reserve with its
FINALIZED collateral hold. There is no Increase event, collectible assessment or
second conversion/opening send. This proves retention, not completed collateral
return: explicit recovery back to USDC still needs implementation and consent.
All three cases passed.

Authenticated operation status now projects the canonical draft persisted with
the original conversion hold. The panel resumes that draft instead of borrowing
unrelated current form values after reload/reselection. Its interaction test
changes the form to ETH/20 but verifies continuation still reviews the original
BTC/10 and clears consent. Five client/panel tests and the BTC joined failed
case passed after this projection change. No production deployment or real
financial execution occurred; Discover has no new shipped capability to announce.

### Modern native collateral-return simulation (local, 2026-11-06)

The existing collateral-to-USDC simulator now uses the pinned native borrow
accrual checker for modern custody layouts (at least 1117 bytes). Only monotonic
interest index/clock and equal debt/accrued-interest deltas are permitted;
principal, configuration, extension bytes, account identity, token conservation,
oracle floor and exact-wire checks remain enforced. Short legacy layouts retain
their exact-tail comparison. This removes a known blocker for contemporary
collateral-return simulation; it does not bind entry recovery, authorize a key,
release the original risk reservation or provide a recovery UI.

Eight targeted simulation/accrual tests passed, including modeled native BTC,
ETH and SOL returns and rejected forged principal, future clock, unchanged
index with new debt, changed configuration and extension suffix. No live-chain
success or deployment is claimed. Discover HTML/JS/CSS/tour remain reviewed as
unpublished internal work, with no new public capability to advertise.

### Original-order collateral recovery eligibility (local, 2026-11-06)

Added a private recovery-eligibility binding joining the genuine finalized entry
conversion binding to its original execution reservation and FINALIZED hold.
It exposes exactly the received collateral units in the canonical source ATA,
not the wallet's older holdings, fixes maximum slippage at 50 bps and retains
the original risk reservation. An unsigned RESERVED parent must have no opening
signature; an UNCERTAIN parent requires a fresh branded finalized FAILED receipt
for its exact wallet/signature/hash, at or after the conversion slot. SIGNING,
OPEN and CLOSED parents cannot qualify. Re-reading checks unchanged parent/hold
and revalidates underlying proof provenance and freshness.

The three joined failed-opening cases passed for BTC/ETH/SOL, including missing,
cloned and expired failure proof rejection. Further coverage checks unsigned
eligibility is invalidated once the opening progresses. This module is not a
custody grant, signing flow, conversion send or risk-release capability. Durable
recovery intent, confirmation, finalized return accounting and UI remain to be
implemented. Nothing was deployed and no real funds were moved; Discover has no
new public availability change.

### Strict unsigned collateral recovery preparation (local, 2026-11-06)

Added recovery preparation consuming only the private original-order recovery
binding. It reads native custody and fresh oracle accounts under increasing bank
floors, computes the inward-rounded USDC minimum at exactly 50 bps, builds a
canonical collateral-ATA-to-USDC-ATA Swap2 and simulates those exact bytes. Even
SOL uses existing WSOL: no native input or account closure can sweep older funds.
Full simulation checks token/vault/rent/fee conservation and retains at least
0.001 SOL after modeled effects. Public preparation does not expose transaction
bytes; its private proof rechecks eligibility, unchanged reservation and fresh
simulation. No signing grant, send dependency or journal-release method exists.

The joined failed-opening tests prepare recovery for BTC/ETH/SOL, check exact
received amount/source, strict 50 bps, clone rejection and expiry. Added negative
coverage for copied eligibility, wrong genesis and an unexplained old-source
token delta. This is still modeled preparation, not a submitted recovery or
proof that funds returned. Durable intent, authorization, finalized accounting,
public UI and deployment remain pending. Discover review is internal-only with
no new published availability claim; no real funds were moved.

### Persistent recovery audit intent (local, 2026-11-06)

Added an internal explicit-approval audit-intent writer using the existing
private swap journal schema and its per-wallet pending exclusion. It consumes
the genuine fresh recovery preparation, verifies original conversion ownership,
FINALIZED source/hold and wallet binding, and persists the exact unsigned message
plus recovery amount/minimum/50-bps/original-order metadata. Its deterministic
identity is derived from the original reservation and conversion signature;
duplicate attempts, including after journal reopen, are rejected. The record is
SIGNING with no signature or signed wire, never a claim that funds were sent.
No general claim/signing capability is exposed by this helper.

Joined BTC/ETH/SOL cases passed, including rejected missing approval, wrong
owner and duplicates. Additional assertions reopen the native journal and check
the exact persisted record and unchanged exclusion. Original collateral/risk
remains held. Cross-journal signing/race guards, custody authorization, timeout
reconciliation, finalized return accounting and UI are still required before
this internal path may be enabled. There is no runtime/API wiring or deployment
of the helper. Discover remains reviewed as unpublished work; no real funds or
automation state were changed.

### Failed-opening recovery custody authorization (local, 2026-11-06)

Added a separate one-use custody capability consuming only the privately held
recovery-intent object and genuine fresh recovery preparation. It is restricted
to UNCERTAIN parents with a verified finalized failed opening; unsigned RESERVED
recovery is intentionally not authorized until atomic cross-flow exclusion is
implemented. Exact persisted intent/message/owner, paused control revision,
backup scopes and wallet contention are rechecked before, during and after the
existing custody vault decrypt/sign operation. A second grant for the same
intent and a second consumption are rejected. No wire or generic signing input
is accepted from an API, and no send dependency was added.

Joined BTC/ETH/SOL cases passed through real encrypted ephemeral custody signing
of their exact modeled recovery message, rejected missing approval/cloned intent
and duplicate grants/signatures, then persisted the signature in SIGNING without
broadcast. Those wallets are unfunded; transports remain mocked and sends stay
at the original two test attempts. Public integration, signed-wire resimulation,
controlled broadcast/reconciliation, final accounting and release remain pending.
Discover has no newly published functionality to announce.

### Exact signed recovery broadcast boundary (local, 2026-11-06)

Added an internal submitter for the same privately authorized recovery intent.
It verifies the journal's cryptographically checked owner-signed bytes, rechecks
the captured custody authorization/context, and repeats complete same-bank
simulation with sigVerify=true on those exact signed bytes. After revalidation,
the native swap journal atomically persists UNKNOWN/signature/blockheight before
one sendTransaction attempt (maxRetries=0). A lost or mismatched response stays
UNKNOWN; no automatic retry, replacement identity or risk release is offered.
The post-sign reader allows only the expected signature/signed/updated changes
to the otherwise exact persisted intent. Generic swap/transfer grants cannot
reach this stage.

Joined BTC/ETH/SOL tests model exact signed resimulation and one mocked send,
including a BTC transport timeout, duplicate-call rejection and durable UNKNOWN
after reopening the journal. Added a changed-context refusal before any send.
This path remains internal and is not wired to production or the public API.
Finalized recovery receipt/accounting, unsigned-parent race exclusion, failure
recovery, interface and release verification remain pending. No funded wallet,
real transport, live trade or automation activation was used.

### Restart-safe finalized recovery receipt (local, 2026-11-06)

Added a read-only recovery receipt reader using persisted swap/execution rows,
not an in-memory signing grant. It re-verifies original conversion finality and
the exact failed opening, checks original collateral amount/source/owner binding,
reconstructs every recovery message byte with the native constructor and checks
the finalized signed recovery transaction through the strict token-transfer,
native CPI event, minimum-output, old-balance and fee/rent receipt verifier.
Journal records are checked for mutation throughout asynchronous reads. Pending
finality returns no receipt. No signing, send, settlement or risk release occurs.

The test receipt model can consume an exact already-signed ephemeral recovery
wire without exporting custody keys. Joined coverage checks persisted UNKNOWN,
wrong-owner refusal, pending finality, journal reopen, exact USDC return evidence
and unchanged original risk reservation. Finalized accounting/release and public
integration remain pending. Discover still has no published availability change;
no real funds or transactions were used.

### Verified recovery swap settlement (local, 2026-11-06)

Added a narrow reconciler that obtains fresh restart-safe native return evidence
before marking the recovery swap UNKNOWN -> FINALIZED. Pending history leaves
UNKNOWN unchanged. Parent/hold/swap identity is checked again after asynchronous
verification; repeated finalized verification returns the same result and never
sends. The result explicitly says complete recovery accounting is still required
and original risk was not released. This is not an execution-parent CLOSED state,
fee charge or permission to open another trade.

All three joined BTC/ETH/SOL cases passed pending-to-finalized and repeated
verification, retaining the full original 10.02 USDC reserve and no opening fee
assessment. Added an exact signed-wire tamper check that must leave UNKNOWN.
Recovery-history cost recognition and typed complete-account proof still need
integration before capital may be released. Public/UI/runtime wiring, remaining
recovery modes and release verification are not completed. Discover has no new
published availability; all transport and chain status were test models.

### Immutable recovery history facts (local, 2026-11-06)

Added a bounded exact wallet/signature lookup in the existing native swap
journal, rejecting ambiguous duplicate signatures without changing its schema.
A new history reader recognizes only a persisted entry-recovery stage and binds
it to the original execution reservation/hold/conversion. It verifies the
finalized recovery using the transaction reader's captured immutable wire/meta,
not a competing second getTransaction response. Facts retain exact collateral,
USDC return, USDC swap fee and SOL network fee separately; no Increase event or
futures trade is invented. Re-reading rejects cloned facts or changed journal
snapshots. This is not a general PoolSwap allowlist.

All three joined BTC/ETH/SOL cases passed recovery-history provenance and clone
checks. Independent USD loss valuation and complete-day account integration are
still pending, so original risk remains reserved. This internal history reader
is not enabled as an accounting exemption yet. Discover remains reviewed as
unpublished internal work; no public release or real funds were involved.

### Independent recovery USD reference loss (local, 2026-11-06)

Added a typed valuation reader for genuine immutable recovery history. It uses
closed, validated underlying/USD upper and USDC/USD lower bounds at the recovery
time, inward integer rounding and an independently valued USDC output-fee floor.
Per-transaction gains never erase other losses. SOL network fees are explicitly
excluded here for separate accounting. The result labels underlying prices as a
reference proxy, not a wrapped-token depeg guarantee or execution quote.

Joined BTC/ETH/SOL cases passed with a modeled 0.99–1.01 USDC range and exact
rounding checks, fee-floor protection, duplicate history rejection, cloned proof
and expired valuation refusal. Complete-day integration and capital release
remain pending; the new valuation does not itself authorize another trade.
Discover has no new published functionality; no real funds or provider sends
were used.

### Complete-day recovery accounting integration (local, 2026-11-06)

Daily and exclusive-custody account readers now carry a separate typed recovery
history/valuation dependency. Only verified persisted recoveries bypass the
otherwise unknown native PoolSwap rejection; their conservative USD loss is added
to initial-conversion loss, while failed openings remain failed transactions and
neither swap counts as another futures Increase. Fresh-account validation also
rechecks recovery history/journal and valuation proof. Runtime construction now
provides the read-only recovery valuation dependency to both readers; this does
not enable the internal signing/submission path.

Joined account coverage models the initial conversion, failed opening and return
in complete finalized signature history. It checks zero successful futures
trades, one failed transaction, one initial conversion and one recovery, exact
combined conversion/recovery loss, and 16,200 lamports across the three modeled
transactions. This first account test deliberately leaves network USD valuation
disabled and checks lamports separately; a capital-release proof still must
require separately valued network fees. Missing recovery valuation fails closed.
Capital is not released by this change. No production deployment, real funds or
new Discover availability claim is involved.

### Fully valued same-day recovery accounting proof (local, 2026-11-06)

Added a private completion-accounting proof requiring a genuine fresh complete
daily account, separately valued network fees, finalized recovery history rooted
through the return slot, original conversion and failed opening in the same-day
history, and unchanged execution/hold/swap snapshots. Clones, unvalued network
costs and expired underlying valuation cannot qualify. This proof does not yet
mutate/release capital. Prior-day completion requires a separate historical-cost
audit and currently fails closed.

Joined test coverage now values all three 5400-lamport transactions using closed
SOL/USD reference highs: exactly 1620 micro-USD at the modeled 100 USD high.
It verifies that network loss is added once to initial/recovery losses, rejects
the earlier lamport-only account, cloned accounts/proofs and expired valuations,
and retains the original risk reserve. No real transaction, public rollout or
new Discover availability claim is made.

### Atomic same-day recovered-capital release (local, 2026-11-06)

Execution journal completion now consumes the private fully accounted recovery
proof within its transaction, checks exact original parent/hold binding, and
marks only that failed-entry reservation CLOSED with the independently proven
failed-opening and return slots. The finalized conversion hold and both swap
records remain as audit history. Cloned, replayed, foreign-journal or stale
proofs cannot release capital. No principal or signature records are deleted.

Read-only recovery receipt reconstruction can recheck a completed parent only
when the recovery swap is FINALIZED and its actual return slot exactly matches
the recorded closed slot; the failed opening must still be cryptographically
verified at its recorded slot. Such a history binding is explicitly marked
already completed and cannot prepare another recovery. This keeps daily history
and loss accounting intact after release instead of invalidating the evidence.

The joined BTC test passed release, clone/replay refusal and a fresh full-history
read with unchanged losses and one recovery after completion. No opening fee or
extra send occurs. Other assets and regression checks are being verified.
This internal path is not deployed; prior-day/unsigned-parent recovery and full
public integration still require work. Discover has no new shipped availability
claim and no funded transaction was executed.

### Opening exclusion during collateral recovery (local, 2026-11-06)

Added an opening-only check on the private collateral binding: any pending
wallet-swap intent blocks entry review/signing risk checks. Read-only/recovery
binding validation remains separate, so a recovery can revalidate its own
original conversion while its own wallet exclusion is held. This prevents an
older opening review from treating pending-recovery collateral as available.

BTC normal opening, ambiguous-opening recovery and failed-opening return cases
passed with the new check; a genuine pending recovery explicitly fails the
opening-only boundary while its underlying recovery binding remains valid.
Atomic coordination for an unsigned RESERVED parent still requires work; this
change does not remove the failed-opening-only custody restriction. No runtime
activation, public deployment or real financial transaction occurred. Discover
has no new shipped functionality to advertise.

### Atomic unsigned-entry recovery exclusion (local, 2026-11-06)

Recovery swap claims are now created while holding the execution journal's
write transaction, the same lock used by beginSigning. The journal independently
checks genuine fresh preparation, original source ownership/hold, deterministic
recovery ID, exact amount/minimum/accounts and strict 50 bps before persisting
the swap exclusion. An opening that follows the claim sees the pending swap and
fails its opening-only collateral check; a recovery following a changed/signing
parent fails its captured original-order binding. Cross-store commit failure
can leave an unsent pending audit row, never permission to sign/send twice.

A separate general recovery custody entry point can now authorize a RESERVED
parent with no opening signature under this exclusion. The previous failed-only
entry point remains restricted to finalized failed openings. All three asset
tests passed real unfunded custody signing once, refusal of the competing
opening, explicit abort of the never-broadcast signed intent and subsequent
normal opening with the original collateral. Finalized unsigned-parent return
accounting/closure and public integration remain pending. Nothing was deployed,
no real funds were moved and Discover has no new published capability.

### Same-day recovery without an opening broadcast (local, 2026-11-06)

Completion accounting distinguishes an unsigned RESERVED parent from a finalized
failed opening. After both conversions and separately valued costs are included
in genuine complete-day history, unsigned recovery cancels the original reserve
as CANCELLED with a return slot and no opening signature/confirmed slot. It
therefore does not manufacture a failed transaction or consume a futures trade.
Completed read-only history accepts this narrow finalized-return marker while
new recovery preparation remains forbidden. Audit rows are retained.

The joined BTC/ETH/SOL unsigned-return cases verify exact custody signing,
one modeled send, finality, two swaps, zero failed/open futures transactions,
10,800 network lamports, fully valued costs, released pending margin and unchanged
history on reread. Recovery archive validation now accepts this cancelled/final
hold combination only with one deterministic FINALIZED original-owner recovery
record and no opening signature; generic cancelled finalized holds still fail.
Archive restore coverage is being checked separately. No production deployment,
real-funded transaction or new Discover availability claim is made.

### Explicit recovery service orchestration (local, 2026-11-06)

Added an optional server recovery coordinator with prepare/confirm/recover
methods. Review derives original owned collateral on the server, shows exact
minimum/network costs and zero platform recovery fee, and cannot sign. A fresh
explicit one-use confirmation creates the deterministic durable intent, invokes
the narrow custody capability and exact signed submitter. Status recovery can
verify finality, obtain a genuine complete valued account and complete only the
original reservation. Repeated completed recovery never sends again. Owner,
paused execution context, backup and fresh-account checks remain mandatory.
The coordinator is available in the manual service only when optional swap/send
and finalized-account dependencies are provided; production runtime/API/UI are
not wired to it yet.

The BTC joined unsigned-return test passed through the actual coordinator,
rejecting a foreign owner, absent approval and duplicate confirmation, modeling
one send and idempotent fully accounted cancellation. Other asset cases are
being run. The earlier runtime backup regression completed: 13/13 passed,
including Windows ACL restore. No public deployment, real-funded trade or new
Discover availability claim occurred.

### Authenticated recovery API and browser client (local, 2026-11-06)

Added explicit prepare/confirm/recover action allowlists routed to the optional
manual recovery service only after authenticated wallet ownership. Client bodies
cannot override amount, slippage, owner identity or transaction bytes. The
browser client accepts only a server-issued original-reservation-bound recovery
review with strict 50 bps, positive u64 amount/minimum, zero platform recovery
fee, bounded expiry and explicit recovery confirmation. It uses a separate
session-bound one-use proof; ordinary opening/close consent cannot authorize it.
A lost confirmation response consumes the review rather than allowing retry.

All 12 API/client/panel targeted tests passed, including foreign-wallet refusal,
strict field allowlists, session change, clone/duplicate confirmation, unsafe
minima, unexpected fees and widened tolerance rejection. The visible recovery
panel and full browser-to-native-service story are still pending, as is runtime
dependency wiring and deployment. No real transaction was executed; Discover
has no new publicly shipped capability to announce.

### Visible manual collateral recovery panel (local, 2026-11-06)

Added a separate return-to-USDC panel for pending collateral-funded entries.
It shows exact minimum USDC, base-unit collateral amount, strict 0.5% tolerance,
zero JamdDmaj recovery fee and SOL network/rent costs. Confirmation starts
unchecked and authorizes only return, never an opening or bot activation.
The original reservation ID is retained before confirmation so response loss
leaves a status-query action instead of a retry. Server status projects durable
recovery state/signature and suppresses opening continuation while recovery is
pending or finalized. Foreign-wallet selection hides the panel and clears review.

All 13 API/client/panel model tests passed, including no submission before consent,
one lost-response confirmation, repeated-click refusal, status-only recovery and
wallet change. These are DOM-model tests, not rendered-browser/full-story proof.
Runtime send wiring, live unsigned-provider checks, remaining recovery modes,
complete release verification and publication are still pending. Discover has
no newly published capability and no real funds were moved.

### Optional runtime recovery/send composition (local, 2026-11-06)

The explicitly enabled manual runtime now receives the existing private swap
journal and a shared narrow bot send adapter. That adapter accepts only
sendTransaction while execution runtime is running; native reads continue through
the separate read-only RPC adapter. It reuses the established fixed TLS swap RPC
transport and does not accept caller-selected endpoints. Startup or enabling
dependency composition does not create a per-order signing grant, activate any
wallet, waive backup/policy/consent checks or send a transaction.

A new unfunded composed-runtime test passed initialization with existing private
fee/payment/swap/manual-policy stores, inactive worker status, authenticated
manual status, and denied recovery requests without verified backup. Its entire
network corpus is four mocked identity reads and no RPC/provider/send calls.
Full CI is running separately against this integrated source. This is not a
deployment or rendered-browser/full-story proof. Remaining recovery edge cases,
public verification and release are still required; Discover has no newly
published availability claim and no real funds were used.

### Two-stage order panel (local, 2026-11-06)

The Futures manual-order panel labels conversion as step 1, explicitly says it
does not open a position, displays its minimum base units and 0.5% limit, and
retains the original reservation ID across continuation. Pending funding exposes
a separate review-opening action; server preparation still verifies finality,
ownership, exact original draft and risk before returning a fresh review.
Continuation clears the consent checkbox and never auto-confirms or resends.
A DOM-model interaction test clicks the second-step button and verifies a new
unchecked opening review, despite pending status blocking unrelated new orders.
This is not yet rendered-browser/full-story evidence or a published feature.

The earlier full CI session 62679 finished with 1389 total / 1370 passed /
19 skipped / zero failed. It predates these final client/panel edits; targeted
client, panel and swap UI checks cover those separately. Discover content was
reviewed and remains unchanged because the release is still unpublished.

### Isolated rendered recovery client/API verification (local, 2026-11-06)

Story: recovery panel -> real browser client -> actual API validation -> modeled
recovery service -> rendered response. Separate joined tests exercise the native
custody/journal path; this is not a single browser-to-native or live proof.
Desktop automation failed its retry/reset sequence because the native pipe was
missing. Existing headless Edge/Playwright was used without user login/session.
Every external browser request was intercepted. Desktop 1280px and mobile 390px
checks passed: minimum/cost rendering, consent-gated confirmation, one lost-response
confirmation and status-only recovery, no horizontal overflow or page errors.
The mobile screenshot was inspected. The fixture's missing UTF-8 declaration was
corrected afterward; production HTML already declares UTF-8. No app security or
permission settings changed, and no financial transport was present.

Full CI session 90166 completed: 1403 total / 1384 passed / 19 skipped / zero
failed. It predates this opt-in browser test, whose explicit successful run is
separate evidence. Full-story native integration, remaining recovery edges and
release verification are not completed. Discover has no new published claim.

### Rooted initial-conversion failure evidence (local, 2026-11-06)

Refactored exact recorded first-leg wire reconstruction into a shared internal
reader and added separate private failure evidence. It requires finalized failed
status, the exact durable owner-signed wire/signature, matching slot/error and
native constructor message, verified finalized transaction provenance, no
committed token changes and only the payer's actual network-fee lamport debit.
Confirmed failure or missing transaction returns no proof. Wrong owner, changed
wire/balances, cloned evidence and expired full-read leases fail closed.

BTC/ETH/SOL joined initial-failure cases passed; existing unsigned-return behavior
also passed after the reconstruction refactor. This evidence does not settle the
swap or release original capital: complete-day failed-transaction fee accounting
and a private completion boundary are still required. No replacement send,
production deployment, real funds or new Discover availability claim occurred.

### Accounted initial-conversion failure release (local, 2026-11-06)

Added a private completion proof joining exact rooted first-leg failure to its
original RESERVED/HELD parent, canonical draft, amount and genuine complete-day
account. The matching failed transaction and separately valued network fees are
mandatory. Journal completion consumes this proof once, settles only the exact
swap as FAILED and cancels the original reserve with a failure slot. If the
cross-store journal commit is interrupted, the still-reserved parent can be
reconciled against the existing FAILED swap; no replacement send is authorized.
Archive validation accepts that cancelled HELD audit combination only with a
FAILED swap and an explicit recorded failure slot, distinct from unsent ABORTED.

All three BTC/ETH/SOL joined failure cases passed exact 540 micro-USD modeled
network loss, clone/missing-valuation/replay refusal, released pending margin,
zero futures trades and unchanged loss on reread. No failed swap is counted as
received collateral. This completion is not yet dispatched by the public status
recovery method; that service integration remains work, as do other edge cases
and release. No real funds or new public Discover availability were involved.

### Initial-failure status recovery service (local, 2026-11-06)

Manual operation recovery is now asynchronous under the per-wallet service
exclusion. For a RESERVED/HELD first-leg UNKNOWN/FAILED record it reads exact
rooted failure evidence; unavailable/unverifiable evidence returns UNVERIFIED
without release. Genuine failure requires owned paused custody, verified backup,
a fresh complete valued account and unchanged control revision before private
journal completion. Never-broadcast SIGNING/ABORTED recovery retains its distinct
audit path. No status query resends a transaction.

BTC/ETH/SOL initial-failure cases passed through service recover and repeated
completed queries. Six BTC first-leg/timeout/unsigned/signing/simulation/opening
regressions and all 13 API/client/panel checks also passed. Prior-day recovery,
remaining edge cases and complete public release verification remain pending.
Nothing was deployed, no real funds were moved and Discover has no new claim.

### Current unsigned provider checks and read throttling (2026-11-06)

Ran isolated read-only diagnostic bundles in the server checks directory, not
the installed worker. Current strict entry-conversion preparation/simulation
passed BTC (slot 466116362), ETH and SOL (slot 466116489), with no signing or
submission. Current direct unsigned Short review also passed BTC, ETH and SOL
after sequential checks. This is not proof of collateral-funded Long opening,
keeper execution, collection, deployed UI or an actual mainnet position.

Parallel reads initially failed; a later bounded diagnostic established HTTP
429 / JSON-RPC 429 at getGenesisHash. A subsequent SOL check passed after waiting.
The read-only transport now preserves a sanitized rate-limit classification;
the authenticated API returns rpc-rate-limit/429 and the manual panel explains
temporary read saturation without blaming funds/permissions or retrying an
order. Thirteen transport/API/panel tests passed, including HTTP and JSON-RPC
throttling and one-attempt behavior. Provider URLs, credentials, balances and
transaction bytes were not printed by the new diagnostic. No installed service
was restarted, no financial operation occurred and Discover has no new release
availability claim.

### Encrypted post-recovery restoration corpus (local, 2026-11-06)

Added actual encrypted archive/restore checks to the existing unfunded native
BTC/ETH/SOL flow cases: rooted first-conversion failure, conversion returned
without broadcasting an opening, and conversion returned after a failed opening.
All nine targeted cases passed. Restored reservations, holds, complete swap rows
and risk totals match the source; no pending swap is invented, settings remain
unchanged, controls are paused and restoration grants no signing or trading.
Archives include the fee and payment stores as required by the retained original
commercial consent; omitting these correctly failed the initial test setup.

The full CI run before these additions finished with 1409 tests: 1388 passed,
20 skipped and one failure. That failure was an old synchronous test assertion
against the now asynchronous manual recovery method, not a missing transaction
signature. Updated it to await recovery; its targeted two-approval/timeout test
passes. A fresh full CI run is in progress; do not treat the earlier run as green.

Reviewed Discover HTML, JS and both CSS entry points for this internal-only
verification change. No availability/content change is appropriate until the
manual trading release is actually verified and published. Nothing was deployed
and no funded transaction was signed or submitted.

The isolated recovery browser test also passed at desktop/mobile widths using
the real client and authenticated API with a modeled service; it is not evidence
of a complete browser-to-native-custody story. All 13 runtime recovery tests
passed, including the actual Windows restricted-ACL encrypted restore test.
The new native-flow archive assertions additionally compare retained commercial
consent, fee assessments and payment rows to the source databases.

The repeated full CI run finished successfully: 1409 total, 1389 passed,
20 skipped, zero failures. All nine BTC/ETH/SOL archive cases also passed after
adding explicit fee-consent/assessment/payment comparisons. No outstanding test
process remained from these runs. This does not prove publication readiness or
the remaining historical-day and recovery edge cases; the objective stays open.

The subsequent sequential `npm run build:web` also completed successfully,
preparing 31 local web assets. No deployment or installed-worker restart occurred.

### Browser-to-native first-leg boundary (local, 2026-11-06)

Added BTC/ETH/SOL API integration cases using the real manual client, ownership
boundary, native service, unfunded ephemeral custody signer, execution/swap
journals and actual fee-consent store. Native RPC and send transports are mocked;
the builder mismatch exercises the strict-50-bps Long first-leg fallback.
Both approvals are required, reserve/signing follows review rather than preceding
it, one send records UNKNOWN before the mocked transport, and replay/status/
recovery never send again. Consent terms retain the original 20000-unit fee;
no opening assessment or collection is invented before an opening exists.

An opt-in headless browser bridge runs those same cases with the actual bundled
browser client, actual API and native custody fixture, rather than a modeled
service. All three browser cases passed. The isolated bridge rewrites only its
synthetic loopback origin at the API adapter and has no authorized user session;
it is not a production CORS, deployed-page, second-leg Long or position-fill test.
The local bridge initially duplicated the origin header with different casing;
using Headers.set fixed that fixture error without weakening production origins.
It permits only its loopback document and the exact controls API route, closes
its browser/server, and never accesses a real financial submission transport.

Run with JAMDDMAJ_NATIVE_BROWSER=1 and the existing optional browser module and
executable variables, selecting the three `api` native-entry cases. The ordinary
client/API cases remain runnable without a browser. Nothing was deployed and
Discover has no new availability claim for this internal verification increment.

### Both Long approvals and optional return across the API (local, 2026-11-06)

Extended the native opening cases to use the actual client/API boundary for both
the initial conversion and separately reviewed collateral-funded opening, not
just service method calls. Opt-in browser runs passed BTC/ETH/SOL through both
steps and the modeled finalized keeper receipt. Attempting to continue while
the first conversion is still UNKNOWN is refused without another send. The
first review cannot authorize the second step, each step requires both consents,
and repeated confirmations never repeat either financial transport.

Post-finality checks consult the original operation by ID through the real API:
it is OPEN with the original opening signature, FINALIZED conversion and no
remaining opening review. The status list intentionally contains pending work,
not already-open positions; the initial new assertion incorrectly treated it as
position history and was corrected rather than changing production semantics.
There is one original fee consent and one independently verified opening fee
assessment, never two assessments for the conversion and opening.

Nine browser-mode timeout/failed-opening/unsigned-return cases passed. Extended
the unsigned-return path further to use the real browser recovery client/API,
native signer, receipt/accounting completion and encrypted archive checks;
all three BTC/ETH/SOL cases passed in browser mode and ordinary client mode.
The synthetic native network/send/keeper transports remain strictly mocked.
These are unfunded integration proofs, not live provider fills, production UI
or published availability. Prior-day recovery and other release gates remain
unresolved. Discover content remains unchanged for this internal-only test work.

### Rooted first-leg failure reconciled on a later UTC day (local, 2026-11-06)

Fixed the first-leg-failure completion gate so an exact rooted conversion
failure from a previous day does not remain reserved merely because today's
complete history correctly excludes it. This applies only to the private native
failure proof: exact durable signed wire, finalized matching status/error/slot,
unchanged token balances and all native balances unchanged except the payer's
verified network fee. It cannot stand in for a successful conversion, an absent
transaction or a failed opening with already-converted collateral.

The current account must still be complete, fresh, journal-bound, rooted through
the failure and include current-day network fees in USD loss. A same-day failure
must still appear with its exact fee/slot in today's verified transaction list.
A prior-day failure must precede the current account day and must not appear in
that list. Its fee remains bound to its original transaction day; it is not
charged again to today's daily-loss total. The private completion identifies
both dates and whether the fee was included in the current day, while retaining
the original swap, failed state, signature and closed slot after cancellation.

Six BTC/ETH/SOL same-day/prior-day service recovery cases passed, including
real encrypted archive/restore checks. Omitted same-day transaction history,
cloned account proofs, missing USD fee valuation, changed signed transactions,
changed native balances and stale failure proofs remain rejected. This closes
only the prior-day *failed initial conversion* case. Successful initial
conversion/recovery across days, never-broadcast opening recovery and remaining
release verification are not claimed complete. Nothing was deployed or sent
through a real financial transport. Discover remains unchanged because this is
an unpublished internal recovery fix, not newly available public functionality.

The 25 client/API/runtime-recovery regressions also passed, including the real
restricted-ACL Windows restore. The subsequent sequential web build prepared
31 local assets successfully and the scoped whitespace check reported no errors.
The earlier full-CI result predates this prior-day fix; a new full run remains
part of release verification rather than an already-passed claim.

### Explicit recovery before an opening broadcast identity (local, 2026-11-06)

Added a narrowly scoped manual-opening recovery transition under the execution
journal transaction lock. Only an owned manual SIGNING row with no recorded
signature/wire hash qualifies; UNKNOWN/UNCERTAIN broadcast identities, automated
signals, foreign wallets, pending swaps, closes, exit cancellation and fee
payments cannot use it. The service requires paused, running exclusive custody
with verified backup and serializes the explicit recovery request by wallet.

A single-leg never-broadcast attempt becomes terminal CANCELLED. A two-step
Long retains its original FINALIZED conversion and full risk/fee reservation,
returns to RESERVED and requires another independent review and approval.
Unused exit addresses remain bound to the original reservation, while its
never-broadcast plan is cleared so the fresh review can bind its new plan.

The hold update value is advanced strictly, even under a frozen clock, and
captured by manual custody authorization and its verified signed result.
recordBroadcastIntent rejects a manual collateral opening whose signing epoch
does not match the current hold. Thus a previous signature cannot attach to a
newly approved SIGNING attempt after recovery (ABA), including the small window
after signing has returned but before durable broadcast identity. No schema
change or age/absence-of-chain-result heuristic is used; journal locking decides
whether recovery or recording the first broadcast identity wins.

BTC/ETH/SOL interruption-after-signing cases passed both ordinary client/API
and browser-to-native-fixture flows: zero opening sends before recovery,
unchanged converted collateral, strictly revoked epoch, fresh review/consents,
rejected old signed identity, then one opening send only. The three ordinary
cases also pass actual encrypted restore before continuation, preserving risk,
holds, swap rows, consent/assessment/payment rows and paused controls. Nine
journal regressions passed, including both orderings of the independent-
connection recovery/broadcast race and refusal to recover an automated row.
Thirteen client/API/panel checks passed; the panel explains that no opening
submission was recorded and requires another review instead of silently retrying.

A full fresh CI run is in progress. These tests use unfunded generated custody
keys and mocked financial transports; no real operation was signed or sent.
No deployment occurred. Discover was reviewed for the unpublished internal
recovery/UI change: no new public availability claim is appropriate yet.

Additional targeted checks passed: a real unfunded single-leg custody signature
interrupted before broadcast identity is terminally cancelled through the service,
its old signed identity cannot be recorded, its fee consent is retained and no
assessment/collection is created. The two-step reset additionally checks the
original finalized swap's owner, wallet, signature, signed-wire hash and amount;
all three native cases passed with wrong-owner and missing-swap-store rejection.
Nine timeout/failed-opening/return regression cases also passed. The ongoing full
CI began before these final extra test/assertion additions; its result must be
reported with that scope rather than treated as a fresh full-source release gate.

That full CI run finished with 1419 tests: 1399 passed, 20 skipped, zero failures.
The subsequent extra single-leg test and final three owner-bound reset checks
passed separately as recorded above. All observed test processes are terminal.

### Explicit fresh return after a never-broadcast abort (local, 2026-11-06)

Implemented a bounded immutable return-attempt chain without changing the swap
schema. The original deterministic root stays readable, including legacy roots;
each subsequent identity derives from that root and its sequence, retains the
preceding row and requires that predecessor to be terminal ABORTED. SIGNING,
UNKNOWN, FAILED and FINALIZED never grant another attempt. Reviews capture the
exact predecessor, so an approval prepared before an intervening abort cannot
silently authorize a new attempt. Claiming the new identity still holds the
execution lock and the genuine swap exclusion and requires fresh explicit
approval. At most 32 attempts can belong to one original conversion.

The latest attempt is used consistently for status, custody intent, read-only
receipt reconciliation and audit restore. All ancestor rows are snapshot-bound
through signing, final receipt/history proofs and completion accounting. Missing
or changed ancestors, a foreign owner, a live predecessor and orphan identities
are refused. Archive validation checks all retained return attempts; a tampered
root is rejected before restoration can provide any signing readiness.

A signed never-broadcast attempt must not share its message/signature with a
new attempt: preparation and the atomic claim reject messages already signed
anywhere in that chain. The fixture rotates its invalid fixed blockhash only
after the stale message is correctly refused. No provider slippage relaxation,
automatic resend, new fee or silent approval was added.

BTC/ETH/SOL interrupted signed-return -> explicit fresh review -> one final return
cases passed through ordinary client/API and opt-in browser/native-custody
fixtures. They retain the original ABORTED signed row, reject old and stale
approvals, keep risk reserved until receipt/accounting completion, produce a
different final signature and pass actual encrypted restore plus corrupted-
ancestry rejection. Twenty-five client/API/runtime-recovery regressions passed;
the identity/UI/API subset also passed 13 checks, including safe 409 stale-review
responses and an unchecked fresh review after ABORTED recovery or reload.

The panel now permits a new review only after that verified never-broadcast
state; UNKNOWN response-loss behavior remains query-only. Discover HTML/JS and
both CSS entry points were reviewed: this unpublished internal increment adds
no truthful public availability claim yet. The sequential local web build
prepared 31 assets. A new full CI run is in progress on the current code; no
deployment, real financial signature/submission or installed-worker restart
occurred. Failed-on-chain return recovery and historical successful-conversion
accounting across UTC days remain separate unfinished work, not covered claims.

The final owner-bound ordinary-client matrix finished six return/return-retry
cases with zero failures, and the scoped whitespace check passed. The full-CI
process remains live and must be polled to its actual terminal result, not
restarted based on the absence of interim reporter output.

### Finalized rejected return: exact evidence and retained collateral (local, 2026-11-06)

The previous full CI process reached its actual terminal result: 1429 tests,
1409 passed, 20 skipped, zero failures. That result predates the following
new failed-return code and must not be presented as full-current-source coverage.

Split restart-safe recovery wire reconstruction from success receipt reading;
success callers still require their original independently verified native
receipt. Added a separate private finalized-failure proof for an exact recorded
return: native constructor/message, owner-signed stored wire, matching finalized
status and transaction error/slot, explicit numeric rooted context, immutable
original conversion/parent/hold/attempt history, complete unchanged token
balances and all native balances unchanged except the verified payer fee.
Missing/unfinalized history is not proof, an altered wire or balance is refused,
clones lack provenance, and the whole read/failure proof expires in ten seconds.
The initial-conversion failure reader now also explicitly rejects missing/non-
numeric status context and an absent error field.

The explicit recovery query retires UNKNOWN -> FAILED only after a fresh complete
journal-bound current account with USD-valued network fees. Same-day history
must include that exact failed signature/slot/fee; an earlier-day fee remains
on its original day and is not charged again today. No committed conversion is
invented, no commercial opening fee is assessed, and the original execution
reservation/full converted collateral remains held. Repeated queries reread
evidence but never submit a replacement. The panel explains the network rejection
and retained reserve instead of reporting a returned balance or enabling retry.

Six current-day/prior-day BTC/ETH/SOL native service cases passed, including
exact signature/wire checks, missing status-context rejection, changed source-
conversion invalidation, changed token/native balance rejection, stale/cloned
proofs, omitted same-day history, absent fee valuation and actual encrypted
archive/restore. Three browser/native cases passed; six rejected-opening and
never-broadcast-return-retry regressions also passed. Twenty identity/client/API/
panel checks and seventeen runtime/archive/identity checks passed. The sequential
web build prepared 31 assets; scoped whitespace checks passed. All observed test
processes are now terminal.

An explicitly approved fresh attempt after a finalized on-chain rejection is
still unfinished: FAILED alone is deliberately not retry authority. Historical
successful-conversion cost accounting across UTC days and public release gates
also remain open. No funded signature/submission, deployment or worker restart
occurred. Discover HTML/JS and both CSS entry points were reviewed for this
unpublished internal increment; no new public availability claim was added.

### Current verification baseline and safe boundary traces (local, 2026-11-06)

Re-read the full-story verification and environment guidance and checked current
source/status before continuing. Story under audit: manual Long/Short UI ->
authenticated review -> separate approvals -> native custody/journal -> one
recorded submission -> response/status/recovery. The first unfinished boundary
remains preparation of a newly approved return after an exact on-chain rejection;
it is intentionally blocked, not misclassified as insufficient funds or assumed
working because other tests pass. Production/deployed-page verification cannot
be inferred from the isolated browser harness.

Added bounded route/outcome traces to the opt-in native browser harness. Only
action, HTTP status, known stage and sanitized error code are retained, never
credentials, balances, wallet/reservation IDs or signed bytes. The BTC failed-
return browser case passed and now proves the exact sequence: prepare 200,
confirm 200, recover 200, recover 200, new prepare 409 with
bot-manual-recovery-review-required. It asserts the accounted failed-return stage
and only one financial transport, rather than merely accepting any rejection.
No cosmetic or unrelated production change was made.

Environment baseline: the test browser module/executable are present and the
worktree has .env.example but no .env.local. This is expected for the isolated
unfunded fixture, not evidence of missing production credentials. No environment
pull, secret read/write or production-variable modification was performed.
A current full CI process is live; retain its handle and wait for its terminal
result instead of restarting on a quiet reporter. Discover requires no new
availability claim for this test-only observation increment.

The full CI run reached its terminal result: 1436 tests, 1416 passed, 20 skipped,
zero failures. The new opt-in browser trace assertion passed separately; it
confirms the known 409 boundary rather than claiming a fresh failed-return
attempt is functional. No test process remains live. Preparing a local source
checkpoint excludes .vercel/project.json and the two pre-existing diagnostic
scripts; this is not a promotion, deployment or completion of the active goal.

### Private accounted-failure evidence for a future fresh review (local, 2026-11-06)

Starting from source checkpoint 47e07c1, added a private read-only cost/history
precondition for the still-unfinished fresh approval after an on-chain rejected
return. It requires genuine newly read finalized-failure proofs for every FAILED
attempt in the immutable original chain, no omissions/duplicates, matching owner,
wallet, original signed conversion hash, fixed amount and pending parent/hold.
Each failure must still match a fresh complete journal-bound account and its
correct transaction-day network fees. The whole ancestor/source/parent/hold
snapshot and all underlying leases are rechecked on use, so minting a new wrapper
cannot refresh stale evidence or hide changed records.

This evidence explicitly retains readyForSigning=false, readyForRetry=false and
originalRiskReleased=false, and requires a fresh explicit approval. It is not a
custody grant, review, attempt insertion, send or risk release, and cannot be
passed to the client's confirmation method as if it were an approved review.
The existing reconciliation accounting checks were factored without changing
their behavior. The HTTP preparation boundary remains intentionally blocked;
consumer integration, one-use confirmation/claim authorization and historical
successful-conversion accounting are not claimed finished.

Six BTC/ETH/SOL same-day/prior-day native cases passed with positive evidence,
cloned/missing/duplicate facts, a changed owner or previous attempt, cloned or
unvalued accounts, changed durable rows and stale leases. Three opt-in browser/
native cases and twenty client/API/identity/panel regressions also passed. All
financial transports remained mocked and generated custody wallets unfunded.
No production/session/environment change, deployment or real fund movement was
performed. This internal backend-only precondition does not justify changing
Discover availability content; the full objective remains active.

### One-use accounted-failure claim consumer (local, 2026-11-06)

Connected the private cost evidence to the low-level recovery intent and atomic
execution-journal claim. A FAILED marker or copied previous-failure metadata is
still insufficient: every chain containing FAILED rows requires genuine owned,
fresh complete-account evidence. The claim validates the exact predecessor and
canonical next identity, consumes that evidence once under the execution lock,
and requires the callback's genuine unsigned swap claim for that owner/wallet.
Missing/cloned evidence, null/original IDs, false explicit approval and reuse
are refused before another authorized claim/signature can be obtained.

The only allowed change to the consumed evidence's snapshot is its exact new
child claim. Parent, hold, original conversion, ancestors, verified failed
transactions, current-day costs and original leases remain bound. After append,
the private audit is revalidated without pretending its historical full-chain
snapshot is unchanged; it checks the unchanged prefix, the sole appended child,
genuine transaction provenance, fee accounting and the original deadlines.
Changed ancestors invalidate both audit and signing intent before custody use.

Failure references are derived from native facts, frozen in planned identities,
checked against actual signed ancestors, and compared with all verified failure
facts when evidence is minted. They are identity/audit metadata, not standalone
signing authority. Prepared recovery reads can now raise their slot floor;
both intent and locked claim reject a simulation older than any failed attempt.
The original 50-bps bound, fixed converted amount and risk reserve are unchanged.

All three BTC/ETH/SOL component cases passed: prove costs -> new-bank preparation
-> one protected claim -> one genuine unfunded custody signature -> explicit
never-broadcast abort -> encrypted archive/restore retaining both attempts. Old
simulations, changed ancestry, missing/copy-only capability and repeated use are
negative cases. No replacement financial send occurs in these tests. Six prior
failed-return cases passed; runtime/archive tests finished 39 total, 36 passed
and 3 Linux-only skips. The client/API/identity subset passed 17 checks, and the
extended pure identity suite passed five. The final null/original-ID guards also
passed the BTC component test. Local web build prepared 31 assets and whitespace
checks passed. No observed test process remains live.

The public review producer/confirmation orchestration is NOT connected yet.
It must freshly audit all FAILED ancestors (including after an ABORTED child),
prepare at the verified slot floor, bind the private evidence to a separately
approved review and carry it through confirmation. Successful return/UTC cost
accounting, ancestor receipt audits, full-current-source CI and public release
verification remain open. Nothing was deployed, no real funds were moved and
no bot was enabled. Discover was reviewed and remains unchanged because these
unpublished server primitives are not newly available public functionality.

### Fresh failed-return review orchestration (local, 2026-11-07)

The review producer now freshly audits every FAILED ancestor, obtains complete
current costs, raises the preparation slot floor, rejects previously signed
messages and binds the private one-use evidence to the review's expiry and
separate explicit confirmation. A verified failed return may expose a new
unchecked review in the panel, including after reload; UNKNOWN remains query-only.
This supersedes the previous paragraph's disconnected-producer status, not its
remaining historical-accounting and publication limitations.

All three BTC/ETH/SOL native client/API retry cases passed: finalized rejection,
new review, false-approval rejection, one separately approved replacement, lost
replacement acknowledgement, status-only reconciliation, complete current costs,
release of the original reserve and encrypted restore retaining both attempts.
No duplicate send or opening fee was observed. Five panel tests passed, including
FAILED/ABORTED reload behavior and the non-eligible rejection remaining query-only.
These use generated unfunded custody and mocked financial transport, not real
orders. Browser integration and full-current-source CI are checked separately.
Historical successful-conversion accounting and full release verification remain
unfinished. No production update, funds movement or bot activation occurred.
Discover's four source files were reviewed for this internal unpublished change;
no availability or version content change is appropriate yet.

The three opt-in Edge browser integration cases also passed (BTC/ETH/SOL),
using the real browser client and API bridge against the native unfunded fixture.
This is client/API integration evidence, not a deployed-page or production-fill
test. Full current-source CI was started and remains pending; do not substitute
the earlier 1436-test checkpoint result for this run or restart a quiet process.

### Historical cost-data boundary (local, 2026-11-07)

Inspection confirmed that completion still requires the initial conversion in
today's account, while the ordinary closed-USD reader intentionally rejects a
different transaction day. Added an explicitly separate historical closed-bound
reader, preserving the ordinary reader's same-day contract. Historical requests
retain the real current wall clock and ten-second lease, reject future/invalid
dates and mixed-day transactions, and require actual retained closed bars for the
transaction day. No clock is rewound, no missing data becomes zero, and current
or open bars cannot stand in for historical prices.

Five focused tests passed, including the unchanged same-day contract, prior-day
five-minute bounds, missing/zero-trade data, stale leases, midnight rollover and
backwards wall-clock rejection. This is a read-only market-data prerequisite,
not yet historical conversion/failed-opening cost evidence or permission to
release a reserve. The already-running full CI predates this helper change;
its result must not be represented as verification of this newer source.
No deployment or financial transport occurred. Discover content remains
unchanged for this unpublished accounting-only increment.

### Historical conversion and network-cost capabilities (local, 2026-11-07)

Added separately branded historical conversion USD valuation and historical SOL
network-fee valuation, using genuine verified journal/transaction facts and the
actual current clock. They preserve the original transaction day, record the
observation day, reject current/future-day misuse, and expire on their original
ten-second lease, backwards clock movement or observation-day rollover. Neither
historical capability can pass its ordinary daily-account validator (nor vice
versa), preventing yesterday's expenses from being silently charged today.
The conservative conversion loss and fee-floor formulas are shared unchanged;
network fees remain separate, priced from closed historical SOL/USD buckets.
Clones, duplicate facts, missing bars and fabricated transactions fail closed.

The BTC/ETH/SOL conversion-binding cases and daily-account regressions passed:
15 tests, zero failures. The earlier bounds plus conversion-binding subset also
passed all eight checks. The pending full CI has now terminated successfully:
1444 tests, 1424 passed, 20 skipped, zero failures. That run began before the
historical readers were edited and is therefore a pre-historical-reader baseline,
not full-current-source evidence. No CI process remains live from that run.
Completion orchestration still needs a private historical-cost join and its
consumer tests before prior-day reserve release is supported. Nothing was
published, signed with a funded wallet or sent to a financial network. Discover
remains unchanged for this unpublished internal accounting work.

After these reader changes, the local web build prepared 31 assets and whitespace
checks passed. Three native client/API ordinary-return cases (BTC/ETH/SOL) passed
against the updated default readers. The BTC binding case additionally confirms
that changing the durable source invalidates historical conversion valuation.
All started processes from this increment are terminal. Full-current-source CI
and the historical completion consumer remain outstanding, not silently waived.

### Prior-day initial conversion joined to today's return (local, 2026-11-07)

Connected a private read-only historical-cost join to recovery completion when
the initial conversion or failed opening is absent from today's complete account.
It reconstructs the original finalized conversion through its native constructor,
joins genuine transaction/journal facts, independently values old conversion loss
and SOL fees, and binds the exact parent/hold/source/return/attempt-chain snapshot.
Historical costs stay in their original day; the current complete daily account
and actual received USDC remain mandatory. A copied audit, another owner/account,
changed durable source, missing historical fee bars, stale lease, backwards clock
or day rollover cannot release risk. Evidence alone never mutates the reservation.

Six native client/API cases passed: ordinary and prior-day initial-conversion
returns for BTC/ETH/SOL. Prior-day cases retain the full 10020000-unit reserve
until the real completion consumer verifies costs, then release it exactly once,
keep today's network fees at 5400 lamports (rather than double-counting the old
5400), retain zero opening fee and preserve encrypted archive/restore. Financial
transports are mocked and generated custody wallets unfunded. The server/API/
panel subset passed 37 total, 34 passed and three Linux-only skips. Local web
build prepared 31 assets. Browser checks are running separately.

This supersedes the earlier disconnected historical-completion-consumer status
for a prior-day initial conversion with a return finalized today. It does NOT
claim verification of a prior-day failed opening, a return itself finalized on
a prior day, or all failed-return ancestor receipts. Those cases, current full
CI and production release remain open. No deployment, real trade or bot
activation occurred. Discover's four files need no availability/content update
for this unpublished internal recovery change.

The three opt-in Edge browser/client/API prior-day cases reached terminal PASS
as well. These use the isolated native fixture and API bridge, not a production
fill or the user's funded wallet/session. A new full-current-source CI process
is now live; poll its existing handle rather than restarting on quiet output.

### Return finalized before today's accounting day (local, 2026-11-07)

Extended the private historical join for an already-finalized return discovered
on a later day. Its exact native return receipt and genuine journal-bound history
are reread; old recovery loss has a separately branded historical valuation, and
both initial and return network fees are independently valued in their own day.
The completion consumer cannot substitute a plain historical summary, today's
bars, missing same-day history or a copied audit for that evidence. The original
signature, received USDC, conversion identity, slots and chronological order must
match, with the current complete account covering the return slot. No additional
financial transport is performed by recovery.

The existing full-CI handle remains live but predates these latest return-day
changes. Do not call its eventual result full-current-source verification.
Focused native and opt-in browser old-finality tests are running separately;
the initial BTC prior-day and old-finality cases passed before expanding their
negative valuation/capability tests. A local web build prepared 31 assets.
Prior-day failed-opening coverage and failed-return ancestor receipt audits
still need verification. No production release or real funds movement occurred.
Discover remains unchanged because this is unpublished internal recovery work.

The expanded native set terminated PASS: nine cases across BTC/ETH/SOL (ordinary,
prior-day initial conversion and prior-day return finality). The three opt-in
Edge browser/client/API old-finality cases also terminated PASS. They assert
historical return valuation is not accepted by the daily validator; copied or
duplicate facts, missing old fee bars, changed durable records and expired
leases cannot release the original reserve. Prior-day return tests retain zero
fees/loss entries in today's account while separately proving both old network
fees and historical conversion/return costs, then complete once and restore the
encrypted archive. Sixteen API/panel/bounds regressions passed and whitespace
checks are clean. All these focused processes are terminal; the pre-change full
CI handle is still live, without reported failures in its latest output.

### Failed opening and failed-return historical ancestry (local, 2026-11-07)

The previous full CI is terminal: 1449 total, 1429 passed, 20 skipped, no failures.
It predates old-return-finality and failed-opening-prior-day additions, so remains
a baseline rather than current-source release evidence. Six native failed-opening
cases (same-day/prior-day for BTC/ETH/SOL) and three opt-in browser prior-day
failed-opening cases passed. They retain genuine signed opening/return identities,
prove old fees separately, complete CLOSED with slots 180/200 exactly once and
preserve zero opening fee plus encrypted restore. Twelve identity/API regressions
passed. No real financial transport or production change occurred.

The historical join now also reconstructs every FAILED return ancestor through
the native constructor and exact finalized rejection proof, verifies each next
attempt's signature/hash/slot/day reference against those native facts, and
includes old failed-return network fees in the historical group. It revalidates
the private failure leases and full chain before consuming completion evidence.
A failed marker or copied reference alone cannot stand in for a failed receipt.
The only newly exported failure accessor returns the verified immutable accounting
transaction from a genuine private failure proof; it grants no signing authority.

An initial BTC failed-return/replacement/next-day completion case passed. Expanded
BTC/ETH/SOL native and browser cases are now running, including unavailable old
failure receipts and changed predecessor-slot references; these must retain the
original reserve and cannot resend. Current full CI and coordinated production
release remain outstanding. Discover remains unchanged for unpublished internal
recovery work.

The expanded failed-return ancestry set has terminated PASS: three native plus
three opt-in Edge browser/client/API BTC/ETH/SOL cases. Each proves all 1620
micro-USDC of old network costs (initial conversion, rejected return, completed
replacement), while today's network fees remain zero. Missing the rejected
ancestor's native transaction or changing its recorded slot reference refuses
historical completion and retains all 10020000 units of original reserve. A
subsequent intact query completes once, without a third financial transport,
without opening fees, and preserves both attempts in encrypted archive/restore.
All focused process handles from this increment are terminal. Preparing a new
full-source verification run next; no publication or financial action occurred.

### Release inventory and compiled-screen check (local, 2026-11-07)

The new full-suite process is live against the frozen financial-source candidate;
do not rebuild or change runtime files under that run. Production was rechecked
read-only: no active automation accounts, pending/open entries, pending closes or
pending swaps. The execution journal's nine tables are all empty, integrity is
ok, no foreign-key errors, exact source schema remains
505c96362bd65d613ca90ddd17f846c3bfca04d5f0ee69c732b9f3ebf05d91b9.
The installed worker hash remains 17ab1fd592dadd7bc5ca7110da644dbbea3b31f9ed1ecc4226c2cc497258bda5;
public status remains web 1.38.19 / Android feed 1.38.17. No restart, migration,
custody access, configuration mutation or financial request was performed.

The compiled DOM check initially failed because its diagnostic script searched
for the obsolete 'Confirm manual bot order' label; actual source uses 'Confirm
opening'. Corrected that script selector, adding an explicit missing-review
assertion, without changing financial runtime source. It now passes desktop
1440x900 and mobile 390x844: close consent, a single unchecked entry consent,
10.02-USDC fixture total, one mocked confirmation and pending-state rendering.
All non-loopback browser requests were blocked. This is isolated compiled-screen
evidence, not the user's real browser/session or a production order.

Release gates still include terminal current-suite success, the exact empty-only
schema upgrade with private rollback copies and verified recovery proof, a
coordinated paused worker/web/HTTPS update, candidate main/Discover verification,
then verified publication. The old installer must not be reused blindly: its
backup directory/flag already exist and the financial journal must never be
replaced with a stale snapshot. No public availability claim was changed.

### Publication connection requires team consent (2026-11-07)

Read the deployments/CI guidance and verified the existing local link targets
project jamd-dmaj (prj_MDNgTRQMQhZHy0Np4HuKiqTKbsjd) in team
team_JORXYGzaQKli6kcSkgcGRU33. The authenticated Vercel connection refused the
read-only inspection of the known current deployment with 403, explicitly
requiring team access consent. Requested the connector's one-use team consent
link for the user; no team/project target was changed, no credential was read
or printed, and no alternate account was used to bypass that refusal.
Publication must wait for that approval, then retry the same deployment read
through the same connection. The full financial-source CI handle remains live;
this first access blocker does not justify calling the goal blocked or complete.
No production migration, restart, deployment, trade or activation occurred.

### Verified local checkpoint; publication awaiting team consent (2026-11-07)

The final frozen financial-source CI reached terminal success: 1458 tests,
1438 passed, 20 skipped, zero failures. Its native conversion/recovery file
completed all 93 cases. No test process remains live. The compiled worker
candidate still hashes to d5e4825e56bc8623f3fca65c9510e06d988f07d9281d3d8f7ead5e3e1c3ec469;
the historical join and native simulation test file match the hashes captured
while that suite was running. The compiled desktop/mobile diagnostic passes
separately after its selector-only correction.

The same known-deployment Vercel inspection still returns 403 forbidden for
the intended team, unchanged across consecutive goal continuations. The
connector's requested team consent remains necessary; no alternate scope or
account is used to bypass it. Local verification and a source checkpoint do not
prove publication. Keep the full objective unfinished until authorized staged
publication, coordinated paused-server upgrade and public verification succeed.
Preserve the pre-existing .vercel link and two untracked diagnostic scripts;
exclude them from the source checkpoint. No real order, signature with funded
custody, transfer, bot activation or production modification occurred.
