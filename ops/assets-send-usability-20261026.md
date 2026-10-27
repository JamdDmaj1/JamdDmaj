# Send usability follow-up — 2026-10-26

Scope: web Assets Send presentation only, not custody, signing, journal, worker or fees policy changes.

- Authenticated bot status now labels the Send identity and portfolio as a verified bot wallet; a watch address alone retains its view-only name.
- Visible wrapping token/amount/recipient labels, token-specific amount placeholder, selected-token observed balance with explicit final availability verification at review.
- 25/50/75/Max display sizing rounds down at token precision, refuses unavailable/stale/unsafe values. SOL percentage sizing retains a disclosed provisional 0.005 SOL, never presented as an exact network cost. Review remains authoritative; SPL input does not silently convert SOL or deduct a token fee.
- Reviewed breakdown shows amount, exact SOL network fee, recipient account rent, and combined total debit (separate token + SOL for SPL sends). Before review costs remain explicitly uncalculated.
- Pending-result control shown only for a known or potentially pending attempt; external-wallet IndexedDB recovery remains available after reconnect/reopen. Reviewed fields and consent are still invalidated by edits, expiry or account/session changes.
- Added scroll-safe bottom spacing and stacked mobile labels; browser regression confirms Close remains above fixed finance navigation at 390px width.

Verification: 10 focused tests passed; built mocked browser flow passed, including verified identity, SOL reserve sizing, USDC percentages and label, exact reviewed total, hidden idle pending button, unchanged explicit consent, recovery, and no overflow/page errors. No real transaction was signed or sent. Native Android keeps its existing secure screen; no APK update in this change.

Published source `f4ac6e3` as staged production `dpl_4jW1Roz9vmYYZL7XaikkMqSGRsP1`, candidate `https://jamd-dmaj-qoeqr1azi-jamd-dmaj-s-projects.vercel.app`, READY and promoted without rebuilding. Authenticated candidate and public Assets bundle both matched local SHA-256 `a2f448d843eff950fb785d737d7a3c62c460f013fc97d8f45c7f1c1e644476e0` (public HTTP 200). Expanded mocked browser regression passed against `https://www.jamddmaj.com` after promotion. Deployment error query for the preceding ten minutes returned zero records. No server, account settings, wallet funds or bot activation changes.
