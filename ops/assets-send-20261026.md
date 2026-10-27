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

Publication evidence follows after release verification. No real funds were signed, submitted or moved during implementation/testing.
