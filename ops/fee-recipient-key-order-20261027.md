# Recipient setup readonly key order — 2026-10-27

User still reported SETUP_WALLET_TRANSACTION_CHANGED on UI 2026.10.27.4 with the fixed 8,000-lamport network fee. Actual returned signed bytes were not collected; the exact change is not proven.

UI 2026.10.27.5 accepts only a permutation of the five fixed readonly account keys, with all instruction indices remapped to preserve the exact recipe. The two writable accounts, header privileges, signer, blockhash, instruction order, programs, account roles and data remain fixed. Ed25519 verifies the actual returned message; the canonical fresh review is validated independently. New submissions still reject old no-budget messages. No generic transaction relay or additional instruction is allowed.

Safe bounded error details classify rejected changes as LENGTH, HEADER, KEYS, BLOCKHASH or INSTRUCTIONS. No transaction bytes, signature or provider error contents are persisted in diagnostics. Existing uncertainty handling and explicit approval remain unchanged.

Verification: all 120 readonly permutations built by an independent byte/index remapper passed. Freshly signed payer, permissions, key, budget, instruction and blockhash mutations were rejected. The equivalent-order service and page flows submit exactly once using unfunded fixture signatures and mocked RPC. Twenty-four focused tests and one compiled-browser test passed. No agent financial transaction was signed or submitted; bot state was not changed. Actual user success remains unverified.

## Publication verified

- Source 7e2d03a. Full suite: 1,154 tests, 1,135 passed, 19 skipped, zero failures; 227 seconds.
- Verified intended project/team before deployment. Staged production dpl_8YHHxbnjRWHhGbZnP16jHFzAXFm2 reached READY (Other framework, seven-second build), then promoted the exact tested deployment without rebuilding.
- Authenticated candidate and public versioned HTML/UI matched local compiled assets: HTML SHA256 6d9e3243f7f8f9418135a5eafdb0228c6a05098b308ced833c5b096cc9c38869 (LF normalized); JS a98b2f18a94c90c6171cf796de5a9f57321126e65e55758533be6a4b2b540649.
- Public https://www.jamddmaj.com/fee-recipient-setup.html?v=20261027-5 shows UI 2026.10.27.5. Candidate and public read-only preparation passed canonical validation and unsigned mainnet simulation; network 8,000 lamports, rent plus network 1,496,440 lamports, signed false, submitted false. The operator ATA is not yet created according to this preparation. No bot activation occurred.
- Initial verification harness incorrectly validated the HTTP envelope instead of its result and failed locally; corrected envelope handling passed, without changing application code or authorization policy.
- Bounded deployment error scan: zero records in the preceding ten minutes. No continuous monitoring established.
