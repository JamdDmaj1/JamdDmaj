# Send usability follow-up — 2026-10-26

Scope: web Assets Send presentation only, not custody, signing, journal, worker or fees policy changes.

- Authenticated bot status now labels the Send identity and portfolio as a verified bot wallet; a watch address alone retains its view-only name.
- Visible wrapping token/amount/recipient labels, token-specific amount placeholder, selected-token observed balance with explicit final availability verification at review.
- 25/50/75/Max display sizing rounds down at token precision, refuses unavailable/stale/unsafe values. SOL percentage sizing retains a disclosed provisional 0.005 SOL, never presented as an exact network cost. Review remains authoritative; SPL input does not silently convert SOL or deduct a token fee.
- Reviewed breakdown shows amount, exact SOL network fee, recipient account rent, and combined total debit (separate token + SOL for SPL sends). Before review costs remain explicitly uncalculated.
- Pending-result control shown only for a known or potentially pending attempt; external-wallet IndexedDB recovery remains available after reconnect/reopen. Reviewed fields and consent are still invalidated by edits, expiry or account/session changes.
- Added scroll-safe bottom spacing and stacked mobile labels; browser regression confirms Close remains above fixed finance navigation at 390px width.

Verification: 10 focused tests passed; built mocked browser flow passed, including verified identity, SOL reserve sizing, USDC percentages and label, exact reviewed total, hidden idle pending button, unchanged explicit consent, recovery, and no overflow/page errors. No real transaction was signed or sent. Native Android keeps its existing secure screen; no APK update in this change.

Deployment evidence follows after publication.
