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

1. Clean-worktree full suite: 1315 tests, 1296 passed, 19 skipped, zero failures.
   Additional client/API/policy regressions after final copy adjustment pass.
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

Android APK remains 1.38.17 on the public update feed; this publication does not
claim an Android 1.38.18 release or a financial operation on a phone.
