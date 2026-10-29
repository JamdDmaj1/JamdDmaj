# 1.38.9 — launcher crash hotfix, verification pending

## Reproduction and cause

User reported that installed 1.38.8 immediately closes. No phone connected to
ADB; device model/Android version not yet supplied. Did not uninstall, install
on the phone, clear data, request wallet secrets or perform a transaction.

Exact public 1.38.8 APK SHA256 907cfb9d820e6d258d5a03b5ac79fa40a52695e12cd70f365a4f1cb422c8c50b
was installed in a disposable API 30 emulator. Runs 40954857447 and 40957046991
reproduced termination on the first cold start. Full annotation in 40957046991:
`AccountSessionPlugin.restore` → `trusted` → `WebView.getUrl`, on
`CapacitorPlugins` rather than the main looper, caused a RuntimeException wrapped
by InvocationTargetException in Capacitor's plugin dispatcher.

An initial local Robolectric launcher probe failed due to its unsupported real
ServiceWorkerController/WebView provider; it was removed, not used as proof of
the device bug. Early CI attempts had environment/annotation limits; the API 30
published-APK failure above is the authoritative reproduction.

## Fix and data preservation

All AccountSession save/restore/clear entry points now dispatch to the activity's
UI thread before checking the current trusted WebView URL. Exceptions reject
the call rather than escape the dispatcher. The existing AndroidKeyStore alias,
preferences name, AES-GCM/AAD format and expiry policy remain unchanged. No
plaintext fallback, new wallet, credential migration or reset is introduced.

Release now requires a real cold-launch emulator gate, in addition to existing
SDK/native checks. The smoke gate uses an isolated preview identity compiled
from the same production launcher source, no account login or wallet import,
and three process restarts with crash-buffer/PID evidence. Failure annotations
are bounded and contain only the fresh emulator's crash, never user data.

Node regression checks for UI dispatch/data-format invariants and multi-device
session persistence: 5 passed. Actual candidate emulator gate and signed release
verification remain pending; do not claim fixed publication before they finish.

Discover HTML/JS/CSS and tour CSS reviewed. This is a native threading hotfix
plus matching web/version cache identifiers, with no new product feature or
readiness claim; no Discover content change is appropriate.
