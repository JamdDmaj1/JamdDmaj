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

This is NOT a production rollout. Assessment state remains `AWAITING_PAYMENT_REVIEW`; actual payment status comes from the separate durable payment journal. No account has been debited and no real financial signature or broadcast was made. No production database was changed. The payment engine uses explicit injected signing and RPC adapters; it is not attached to the deployed worker or browser/native signing paths. The implemented payer variant uses the owner's SOL, not a sponsor. A user choice is pending on whether JamdDmaj should instead sponsor the network fee, which changes message structure, signing, service custody and funding requirements.

Verification at this checkpoint: 69 related tests passed, zero failed, including 17 fee-specific tests. All signing and RPC/broadcast cases use unfunded deterministic fixtures and in-memory fake transport. The regular public web build passes. No release version was bumped or deployment performed.

Remaining implementation gates, in order:

1. Bind explicit versioned customer consent into authenticated bot/manual entry reviews; include fee amounts in capital/risk reservations. Do not infer consent from an old activation or create fees for old entries.
2. Connect the tested payment engine and durable payment-attempt journal to shared wallet/risk reservations; retain cross-operation exclusivity with entries, closes and swaps. Assessment uniqueness is not by itself payment-attempt exclusivity.
3. Resolve the network payer choice, then add narrow native/Phantom and bot custody adapters for the chosen signing structure, dedicated review and failure/unknown reconciliation. No arbitrary-message signer or automatic retry of uncertain sends.
4. Expose due, pending, paid and failed payment states without presenting a fee failure as a failed or closed trade. Include the new store in backup/recovery verification before deployment.
5. Verify complete isolated signing/broadcast/restart fixtures and publish only the completed path. Network sponsorship remains separate: USDC platform fees do not remove SOL network fees.

Provider API reviewed: https://perps-api.jup.ag/v2/docs — current increase endpoint has no platform fee/recipient parameter. Existing repository envelope policy verifies the provider's signature over the exact message. Solana fee abstraction: https://solana.com/docs/payments/send-payments/payment-processing/fee-abstraction.
