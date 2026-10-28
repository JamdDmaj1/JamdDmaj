# Pre-activation budget explanation — 2026-10-28

Actual user authenticated review succeeded after recipient ATA creation, but its capital 10, margin 10 and daily loss 5 cannot admit an entry under the existing full-margin-plus-platform-fee reservation policy. Do not raise limits automatically or ask for a deposit to fix this configuration contradiction.

Control panel now compares reviewed settings to the exact integer margin-plus-fee lower bound. Incompatible capital and daily loss fields are marked and explained together. Review confirmation is discarded/disabled; saved controls and typed values remain untouched. The message describes an empty-account lower bound, not live risk/balance readiness. User can save chosen limits and request a fresh owner-bound review. Server risk/fee/activation policy is unchanged.

Focused tests: 35 passed, including actual 10/10/5 and exact 10.02 boundary, no save/activate side effects. Compiled browser test covers editable custom limits, save/pause, actual contradictory settings, both explanatory fields, compatible boundary and separate unchecked consents, using synthetic session/API/wallet only. The prior browser fixture needed first-visit acknowledgement and canonical fee-service status; both were added to the fixture, not bypassed in application code. No production activation or fund movement.
