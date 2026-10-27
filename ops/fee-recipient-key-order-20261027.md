# Recipient setup readonly key order — 2026-10-27

User still reported SETUP_WALLET_TRANSACTION_CHANGED on UI 2026.10.27.4 with the fixed 8,000-lamport network fee. Actual returned signed bytes were not collected; the exact change is not proven.

UI 2026.10.27.5 accepts only a permutation of the five fixed readonly account keys, with all instruction indices remapped to preserve the exact recipe. The two writable accounts, header privileges, signer, blockhash, instruction order, programs, account roles and data remain fixed. Ed25519 verifies the actual returned message; the canonical fresh review is validated independently. New submissions still reject old no-budget messages. No generic transaction relay or additional instruction is allowed.

Safe bounded error details classify rejected changes as LENGTH, HEADER, KEYS, BLOCKHASH or INSTRUCTIONS. No transaction bytes, signature or provider error contents are persisted in diagnostics. Existing uncertainty handling and explicit approval remain unchanged.

Verification: all 120 readonly permutations built by an independent byte/index remapper passed. Freshly signed payer, permissions, key, budget, instruction and blockhash mutations were rejected. The equivalent-order service and page flows submit exactly once using unfunded fixture signatures and mocked RPC. Twenty-four focused tests and one compiled-browser test passed. No agent financial transaction was signed or submitted; bot state was not changed. Actual user success remains unverified.
