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

## Published

- Source `be24f6c`, READY production candidate `dpl_HBP2CHcHQkU7GHQ9tfLe5S8FWX24` (Other framework, five-second remote build), promoted without rebuilding to www.jamddmaj.com.
- Fresh full suite: 1,150 total, 1,131 passed, 19 skipped, zero failures, 224 seconds.
- Authenticated candidate hashes matched local: HTML LF-normalized `04d85d10f7174877f5fb96822857c65968545c8efeb985b67ccbb3a27a70af28`, UI `689f93094ecebc77edcfa0d4a1e4f6fa7e1849022074254b25b5e4101426531c`.
- Initial immediate public unversioned JS request returned a different cached body while the HTML was current. The actual HTML script URL `/fee-recipient-setup-ui.js?v=20261027-4` was verified to match the new bundle. Use the versioned page/UI for this update.
- Actual public GET preparation passed canonical client validation and unsigned mainnet simulation with network 8,000 lamports and total 1,496,440; no submit endpoint, signer or activation called. Bounded deployment error query returned zero records; no continuous monitoring added.
- Operator must discard the earlier unsigned/unsubmitted review, prepare the new fixed-budget review and independently approve the disclosed cost. Do not declare actual ATA creation or bot readiness until verified on chain.
