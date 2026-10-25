# Platform fee — implementation checkpoint

Agreed terms: 20 basis points (0.20%) of USDC opening margin, not leveraged position size. Integer rounding down to USDC's six decimals. No extra platform closing fee. Recipient: `4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr`. Payment must be separate from the provider-cosigned Jupiter transaction and may be assessed only after a finalized successful opening. These are additional commercial fees, not the provider or Solana network fees.

Implemented and tested:

- Versioned immutable terms and exact integer calculation: 40 USDC margin yields 0.08 USDC.
- Separate private durable SQLite assessment store, prior reservation-bound consent, no retroactive acceptance after an opening, and immutable assessment identity per wallet and opening signature.
- Assessment requires the existing execution journal, an OPEN matching reservation and a branded finalized CPI transaction proof with a single nonzero Increase event for its recorded position. Unconfirmed, failed, stale and forged proofs cannot create an assessment.
- Repeat reads and assessment calls after reopening the database return the original record rather than a second charge.
- A separate fixed-destination USDC TransferChecked instruction planner derives canonical token accounts and pins recipient, mint, amount and wallet authority. It does not modify any Jupiter message.

The payment engine now includes separately compiled TransferChecked + invoice-bound Memo, fresh account/mint/owner checks, exact balance and fee simulation, owner-signature verification, pre-send revalidation, durable one-attempt submission and finalized receipt reconciliation. The Memo binds the payment to its assessment so equal margins under the same recent blockhash cannot produce the same payment for two different invoices. Canonical program reference: https://github.com/solana-program/memo/blob/main/idl.json.

Payment attempts have distinct SIGNING, UNKNOWN, PAID and FAILED states. Exact owner-signed bytes are retained even when a wallet prompt returns after review expiry, but expired reviews cannot broadcast. Two independent journal connections cannot prompt/send the same fee twice. Timeout/unknown results are held, not retried. Settlement requires the exact serialized transaction, verified owner signature, finalized status, expected recipient/mint and exact USDC/SOL effects. An acknowledgement alone never means PAID.

This is NOT a production rollout. Assessment state remains `AWAITING_PAYMENT_REVIEW`; actual payment status comes from the separate durable payment journal. No account has been debited and no real financial signature or broadcast was made. No production database was changed. The payment engine uses explicit injected signing and RPC adapters; it is not attached to the deployed worker or browser/native signing paths.

Network payer choice resolved: the user explicitly chose that each trader pays Solana network fees from their own SOL. No sponsor wallet is authorized or needed for this variant. Terms version `jamddmaj-perps-margin-20bps-v2-trader-sol` explicitly pins TRADER/SOL and requires trader SOL; existing versioned acceptance cannot silently cover changed terms. Fee preparation checks sufficient native fee balance, not only USDC.

A shared browser/native-WebView review component now shows the exact USDC platform fee, separate SOL network charge, destination and initially unchecked explicit acceptance. It invalidates approval on wallet/session changes, expiry and background state, retains the original branded review identity for its injected signing adapter, and never equates a submission acknowledgement with payment. It is implemented and tested but not yet attached to a public-page API or native/Phantom signing adapter.

Verification at this checkpoint: 69 related tests passed, zero failed, including 17 fee-specific tests. All signing and RPC/broadcast cases use unfunded deterministic fixtures and in-memory fake transport. The regular public web build passes. No release version was bumped or deployment performed.

Remaining implementation gates, in order:

1. Bind explicit versioned customer consent into authenticated bot/manual entry reviews; include fee amounts in capital/risk reservations. Do not infer consent from an old activation or create fees for old entries.
2. Connect the tested payment engine and durable payment-attempt journal to shared wallet/risk reservations; retain cross-operation exclusivity with entries, closes and swaps. Assessment uniqueness is not by itself payment-attempt exclusivity.
3. Connect narrow native/Phantom and bot custody adapters for the trader-paid SOL signing structure and the tested review component. No arbitrary-message signer or automatic retry of uncertain sends.
4. Expose due, pending, paid and failed payment states without presenting a fee failure as a failed or closed trade. Include the new store in backup/recovery verification before deployment.
5. Verify complete isolated signing/broadcast/restart fixtures and publish only the completed path. Network sponsorship remains separate: USDC platform fees do not remove SOL network fees.

## Authenticated consent integration checkpoint

The existing control client, activation panel and automation HTTP adapter now support an optional fee-enabled backend. They verify the canonical versioned fee disclosure and require a separate initially unchecked fee acceptance in addition to bot activation approval. Unknown/changed fee terms, recipient or payer are rejected. An authenticated ownership lookup occurs before invoking the private consent recorder. If a fee-enabled review reaches a backend whose fee service is no longer configured, activation fails rather than silently dropping the terms.

The private fee journal records owner-bound automation mandates against the reviewed settings. The executor has an opt-in pre-signing hook that records reservation-bound consent only when the current active control revision and mandate settings still agree. Changing settings, pausing, old fee versions and foreign account identities cannot authorize that entry. Production still has no attached fee signer, risk overlay or fee-service startup configuration; these source changes do not enable customer charges.

Read-only mainnet preflight found an operational blocker: recipient `4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr` exists, but canonical USDC ATA `AKyJkfAEqmPMCbKRFmtdYzkHry3oJjPxtZFathpSwKNL` does not, and getTokenAccountsByOwner returned zero USDC accounts. Payment preparation now reports `PLATFORM_FEE_RECIPIENT_USDC_ACCOUNT_MISSING` before any signing/simulation request rather than a generic error or customer-funded account creation. No address was changed.

A read-only quote for an operator-paid idempotent ATA creation returned 1,488,440 lamports of account rent reserve and 5,000 lamports network fee (1,493,440 lamports total / 0.00149344 SOL). This is a temporary quote, not a guarantee for a later transaction. The message was prepared only to query getFeeForMessage; it was not signed or submitted. Creating/funding the account requires the recipient owner's explicit transaction confirmation, and must not be silently charged to the first customer. This operational step does not replace the remaining signer, risk-reservation and recovery integration gates above.

Provider API reviewed: https://perps-api.jup.ag/v2/docs — current increase endpoint has no platform fee/recipient parameter. Existing repository envelope policy verifies the provider's signature over the exact message. Solana fee abstraction: https://solana.com/docs/payments/send-payments/payment-processing/fee-abstraction.
