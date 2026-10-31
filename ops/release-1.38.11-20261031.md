# 1.38.11 — notification enrollment and pending UX batch

Prepared release, not yet a publication receipt. Explicit push enrollment is
available in Markets and Trade Profile → Notifications, using the existing Google
session. Permissions alone do not enroll. Users must enable/save preferences and
can disable a device or request a test notice. Enrollment expires after 30 days.

FCM credentials are production-only secrets, never shipped in static assets.
The separate VPS systemd timer calls only the protected notification dispatcher,
approximately once per minute. Data-only notices cannot execute wallet actions.
Price triggers and already-published authorized Telegram signals are deduplicated;
provider timeout may leave delivery uncertain, with retries using a stable tag.
Delivery is not guaranteed or instant; Android force-stop and OS/browser settings
can block it. No closed-phone receipt has been verified yet.

Also includes the previously committed interactive holdings chart, source-labeled
market-cap/FDV data, explicitly partial activity, send amount controls, updated
walkthrough, responsive Markets workspace and hamburger overlay fixes.

Verification: full local suite 1,207 passed / 19 skipped / zero failures (1,226).
Release Java and resource compilation succeeded. Headless browser checks passed
for Markets desktop/mobile, long holdings details, and push login/readiness guards.
The two new Node push routes have explicit fetch handlers and a separate import
gate excluding custody and wallet-signing modules. Existing Edge gate preserved.

Discover HTML/JS updated to explain enrollment and delivery limitations. Discover
CSS, refresh CSS and tour CSS reviewed: existing responsive cards and reduced-motion
behavior retained; no unrelated style change needed for notification instructions.

Production promotion, timer health, release APK verification, and actual device
receipt must be recorded before claiming those stages complete.
