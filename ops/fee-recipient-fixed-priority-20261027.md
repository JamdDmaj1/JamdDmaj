# Fixed recipient setup priority — 2026-10-27

User's versioned page reported SETUP_WALLET_TRANSACTION_CHANGED after Phantom approval. Earlier screenshot showed 8,000 lamports network cost in Phantom versus 5,000 in the prepared review. This proves a message change, not its exact instruction contents; Phantom's documented automatic priority insertion is consistent with these observations.

Primary references inspected: https://github.com/phantom/docs/blob/master/development-powertools/solana-priority-fees.md and https://solana.com/docs/core/fees . Phantom documents unsigned-message enhancement when compute budget instructions are absent, including signTransaction.

Fix: prepare a fixed legacy message containing SetComputeUnitLimit(100000), SetComputeUnitPrice(30000 micro-lamports), followed by exactly the same idempotent canonical operator-owned USDC ATA creation. Priority is exactly 3,000 lamports. Share one compiler between preparation and client/server validation. Fresh getFeeForMessage and both unsigned/signed simulations still determine/check exact reviewed payer effects; network cap remains 10,000 lamports. No arbitrary wallet message changes accepted, generic relay, payer change or additional instruction allowed.

New reviews use only the fixed-budget 356-byte signed wire. Read-only recovery still recognizes the previous exact 304-byte legacy signed creation, while new submissions reject that older message. Visible UI 2026.10.27.4 forces a fresh review and explicit wallet approval.

Verification before publication:

- Twenty focused preparation/protocol/flow tests passed, including valid fixture signatures, budget and instruction mutations freshly re-signed by the unfunded fixture owner, rejection of old-message submission and old-message read-only inspection.
- Compiled-browser preparation test passed with mocked Phantom and intercepted RPC: exact costs/version, no prompts/submissions, no page errors.
- Actual mainnet read-only CLI preparation and unsigned simulation succeeded: rent 1,488,440 lamports, full network 8,000 lamports, total 1,496,440 lamports. Agent did not sign or submit. Real user completion still needs verification.

No production custody state, bot settings or activation changed. New full regression and publication results recorded below when complete.
