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
