# Pre-activation budget explanation — 2026-10-28

Actual user authenticated review succeeded after recipient ATA creation, but its capital 10, margin 10 and daily loss 5 cannot admit an entry under the existing full-margin-plus-platform-fee reservation policy. Do not raise limits automatically or ask for a deposit to fix this configuration contradiction.

Control panel now compares reviewed settings to the exact integer margin-plus-fee lower bound. Incompatible capital and daily loss fields are marked and explained together. Review confirmation is discarded/disabled; saved controls and typed values remain untouched. The message describes an empty-account lower bound, not live risk/balance readiness. User can save chosen limits and request a fresh owner-bound review. Server risk/fee/activation policy is unchanged.

Focused tests: 35 passed, including actual 10/10/5 and exact 10.02 boundary, no save/activate side effects. Compiled browser test covers editable custom limits, save/pause, actual contradictory settings, both explanatory fields, compatible boundary and separate unchecked consents, using synthetic session/API/wallet only. The prior browser fixture needed first-visit acknowledgement and canonical fee-service status; both were added to the fixture, not bypassed in application code. No production activation or fund movement.

## Published and checked

- Source 5a7a951; full suite 1,166 total, 1,147 passed, 19 skipped, zero failures; 246 seconds. Browser assertions subsequently passed after repairing outdated fixture setup. No production code changed after that full suite.
- Correct project/team confirmed; READY production dpl_7vAAqVhTA3Q5sMSKAGhEqbGCknxM (Other framework, nine-second build) staged, checked and promoted without rebuilding.
- Authenticated candidate panel and public panel equal local output (LF-normalized SHA256 8d0bb7826e68363737571a91011a67842732457886ec196325324351434e85b3); candidate Finance HTML matches 2442db8acf94dfa6fed7b91d8f1d87ea1dc59e18ff1b0d0252bcbe83fd702600.
- Browser regression passed against public https://www.jamddmaj.com with synthetic financial endpoints only: actual contradictory configuration displays both fields and cannot activate; compatible configuration returns a review but neither consent is preselected. No production save/pause/activate/financial call was sent by the regression.
- First-visit onboarding/public checks and actual production readiness from the preceding audit remain relevant; user decision on custom capital/daily loss remains outstanding. Do not adjust stored production limits or regard the goal as verified live activation.
