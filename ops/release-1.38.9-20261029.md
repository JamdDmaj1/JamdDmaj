# 1.38.9 — launcher crash hotfix, publication verified

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
session persistence: 5 passed. Final focused checks: 76 passed. Full local suite:
1201 tests, 1182 passed, 19 skipped, zero failures. Native compilation succeeded.

## Verified publication

- Source `ce49995`, tag `v1.38.9` (no retagging). Candidate launcher check
  40958131820 passed all three cold starts in the same API 30 emulator setup
  that terminated on the published 1.38.8.
- Release workflow 40959234492 succeeded; all three prerequisite SDK, native
  and launcher jobs passed, followed by signed release construction.
- Non-draft release https://github.com/JamdDmaj1/JamdDmaj/releases/tag/v1.38.9
  contains JamdDmaj-AI.apk and its checksum. Downloaded public artifact SHA256:
  `42f79787ab96c9f09c7affd5bbe641f2ccacb746632395431f807c242e4ef50d`.
  apksigner verified unchanged certificate SHA256
  `d4799319516f9b243b12ef4678823baed39d9203e42fa70f8de0ba0f7c0080d6`.
  aapt confirms com.jamddmaj.ai, code 165, name 1.38.9. Public binary DEX
  contains restoreOnUiThread and the UI-thread guard, not only source changes.
- Web production `dpl_6VjRgXqCTS6wqQ4DFThfZmftCqw2`, staged at
  https://jamd-dmaj-jktg7g7cv-jamd-dmaj-s-projects.vercel.app then promoted to
  https://www.jamddmaj.com after deployed byte/version and live token API checks.
  Public browser verifies main welcome and current Discover via old query URL;
  no JavaScript errors. Bounded runtime log scan returned zero error records.
  Public status confirms web/Android both 1.38.9 and exact new APK link.
- User phone not connected, no device installation or data modification.
  Install above the existing app without uninstalling/clearing data. Final
  user-device launch confirmation remains pending.

Discover HTML/JS/CSS and tour CSS reviewed. This is a native threading hotfix
plus matching web/version cache identifiers, with no new product feature or
readiness claim; no Discover content change is appropriate.
