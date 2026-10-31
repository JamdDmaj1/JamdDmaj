# 1.38.12 — delayed closed-app test

Follows the 1.38.11 implementation with a test notice scheduled at least fifteen
seconds ahead, dispatched by the minute worker. This lets users close the app
before the notice is delivered. The UI says scheduled, not received or delivered.
Scheduled tests are rate-limited and expire after three minutes if not processed.
No wallet actions. Includes the notification and UX batch documented in 1.38.11.
Discover HTML cache key updated; JS instructions and existing responsive/reduced-
motion CSS reviewed and retained. Final publication receipts pending below.

## Web and worker receipt

Production web promoted to `dpl_6fTSWjZfWFYYCqcZo1AUYq5ARTpU`, source
`0ff488fd144a3dceac3a31faa6ccd237fee8dfe3`. `/api/status` reports web 1.38.12.
Main HTML, Discover HTML/JS, FCM worker and web transport content match the local
build after normalizing Git/Windows line endings. Unauthenticated subscription
access returns HTTP 401 / PUSH_LOGIN with no account data. Security headers remain.

Installed and enabled only `jamddmaj-push-dispatch.timer` on the VPS. Its isolated
oneshot receives its worker-only credential via systemd LoadCredential, with no
wallet directories accessible. Three minute-spaced invocations returned HTTP 200.
No user registration or notification receipt has been asserted from those checks.
User has been asked to enroll explicitly and test closed-app receipt.

Android signed-release workflow 41211595526: native, SDK and three-cold-launch
emulator gates passed; final release packaging is still running at this record.
