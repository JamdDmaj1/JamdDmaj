# Failure-only assertion logs — 2026-10-28

User's version .7 now confirms actual additional Lighthouse instructions 6 / 26 bytes and 10 / 17 bytes. Actual log bytes and assertion values were not collected; the log-mode cause is not yet proven for that signature.

Found an actual compatibility bug: .7 accepted only log ordinals 0/1/2. Reviewed primary source https://raw.githubusercontent.com/Jac0xb/lighthouse/4c579479c98635e419b1b167f08be02a71604a71/clients/rust/src/generated/types/log_level.rs defines Borsh ordinals 4/5 as FailedPlaintextMessage/FailedEncodedMessage. These are non-mutating logging, unlike noop-CPI ordinals 3/6. New .8 admits only 0/1/2/4/5; all transaction/effects restrictions unchanged. Diagnostics now include bounded log enum number, never assertion data, signatures or full wire.

Unsigned actual mainnet simulations with 439-byte fixture, matching reported guard lengths 26/17: log 0 passed (18,286 CU), 2 passed (20,615), 4 passed (18,538), 5 passed (18,540); raw repr values 16/17 failed at Lighthouse instruction 3 with custom 6000. No signer, sendTransaction, transfer or bot activation was used. Thirty-four focused tests passed, including the exact reported lengths and rejection of 3/6/16/17/255. Actual user success remains unverified.

Also reviewed KnownProgram enum from the same pinned source: nine unit variants encoded as 0..8. Accept bounded AccountInfo KnownOwner assertions (field 3), still only on the two fixed targets, no new account/program/effect. The 26-byte fixture passes using either Executable(false) or KnownOwner(System). No data-hash/variable-length assertion support was added.

## Publication verified

- Logging change full suite: 1,164 total, 1,145 passed, 19 skipped, zero failures; 283 seconds. Final KnownOwner addition subsequently passed all 34 focused tests and the rebuilt compiled-browser preparation test. No financial signatures/submissions during verification.
- Source e999519. Confirmed intended Vercel project/team, exported committed source only. READY production dpl_DifFP69qfS3JXrUSd7AzUouwjbod (Other framework, six-second build) was checked and promoted without rebuilding.
- Candidate and public versioned assets equal local compiled output: HTML LF-normalized SHA256 27fedc73be96725e5418009068596e8b7228b3395f7a86991ddd6035f66eb14d; JS eac32e444374ed1d3f7c59cd215d302089a4c223b58f27bafaa50e7e44b955ee.
- Public https://www.jamddmaj.com/fee-recipient-setup.html?v=20261027-8 serves .8. Candidate/public read-only preparation passed canonical validation and unsigned simulation: network 8,000 lamports, total 1,496,440; signed false, submitted false. Actual recipient account still absent. User's next actual approval remains unverified; no bot activation attempted.
- Bounded deployment error query returned zero records in preceding ten minutes. No continuous monitor added.
