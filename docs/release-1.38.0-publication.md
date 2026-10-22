# 1.38.0 publication evidence — 2026-10-22

User requested publication of completed work, not further feature development.
Uncommitted close-return experimentation and unrelated dirty files were excluded
using a committed-source archive. Release source is commit
`251049b8918b594c89e7709c4133ed8a6338fe37`, tag `v1.38.0`, Android versionCode 156.

## Web: published

Project verified: `jamd-dmaj-s-projects/jamd-dmaj`,
`prj_MDNgTRQMQhZHy0Np4HuKiqTKbsjd`.
Production deployment `dpl_7etCJQ3TM8jj8Pc9ofYb2RauL22M` was staged, tested,
and promoted successfully to the public domains.

- https://www.jamddmaj.com/api/status returned HTTP 200 and webVersion 1.38.0.
- Public recovery module and finance HTML returned HTTP 200.
- Actual Edge/Playwright mobile viewport 390x844 opened the public Futures route,
  displayed the recovery button and recorded zero pageerror events.
- Invalid operation-status POST returned INVALID_STATUS_QUERY rather than
  leaking internal state.

The initial staged build failed in Vercel NFT static analysis of the guarded
BigInt fee expression. Explicit BigInt conversions fixed tracing without
changing arithmetic. Both Perps review routes then traced successfully, and
six targeted fee/funding tests passed. The clean archive full-suite run had
872 passed, seven platform skips and two funding test failures caused by CRLF
imports in the VM harness; newline normalization fixed those two on rerun.
This does not claim a subsequent full-suite all-green local run.

The staged deployment's sourceCommit metadata refers to the initial release
stamp 529c01e; the uploaded source also includes the two reviewed fixes committed
as 251049b. Temporary deployment configuration excludes local environment files,
native trees and tests. No environment credentials were printed or committed.

## Android: release pipeline started, not yet published

https://github.com/JamdDmaj1/JamdDmaj/actions/runs/39862536906

At the last observation both native-wallet and SDK gates were still running.
No APK availability, successful release or in-app update is claimed here.
The release workflow must complete and the non-draft release must contain
JamdDmaj-AI.apk before Android can be declared published.

## Unchanged limitations

No production VPS worker/schema/custody migration or bot activation occurred.
The web status relay exists, but the corresponding installed VPS route and
persistent web journal still require reviewed installation. Web owner signing,
submission, full close execution and 24/7 acceptance are incomplete and remain
disabled. This release does not make real Futures trading available.
