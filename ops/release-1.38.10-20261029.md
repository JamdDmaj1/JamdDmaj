# 1.38.10 — token details visibility, publication pending

User sees token information/chart buttons but no apparent action. Code inspection
showed the details section appended after the entire holdings list, with no
focus or scroll into view. A long list hides opened/loading/error content far
below the selected token. This is a placement failure, not proof of missing data.

Fix: keep the details section before the holdings list, expose/focus/scroll it
immediately, retain visible loading and failure states, and return focus/scroll
to the originating token on Close. Native localhost and capacitor contexts use
the public read-only research endpoint even if the convenience platform helper
is absent. No wallet authority, credentials, swap, send or funds change.

Token rows now have a compact View chart action with a full-row click target
and descriptive accessible name. Source timestamp uses a readable local format.
Hidden sections are explicitly hidden despite card styling; the details panel
has a clear border, source/risk copy, and a bounded chart.

Verification: 7 focused tests passed. Browser integration with 51 synthetic
holdings at 390px: clicking last token scrolls/focuses visible panel, candles
render, Close returns to source, network failure remains visible, no horizontal
overflow or JavaScript errors. No user wallet access or transactions during QA.
Full regression, deployment and signed APK verification pending.

Discover HTML/JS reviewed and ES/EN instructions updated for the renamed action
and visible panel. Existing Discover CSS/tour CSS reviewed; no unrelated visual
changes necessary. Retains the 1.38.9 native UI-thread startup hotfix and mandatory
three-cold-launch emulator release gate. Does not claim to fix provider availability.
