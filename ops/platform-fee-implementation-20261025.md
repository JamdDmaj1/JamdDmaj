# Platform fee — implementation checkpoint

Agreed terms: 20 basis points (0.20%) of USDC opening margin, not leveraged position size. Integer rounding down to USDC's six decimals. No extra platform closing fee. Recipient: `4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr`. Payment must be separate from the provider-cosigned Jupiter transaction and may be assessed only after a finalized successful opening. These are additional commercial fees, not the provider or Solana network fees.

Implemented and tested:

- Versioned immutable terms and exact integer calculation: 40 USDC margin yields 0.08 USDC.
- Separate private durable SQLite assessment store, prior reservation-bound consent, no retroactive acceptance after an opening, and immutable assessment identity per wallet and opening signature.
- Assessment requires the existing execution journal, an OPEN matching reservation and a branded finalized CPI transaction proof with a single nonzero Increase event for its recorded position. Unconfirmed, failed, stale and forged proofs cannot create an assessment.
- Repeat reads and assessment calls after reopening the database return the original record rather than a second charge.
- A separate fixed-destination USDC TransferChecked instruction planner derives canonical token accounts and pins recipient, mint, amount and wallet authority. It does not modify any Jupiter message.

This is NOT a completed payment flow or a production rollout. Assessment state is deliberately `AWAITING_PAYMENT_REVIEW`, not PAID. No account has been debited and no financial signature or broadcast was made. No production database was changed. These modules are not attached to the deployed worker or browser/native signing paths.

Remaining implementation gates, in order:

1. Bind explicit versioned customer consent into authenticated bot/manual entry reviews; include fee amounts in capital/risk reservations. Do not infer consent from an old activation or create fees for old entries.
2. Add fresh account, balance, simulation, fee and anti-concurrent-spend checks for the separate payment, then a durable payment-attempt journal with exact signed identity persisted before transport. Assessment uniqueness is not by itself payment-attempt exclusivity.
3. Add narrow native/Phantom and bot custody signing capabilities, dedicated review and failure/unknown reconciliation. No arbitrary-message signer or automatic retry of uncertain sends.
4. Expose due, pending, paid and failed payment states without presenting a fee failure as a failed or closed trade. Include the new store in backup/recovery verification before deployment.
5. Verify complete isolated signing/broadcast/restart fixtures and publish only the completed path. Network sponsorship remains separate: USDC platform fees do not remove SOL network fees.

Provider API reviewed: https://perps-api.jup.ag/v2/docs — current increase endpoint has no platform fee/recipient parameter. Existing repository envelope policy verifies the provider's signature over the exact message. Solana fee abstraction: https://solana.com/docs/payments/send-payments/payment-processing/fee-abstraction.
