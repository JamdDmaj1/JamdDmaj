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
