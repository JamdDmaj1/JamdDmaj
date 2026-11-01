# Manual Long/Short with exclusive bot custody

Status: implemented source and isolated tests; NOT deployed or enabled.

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

## Required before completion/publication

1. Finish clean-worktree full suite and browser QA; the first clean suite found
   a Discover translation insertion-order assertion, fixed and focused tests pass.
   Run full suite again after all edits. Original-root suite's missing bundled
   panel was fixed by including the panel in `build-web.mjs`.
2. Review service failure/race paths and add ownership/limits mutation tests.
   SIGNING with no recorded signature is deliberately held for operator review,
   not cancelled by timeout. Do not weaken the existing journal cancellation rule.
3. Verify position-management scope, especially manual full close availability,
   before advertising a complete manual trading experience. Current panel only
   implements entries and status; on-chain exits follow the reviewed TP/SL.
4. Review Discover HTML/JS done; CSS/tour styles inspected, no layout change needed.
   Version 1.38.18/code174 exists only in this worktree. Do not claim published.
5. Bundle and test VPS candidate. Preserve exact current worker bundle and
   database/recovery backups; do not enable any user account. SSH read-only check
   succeeded; worker and web are active. Existing worker is a bundled single file
   `/opt/jamddmaj-perps/worker/perps-server-worker.mjs`, currently without
   `--bot-manual`. Existing manual policy DB is in the shared runtime directory.
6. Stage/test/promote Vercel with verified team/project, then verify public assets.
   Do not create tokens, sign funded orders or execute trades to test readiness.

No production mutations or financial operations have been performed in this task.
