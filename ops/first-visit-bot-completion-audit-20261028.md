# First visit / production bot configuration audit — 2026-10-28

Objective retained: explicit first-visit access and removal of production bot setup blocker; verify review/activation without activating accounts or moving funds in production verification.

## Current authoritative evidence

- Public GET /api/fee-recipient-setup: HTTP 200, ok true, FEE_RECIPIENT_USDC_ALREADY_EXISTS; canonical operator 4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr and ATA AKyJkfAEqmPMCbKRFmtdYzkHry3oJjPxtZFathpSwKNL. User independently approved creation and supplied finalized UI result. Agent did not sign or send it.
- VPS worker/web/HTTPS all active. Existing operator-only readiness probe, run with private service identity and 0700 StateDirectoryMode, returned accounts 1, activeAccounts 0, code READY, dueUnits 0, paidUnits 0, pendingCount 0, backupFeesIncluded true, signerAvailable false, activationRequested false. Previous missing-recipient blocker is gone.
- Fresh public browser check scripts/check-first-visit-access.mjs against https://www.jamddmaj.com passed: new Finance visitor sees modal, Google action navigates to actual Account settings, unverified session is not acknowledged. API routes intercepted; no real login or wallet authorization. Four first-visit tests passed.
- Fresh focused session/control/API regression: 29 passed, zero failures. Covers authenticated ownership, fee disclosure/consent, temporary-store explicit activation/replay/race/risk rejection and pause. These are isolated fixtures, not proof of actual live trading or production activation.
- User's actual authenticated review now displays settings and correct fee terms: capital 10, margin 10, leverage 3, one position, five trades/day, daily loss 5, Telegram exits, disable on loss; fee 0.02 USDC, total 10.02 USDC. This proves the actual review path, not readiness of the chosen limits.

## Remaining user decision — do not bypass or auto-change

Actual settings reported by the user are incompatible with the existing conservative risk policy. perps-automation-controls.js activationBudget reserves the full margin, so a daily loss allowance 5 cannot admit a first margin 10. perps-execution-journal.js reserveEntry includes margin plus platform fee in capital and daily risk checks, so even an otherwise empty account requires 10.02 for a 10 margin, before other allocations/losses. Do not suggest the review itself means trading can proceed, do not raise these limits automatically, and do not ask for more deposits to fix a configuration contradiction.

Technical fee setup and actual review succeeded. Full objective completion remains unproven pending the user's decision on compatible custom limits and verification of that review; production remains paused. No new deployment or production mutation was needed for this audit. No activation, fee payment, transfer or live financial signature initiated.
