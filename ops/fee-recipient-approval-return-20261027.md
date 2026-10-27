# Recipient setup approval return — 2026-10-27

User approved Phantom but the page retained SIGNING, and recovery said no transaction was registered/sent. Independent account checks still returned missing recipient ATA. This is a pre-submission failure, not proof of a finalized creation.

The old catch/recovery lost the cause. The exact historical cause cannot be recovered from that record: review expiration, wallet message changes and loss of page focus all led to the same generic message. Tests reproduce expiration and extension focus-return timing; do not claim which caused this specific attempt without new evidence.

Changes:

- After a verified owner signature, wait at most three seconds for extension focus to return. Recheck foreground, review expiry, account and revision before the existing durable SUBMITTING record and at-most-one submit. Never submit from a hidden/unfocused page.
- Retain specific safe pre-submission failure codes in SIGNING metadata and show them on pending-result consultation. Never overwrite SUBMITTING uncertainty with a no-send claim.
- Reject altered transaction bytes exactly as before; no priority-fee instruction allowances, generic signer or arbitrary wire support added.
- Explain that the 60-second review includes time spent in Phantom. Expiration remains fail-closed; no extension, automatic re-prepare, re-sign or retry.

Verification: 16 flow/protocol/preparation tests passed, including focus-return success and unchanged wire, expired review, hidden/unfocused page, wallet changes and exact reason preserved without sends. Compiled-browser preparation test passed with mocked Phantom and intercepted API; zero prompts/submits in that browser test. Full repository suite was not rerun for this UI-only change; previous fee runtime release has its separate full-regression record.

No real signatures or sends performed by the agent. No bot activation. A live user retry is still needed to establish that this specific failure is resolved; if a changed-wallet-transaction code appears, diagnose it without bypassing wire validation.

Published source `0b52ba2` as production deployment `dpl_CjekSPaBFDko9E5rjEJpPByiQKbn` (Other framework, remote build 16 seconds), staged READY then promoted without rebuilding to www.jamddmaj.com. Authenticated candidate and public bundle SHA-256 matched local: `b43c70ca2fb90b636cbfff168da3292da3ec3867e13a8f34978603ea8ed27021`. Bounded deployment error query returned zero records. No new continuous monitoring configured.
