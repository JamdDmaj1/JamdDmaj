# 1.38.7 — account-session publication correction

Supersedes unpublished v1.38.6. Android versionCode 163, same permanent package
and signing workflow. Includes encrypted Android account-session persistence,
welcome-check feedback, current chat product/navigation help, launch animation
and the refreshed Discover. Install over the existing app; never clear data.

The v1.38.6 release was blocked by server-safety.test.mjs: the wallet-login-ui
cache version did not match packageVersion. Full local regression reproduced
exactly this one failure (1,192 tests, 1,172 passed, 19 skipped, one failure).
Corrected all release versions together, including the module URL. No release
gate was bypassed. CI reporter now exposes bounded failures in annotations.

Discover reviewed: its existing visual refresh remains accurate and included;
no new marketing claim is needed for an internal Android access-storage fix.
No bot activation, account-limit change, financial signature or transfer.

Publication is not confirmed until APK asset and permanent certificate checks.

## Publication verified

Workflow 40858422105 completed successfully (SDK verification, native wallet
verification and release). Public v1.38.7 is neither draft nor prerelease and
contains JamdDmaj-AI.apk plus its checksum. Downloaded public artifact SHA256:
89b9bce58a8aaa3df5db244a0668a63600802636815f4ef35c3687883dbe7cab.
apksigner verification succeeded; permanent certificate SHA256:
d4799319516f9b243b12ef4678823baed39d9203e42fa70f8de0ba0f7c0080d6.
aapt confirmed com.jamddmaj.ai, versionCode 163, versionName 1.38.7.

Web source d54b8a6 staged, inspected and promoted as
dpl_6p3xugUFsicGvZhEcDoL3AkaCGib. Candidate index/Discover matched source and
status reported 1.38.7. Public browser verified actionable welcome-check copy,
enabled recovery button, no account/financial POST, and retained refreshed
Discover via the legacy version URL. Public status reports webVersion 1.38.7;
bounded deployment error scan returned zero records.

81 focused tests passed on Node 24 and Node 22 after correcting the resource
version mismatch; CI ran the full regression successfully before signing.
Device installation and a real user cold-start sign-in have not been performed.
The user may need one Google sign-in after updating to seed encrypted storage;
server access still expires normally after seven days. No funds were moved.
