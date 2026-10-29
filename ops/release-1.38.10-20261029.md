# 1.38.10 — token details visibility, published

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
Full regression: 1,183 passed, 19 skipped, zero failures (1,202 total).
Focused suite: 78 passed. Web build and protected candidate byte checks passed.
Production /api/status reports webVersion and latestVersion 1.38.10.
Deployment: dpl_5MzG9U4GsKVsv6sMYiA376pXPvWQ.
Release workflow 40964965364 succeeded, including native, SDK and launcher gates.
Release is not a draft and contains the APK and checksum. Downloaded APK hash:
c77da16983ebb0bd59b4af2ed0fa311ac9a71ff6e110ab8320a3ba80d924cf2a.
Matches published checksum; apksigner verifies permanent certificate
d4799319516f9b243b12ef4678823baed39d9203e42fa70f8de0ba0f7c0080d6.
Package com.jamddmaj.ai, versionCode 166, versionName 1.38.10.
User-phone confirmation of the token panel remains outstanding.

Discover HTML/JS reviewed and ES/EN instructions updated for the renamed action
and visible panel. Existing Discover CSS/tour CSS reviewed; no unrelated visual
changes necessary. Retains the 1.38.9 native UI-thread startup hotfix and mandatory
three-cold-launch emulator release gate. Does not claim to fix provider availability.
