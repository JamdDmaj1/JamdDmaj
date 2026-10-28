# Recipient setup Lighthouse assertions — 2026-10-28 UTC

User's UI 2026.10.27.6 reports legacy, 439 bytes, LENGTH. This rules out a simple v0 conversion in that attempt, but not yet identifies its actual programs/data. The earlier v0 hypothesis was not confirmed. No user signed bytes were requested or collected.

Primary sources reviewed: https://phantom.com/learn/blog/anti-spoofing-security and https://www.lighthouse.voyage/; source https://github.com/Jac0xb/lighthouse at 4c579479c98635e419b1b167f08be02a71604a71 (instruction enum, processor dispatch, AccountInfo/TokenAccount assertions, processors, LogLevel and IntegerOperator). Phantom documents injecting Lighthouse guard assertions.

UI 2026.10.27.7 and shared server protocol now structurally parse bounded legacy/v0 messages, no lookup tables. They require exactly the original payer/ATA, same readonly base key set, privileges, blockhash and three fixed core instructions (compute limit, compute price, ATA creation). They allow only the additional known Lighthouse program key and one to four appended non-mutating assertion instructions on payer/ATA. Only AccountInfo single/multi (5/6) and TokenAccount single/multi (9/10), restricted fields and bounded canonical one-byte vector lengths are decoded. MemoryWrite/Close, unknown variants/programs, extra targets/accounts, hash/KnownOwner variants and noop-CPI logging are rejected. The actual Ed25519 signature, canonical fresh review, exact signed simulation effects/cost and one-attempt send are still mandatory. Thresholds are assertion predicates only; false ones must fail signed simulation. No generic relay, fee or transfer exception exists.

Rejected diagnostics include public program IDs and bounded opcode/data-length/account-count only, not signed bytes, signature, blockhash, full account table or assertion data/values.

Evidence: 33 focused tests passed, including independent 439-byte guard fixture generation, v0 equivalent, exact owner signatures, service and page single-send/recovery, truncation checks for all shorter diagnostic lengths and re-signed policy attacks. All real financial operations in tests are mocks with deterministic unfunded keys.

Actual mainnet read-only RPC allowlist check (getGenesisHash/getFeeForMessage/simulateTransaction only): unsigned 439-byte candidate succeeded, consumed 27,109 of fixed 100,000 CU, network 8,000 lamports, exact payer effects. Same candidate with deliberately incorrect balance assertion failed, consuming 17,339 CU. Both had zero signature bytes, sigVerify false; nothing signed, submitted or activated. These prove supported guard behavior, not the actual contents of user's rejected message. Actual account creation still requires the user's explicit Phantom approval and on-chain verification.

## Verified publication

- Source 9f3d4ab. Full suite: 1,163 total, 1,144 passed, 19 skipped, zero failures; 278 seconds. Separate compiled-browser preparation test passed with mocked wallet and no signing/submission.
- Intended project/team verified from export directory before deployment. READY production dpl_Fh8kPHtNSkLVzYmqd4G56MXGgbna (Other framework, eleven-second build) was checked and promoted without rebuilding.
- Authenticated candidate and public versioned assets matched local: HTML LF-normalized SHA256 a4637977fd44aa0a4d6de417a51f2d581c4d43828c775e49b4edfa8e69ede08e; UI JS 73ffc7aae917df531f67c543b2e7c194dfa95ebe005cfb42f21506a653d8e7ee.
- Public https://www.jamddmaj.com/fee-recipient-setup.html?v=20261027-7 serves assistant 2026.10.27.7. Actual candidate/public read-only preparation and unsigned simulation pass canonical validation, network 8,000 and total 1,496,440 lamports; signed false, submitted false. Recipient ATA not created yet. Bot remains unchanged/paused; no activation attempted.
- Deployment log query returned zero errors in preceding ten minutes. No continuous monitoring added. If actual Phantom guards differ, preserve rejection and inspect only the bounded structural summary rather than asking for signed bytes or removing protection.
