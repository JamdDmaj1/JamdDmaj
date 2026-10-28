# Bot activation verification — 2026-10-28

Scope: complete and verify adjustable owner-approved activation, without changing production limits or activating real accounts. Not proof of trading execution or profitability.

## Current evidence

- Production HTTPS `/health` returned 200, mode `execute`, executionAvailable true, custodyProvisioningAvailable true, tradingEnabled false. Worker, web and HTTPS services are running. The first service check used the nonexistent `jamddmaj-perps.service`; checking the actual `jamddmaj-perps-worker.service` confirmed active/running.
- Production read-only SQLite query confirmed enabled 0, paused 1, SETTINGS_CHANGED; saved capital 10, margin 10, loss 5, leverage 3, one position, five daily trades, Telegram exits. No production settings or approvals were written. This configuration cannot admit a first 10.02-USDC margin-plus-fee reservation. Do not increase the customer's risk settings automatically.
- Public fee recipient setup GET returned 200, ok true. Prior successful owner-authenticated review and finalized recipient setup are recorded in first-visit-bot-final-audit-20261028.md.
- Extended the compiled browser regression to exercise both unchecked consents, explicit synthetic activation, active-state rendering and explicit pause. The browser fixture intercepts every executor request, never forwards one to production, and rejects unknown actions. Passed locally and against the actual published page.
- Combined public-browser, authenticated API, durable controls, client and panel suite: 58 passed, zero failed/skipped. Includes user-editable save/pause, incompatible-limit explanation, exact fee disclosure, ownership rejection, one-use approvals, expiry, stale settings, lost-response handling and pause.
- Actual runtime activation-authorizer fixture with verified backup and reconciled budget: one passed, zero failed/skipped. Test-only temporary data, no real signature or financial submission.
- `git diff --check` passed; only existing line-ending warnings. Welcome redesign and unrelated platform changes remain outside this activation task.

## Completion boundary

The existing published activation flow is available and verified; no application deployment is required for this test-only addition. A customer must independently choose compatible limits, save them, review current server evidence and explicitly accept both trading and fee terms. Current low limits remaining paused is correct, not permission to bypass them. No real bot activation, transaction, deposit, fee payment or modified risk limit was performed during this verification.
