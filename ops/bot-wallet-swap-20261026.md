# Dedicated bot wallet manual swap — implementation status

The owner's requested target is the separately custodied bot wallet, not the native Android or Phantom account. A watch-only public link is insufficient signing authority. No source/name change may promote that public link into custody access.

## Completed in this change

`createBotWalletSwapReviewer` prepares SOL ↔ canonical USDC only, with exact integer token units and 50-bps slippage. It obtains the target from server-owned controls using an authenticated owner hash supplied by the eventual HTTP boundary, not a body-selected address. It requires disabled/paused controls, matching exclusive custody without restore quarantine, and positively known empty pending operations. It rechecks ownership, custody, pause, control revision and pending state after asynchronous chain validation.

The existing swap engine validates mainnet, the complete unsigned route, account ownership, available funds, network fee/rent, protected minimum and simulated balance effects. Builder origin is fixed. RPC methods are read/simulation only. The returned projection contains no message bytes, key, custody grant or submission method, and explicitly states `readyForSigning:false`, `submitted:false`.

Tests: four synthetic test cases passed, covering both directions, owner-bound target, exact amounts/invalid pairs, and rejection of active bots, invalid custody, missing authentication and unknown/pending operations. No funded key, live financial signature or transaction was used.

## Still required — not delivered or public

1. A durable swap record and wallet exclusion shared with activation/worker operations, surviving restart and encrypted backup/restore without clearing uncertainty.
2. A narrow one-use custody grant bound to the reviewed message, authenticated owner, unchanged control revision, backup evidence and the durable signing claim. Do not reuse the close-proceeds signer or add a generic message signer.
3. Explicit confirm, one submission attempt, finalized outcome verification and recovery without automatic resend.
4. Authenticated API integration and Assets inline UI for the selected exclusive wallet. Ownership must be verified server-side on each request; a linked address or Google profile in local storage is not permission.
5. Integrated tests and publication of the matching server/web components. This component alone must not change UI capability claims.

This review component is source-only and is not connected to the running server. The bot wallet remains watch-only in Assets until the remaining path is implemented and verified. The operator fee-account setup is a separate activation prerequisite; it is not a substitute for implementing the bot-wallet swap.

## Completed integrated source, subsequent work on 2026-10-26

The earlier review-only status above is historical. Source now includes a private SQLite swap journal, one-use custody grant, exact owner-signed transaction validation, a single durable UNKNOWN-before-send transport attempt, finalized status recovery without resubmission, and explicit recovery of SIGNING records that provably never reached transport. API actions authenticate against the existing session ledger and check durable wallet ownership before accessing the service. The browser receives public review/result projections only, never a key or signed transaction.

Swaps require paused controls, zero open/pending journal activity, zero fee debt and a fresh chain bank with no supported open positions. The activation authorizer checks both current requests and durable pending swaps. The runtime fails closed if its swap-journal flag is omitted after a swap store exists. Startup never creates that store. A runtime with bot swaps but without the final fee integration cannot activate automation; this release must not be advertised as completion of bot trading.

The new journal is included in consistent encrypted runtime backups. A prior custody-only/runtime backup does not authorize bot swaps. Restore coverage is separately recorded and rechecked by the custody signer. UNKNOWN signatures remain held after restore; restoring keys leaves custody quarantined and controls paused. The recovery key remains exclusively on the user's PC.

Assets opens an inline bot-specific panel for the selected watch-linked account, then verifies authenticated ownership with the VPS. Only after that response does its local portfolio heading identify it as the server-custodied bot wallet. A generic watch address remains display-only for other trading flows; it is never promoted into a Phantom/native signer. Input is token units, not bank USD. Explicit unchecked consent is required before confirmation. Finalization requests a refresh of the same linked wallet, not a transfer between accounts.

Evidence before production changes:

- Full suite r2: 1,108 cases, 1,089 passed, 19 skipped, zero failures.
- Final balance-refresh focused rerun: 10 passed, 1 optional browser test skipped.
- Built Edge mobile fixture: inline Phantom and bot panels, owner status, review/minimum/costs, explicit confirmation with mocked service only, result recovery, no navigation or page errors. No real financial requests.
- Linux VPS isolated DynamicUser/PrivateNetwork fixture: 6/6 passed on Node 22.23.1; no access to funded custody or network.
- Existing legacy journal migration rehearsal: schema `e92bbd…` → `505c96…`, one paused account, zero reservations; original stores unchanged by rehearsal.
- A transient diagnostic unit initially applied systemd's default 0755 state-directory mode. The original 0700 modes on both exact private directories were immediately restored, and subsequent units explicitly require StateDirectoryMode=0700. Their parent remained private. Worker/web stayed active; no permission checks were relaxed. The corrected rehearsal passed.

Publication and actual installed backup attestation remain to be recorded below. No real swap or bot activation has been requested by these tests.
