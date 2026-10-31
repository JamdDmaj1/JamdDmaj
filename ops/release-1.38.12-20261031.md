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

## APK and client diagnosis follow-up

Workflow 41211595526 completed successfully. Release v1.38.12 is not a draft and
contains JamdDmaj-AI.apk plus checksum. Download verified SHA-256:
`2cc8a98879aabf66c48a4dd4ab6a4baf386f8bdd10c1d878ab65829887c6c783`.
Permanent signing certificate remains
`d4799319516f9b243b12ef4678823baed39d9203e42fa70f8de0ba0f7c0080d6`.
APK identity: com.jamddmaj.ai / versionCode 168 / versionName 1.38.12.

User's Brave registration failed before preference saving. Bounded stage codes
were published in dpl_D1PVuc2AJh5gbx2BT6T7bd3sR45U, and user confirmed
PUSH_DEVICE_REGISTRATION. An independent fresh browser reproduced a PushManager
AbortError (push service unavailable), not an account or server failure. This does
not prove the exact user's browser configuration. Asked user to check Brave's
documented Google push service setting, without disabling other protections.
Actual closed-app receipt remains unverified; goal is not complete.

Follow-up client mapping distinguishes that AbortError without displaying raw
provider errors. Update feed also selects highest non-draft/non-prerelease APK
version so an older release workflow finishing later cannot downgrade discovery.
Discover HTML/JS/CSS/tour reviewed; existing push diagnostic instructions remain
accurate. These web-only follow-ups do not change the native wallet or keys.

Latest web promotion: `dpl_9KShp29YUpLtdopo7pZ49PGS2bAP` (source e1adb46),
including browser-service error mapping and highest-version update feed. Both
webVersion and latestVersion now report 1.38.12. User subsequently reported
"Test scheduled" after the Brave setup instructions: authenticated enrollment and
test scheduling succeeded. Closed-tab/system notification receipt still awaits
the user's report. Worker logs now include only aggregate processed/accepted
counts, never targets, accounts, message content or provider credentials.

## Closed-tab receipt confirmed by user

User answered "si ya llego" to the explicit question asking whether the system
notification titled JamdDmaj arrived after closing the JamdDmaj tab and waiting.
This confirms real end-to-end delivery in Brave with the web tab closed.
It does not establish receipt on the user's Android handset: the Android APK is
published, signature-verified and passed native/emulator gates, but its hardware
push receipt must not be represented as tested. Price/signal trigger selection
has isolated tests; the receipt check used the explicitly requested test notice.
