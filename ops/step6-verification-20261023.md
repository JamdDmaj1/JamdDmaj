# Step 6 verification — 2026-10-23 (America/New_York)

**Acceptance on October 23: BLOCKED, not approved for real futures or automation.**

October 24 follow-up: the missing web-close implementation and unfunded tests
are recorded in [the follow-up report](step6-web-close-verification-20261024.md).
This original report preserves the evidence from October 23; the public release
and real execution are not enabled by either report.

Story: selected wallet and authenticated manual limits → explicit review/signing
→ durable one-attempt submission → finalized recovery → usable complete exit.
Tests below use deterministic unfunded fixture keys and simulated financial
transports. Production checks never request a signature or send funds.

## Evidence

| Boundary | Result | Evidence |
| --- | --- | --- |
| Real Google session → manual policy API | Confirmed by user | Public UI returned “This wallet has no manual limits yet. Complete and confirm the fields. Web execution is still disabled.” No policy was saved for this check. |
| Main perps regression suite | Passed with explicit platform skips | 611 cases: 603 pass, 0 fail, 8 skipped on Windows. Log: `.perps-build/step6-perps-verification-20261023.log`. |
| Linux runtime, initializer, backup and checkpoint checks | Passed | 37/37 in an isolated DynamicUser/PrivateNetwork unit. This covers seven Linux-only skips from the main suite. Optional external age CLI interoperability was not run; SDK encryption and recovery were tested. |
| Manual service/process lifecycle | Passed | 6/6 Linux cases, including SIGTERM drain, process restart, retained policy, crash-stale lease refusal, real HTTP relay, shutdown during authentication and single-flight recovery. No custody directory is opened by this service. |
| Real browser persistence | Passed | Real Edge IndexedDB retained a deterministic fixture `SUBMISSION_UNCERTAIN` signature after reload, offline mode, wallet-session clearing and a fresh browser process with the same **isolated fixture profile**. Repeated claim rejected; financial requests observed: zero. No real user browser profile was accessed. |
| Android native validation | Passed on Linux | Initial Windows run: 135 cases, 14 AccessDenied failures at `WalletStorageBarrier.syncParents`. The same compiled native classes/resources then ran in offline Linux Robolectric: **135/135 passed**. No storage barrier was bypassed or weakened. |
| Production restart/persistence | Passed | Explicit web service restart, then maintenance worker restart and dependent web/TLS startup. Checksums and integrity of controls, risk, web submissions and manual policy were unchanged. Active bot accounts: 0; reservations: 0; web submissions: 0. |
| Full public Phantom close | **Blocked** | The public selected-wallet panel lists positions but exposes no external close review/sign/submission action. The manual HTTP boundary exposes policy, entry review and entry submission only. Custody close primitives do not constitute a Phantom web exit. |

## Production state comparison

Read-only comparison helper: `scripts/inspect-perps-step6-state.mjs`. It outputs
checksums/counts only, excluding transient request quotas. It never opens custody
keys or prints addresses, account rows, policy values or transaction bytes.

- Controls: `8ff620251fafeb383eb1820009e02d9638a9d8d835920311ac0b157966122228`
- Shared risk: `aebbe046c216c9b3e47c31a3bdf6efb005f702e2ea8de431a4befb320328730a`
- Web journal: `b2fd68d952e218ae0fdb4453803ac21cf326815405d4a6dfbe4c53c585a3bb3a`
- Manual policy: `308851d3060e7c17d1f537bcc018f9377835939d5fccea1d00a9473c1298bd21`

These match before/after the controlled restart. All three services returned
active. Public health continued to return `tradingEnabled:false` and
`executionAvailable:false`. No activation or financial database reset occurred.

## Native Linux provenance

Only compiled test/application classes, dependency jars and generated Android
test resources were copied. No wallet data, environment files, release signing
credentials, Google session or recovery identity was packaged.

- Native fixture archive SHA-256:
  `70ec25ebd56cdc3c4633a053a0ac449e3e11fe737f4e1dc5edea73a49eb33b3e`
- Official Temurin JRE 21.0.13+9 Linux x64, download checksum verified:
  `a535a1df9c6284d9618872984e026ae0352d1f7e9e0605425c0e6114f47351dd`
- Isolated unit: `jamddmaj-step6-native-all-20261023`, PrivateNetwork,
  ProtectHome, ProtectSystem=strict, MemoryMax=448M, CPUQuota=75%.
- JUnit result: `OK (135 tests)`, 27.893 seconds. This is not a test on the
  operator's actual installed phone or a funded trading acceptance.

## Blocking follow-up

Return to the incomplete web portion of step 2 before approving step 6:

1. Selected Phantom position → exact, account-bound full-close review.
2. Separate explicit owner approval and private durable signature/submission
   binding, with the same one-attempt uncertainty rules as entries.
3. Finalized actual payout recovery and, where required, separately approved
   USDC conversion with a protected minimum and complete fee accounting.
4. Browser/server restart, disconnection and uncertain first/second-leg tests
   covering that **actual web** lifecycle, not only custody/native primitives.

No funded provider approval was requested. No trade, close, conversion, bot
activation or release step 7 was performed. Passing the completed subflow tests
does not remove this acceptance blocker.
