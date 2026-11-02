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
