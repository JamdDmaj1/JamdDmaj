# Assets-local Send — 2026-10-26

## Scope and original failure

The Assets Send button previously opened the native wallet home or scrolled to the external-wallet section. It did not provide an amount/token/recipient form, and could not withdraw from the server-custodied bot wallet.

Implemented Assets-local token selection with observed balances, token amount, full Solana recipient address, exact sender/recipient/mint/amount/cost review, unchecked explicit authorization, confirmation, and pending-result recovery. Bot-wallet sends use verified Google ownership and server custody; connected Wallet Standard external wallets use sign-only approval and the existing same-origin operation lock/journal. Public watch metadata is never a signer. Android's existing native send remains accessible through its secure screen; this release does not publish a new APK or expose its hardware key to JavaScript.

## Security boundary

- Locally compile only a System SOL transfer or classic SPL TransferChecked, optionally preceded by canonical idempotent recipient ATA creation. No external wire builder, arbitrary instruction or delegated signer. Reject self-addresses, off-curve/invalid recipient wallet addresses, token/program destinations, unsupported Token-2022 extensions, wrong chain, invalid precision, insufficient funds, and inconsistent simulated effects.
- Read confirmed source/mint/recipient accounts; verify exact debit, credit, unchanged mint, network fee, and recipient ATA rent in unsigned AND signed simulations. All reviewed fields are fixed. Changed fields, expired reviews, disconnected signing sessions and changed server controls invalidate authorization.
- Server uses the existing private shared `swaps.sqlite` operation journal and backup gate, with no schema migration. A transfer and a swap cannot be pending concurrently in the same bot wallet. Bot must remain paused, without positions, reservations, exits, fee payments or unknown operations.
- Distinct transfer engine grants cannot be confirmed through the swap endpoint. One-use custody authorization binds owner, controls revision and exact serialized message. The existing signing function accepts only a verified internal grant, never request-supplied message bytes.
- Durable SIGNING claim, exact signature journal, durable UNKNOWN before at most one send. Ambiguous results stay blocked across restart and are recovered without rebroadcast. No automatic re-sign/retry. Sends do not activate the bot or charge a platform trading fee; network SOL and disclosed recipient account rent apply.
- Pending status projections distinguish SWAP from TRANSFER so the other panel does not mislabel a completed operation.

## Verification before release

- Focused local and isolated Linux suites: 18/18 passed, including real fixture-key custody signatures with mocked network sends, exact recipient ownership, consent, shared exclusion, timeout/restart recovery, invalid recipient/precision/funds/chain effects, existing/missing token accounts. Linux fixture unit had PrivateNetwork and no production custody mounts.
- Browser regression: external sign-only review and bot send form/review/unchecked-consent/mock-confirm/recovery all remain in Assets, no mobile overflow or page errors. All financial browser requests intercepted; no production confirmation or transaction send.
- Read-only VPS mainnet preparation/simulation of SOL and USDC transfers succeeded. Diagnostic had no vault imports, custody grants, signing or send capability. Observed fee 5,000 lamports; the tested missing recipient USDC ATA required 1,488,440 lamports. These are diagnostic values, not a user-authorized send or a guaranteed future fee.
- Initial full regression found three lightweight DOM fixtures missing `.style`; fixed the fixtures and all three targeted tests passed. A fresh complete run is recorded below when finished.

Official references consulted: https://solana.com/docs/tokens/basics/transfer-tokens and https://solana.com/docs/payments/send-payments/verify-address .

## Published and verified

- Source commit `289f512`. Fresh complete regression: 1,120 tests, 1,101 passed, 19 skipped, zero failures (241 seconds). Built browser regression passed locally and against the public domain after promotion.
- VPS worker SHA-256 `8c4a25c5cce043b1f35a2f987f20baed9b3377006d4da22fa2cf87260439b698`. Previous worker preserved at `/opt/jamddmaj-perps/backups/bot-swaps-20261026/worker-before-assets-send.mjs`. No state migration, keys or controls changes.
- Before/after operator checks: one configured account, zero active accounts, two existing operation records, zero pending operations; verified backup still includes operations. These two records predated this deployment; no new production transaction record was created by tests. Worker, manual web service and HTTPS active, zero service restarts, health HTTP 200.
- Staged production deployment `dpl_2AXsx1iGssTusGLP632pXcJ9jeFg`, `https://jamd-dmaj-7jjns0swb-jamd-dmaj-s-projects.vercel.app`, READY and promoted without rebuilding to `https://www.jamddmaj.com`.
- Authenticated candidate and public byte hashes matched the local build: Assets bundle `f0c6fac4a9afe2a609c3b7a39c309061d96b0616d6862316dd04b1e1f1985613`; shared signing-session bundle `5d6765ad1c73d3bf60fd35a82f240af068e469ca3f527bcdd45d7f1a6b86873a`.
- Public browser tests kept financial calls mocked and verified inline token/amount/recipient review, invalidation after editing, unchecked consent, one mock confirmation and recovery, correct account selection, no mobile overflow and no page errors. Vercel deployment error query over the last ten minutes returned zero records; this is a bounded observation, not ongoing monitoring.

No real funds were signed, submitted or moved during implementation/testing. The bot was not activated. This is a web/server release, not a new Android APK; native Android sends retain their existing secure review screen.
