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
