# First-visit access and bot readiness — 2026-10-26

## Published

- Source ba14f9e, production deployment dpl_DEQ1pFnZ7yuEoFFHeJQzUxRLQ65a, READY and promoted.
- First visit requests Google access, then lets the user connect a wallet separately. Remembered public profiles are not verified sessions. This is onboarding, not replacement API authorization.
- Root waits for settings event handlers before opening Account. Tutorial does not override Account during onboarding.
- Authenticated candidate asset hashes verified; first-visit and receipt-alert browser regressions passed against public www.jamddmaj.com. Six focused unit tests passed. No account login, financial signing or submission performed in verification.

## Bot — NOT complete / NOT activated

- Read-only production check: all three services active, one configured account, zero active accounts, three historical swap records, zero pending swap operations. Verified backup includes swaps.
- Worker still starts with --controls --custody-setup --bot-swaps, without --platform-fees. Fee and payment stores are absent. Do not bypass activation readiness.
- Public fee recipient preflight returned PLATFORM_FEE_RECIPIENT_USDC_ACCOUNT_MISSING. User has been asked to independently review/approve recipient ATA creation at /fee-recipient-setup.html. No reply or on-chain approval was observed in this turn.
- Next: after recipient verification, take fresh before-change encrypted backup and off-host restore proof, prepare fee stores while controls remain paused and services cannot write, take fee+payment+swap inclusive backup and off-host proof, enable existing platform-fee capability flag, verify readiness with no activation. Preserve existing records, owners, limits and keys.

## Prepared operator tooling, not installed

- Recovery operator archive supports paired --fees/--payments plus optional --swaps; rejects partial pairs, duplicate flags, path aliases and non-SQLite destinations.
- Two argument tests passed; recovery suites passed 18 tests, one optional external age CLI test skipped.
- No server stores, service flags, keys, user settings or financial state changed by this turn.
