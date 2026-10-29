# Android account session persistence — 2026-10-28

## Change

The account profile was persistent but the opaque Google-linked access session
was held only in sessionStorage. Cold WebView starts could lose it. No server
single-device restriction was found: issuing a new session does not revoke other
sessions. The free allowance remains account-scoped.

Added an Android-only AccountSession bridge, registered in MainActivity. It
stores only the opaque account-access token encrypted with AES-GCM and an
AndroidKeyStore key. Access is restricted to the bundled https://localhost main
page, bounded to seven days, with no wallet keys, plaintext persistence fallback,
automatic renewal or financial action. Restored access must still pass the
existing server identity check. Older builds without the plugin fail closed.

The welcome check now displays progress and actionable recovery/network copy,
and recovers from verification exceptions without leaving the button disabled.
Native restoration is awaited before checking; a ready event handles module
startup ordering. Fresh explicit sign-in wins over delayed restoration.

## Verification

Android :app:compileDebugJavaWithJavac succeeded. Focused tests cover restoration,
concurrent login, plugin unavailability, two concurrent server sessions, welcome
check progress/error recovery, identity validation and the account-scoped quota.
No device installation, live Google authentication, transaction or bot activation
was performed. Real cold-start behavior still needs verification on the updated
Android build. This is source work, not a published Android update.

Discover HTML/JS/CSS/tour styles were reviewed: this internal session-storage
fix adds no new public capability, so no marketing or visual change is needed.
Existing account/permission descriptions remain accurate.
