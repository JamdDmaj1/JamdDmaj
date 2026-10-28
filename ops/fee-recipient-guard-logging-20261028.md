# Failure-only assertion logs — 2026-10-28

User's version .7 now confirms actual additional Lighthouse instructions 6 / 26 bytes and 10 / 17 bytes. Actual log bytes and assertion values were not collected; the log-mode cause is not yet proven for that signature.

Found an actual compatibility bug: .7 accepted only log ordinals 0/1/2. Reviewed primary source https://raw.githubusercontent.com/Jac0xb/lighthouse/4c579479c98635e419b1b167f08be02a71604a71/clients/rust/src/generated/types/log_level.rs defines Borsh ordinals 4/5 as FailedPlaintextMessage/FailedEncodedMessage. These are non-mutating logging, unlike noop-CPI ordinals 3/6. New .8 admits only 0/1/2/4/5; all transaction/effects restrictions unchanged. Diagnostics now include bounded log enum number, never assertion data, signatures or full wire.

Unsigned actual mainnet simulations with 439-byte fixture, matching reported guard lengths 26/17: log 0 passed (18,286 CU), 2 passed (20,615), 4 passed (18,538), 5 passed (18,540); raw repr values 16/17 failed at Lighthouse instruction 3 with custom 6000. No signer, sendTransaction, transfer or bot activation was used. Thirty-four focused tests passed, including the exact reported lengths and rejection of 3/6/16/17/255. Actual user success remains unverified.
