# Native Android device verification preparation

Scope: verify packaging of the native full-close, orphan TP/SL cancellation and
protected post-close USDC conversion work, and prepare a separately installed
device test package. Financial source baseline: `54cad57`; preceding source
checkpoints: `d0d17d2` and `d2b0aee`. No source publication or production activation
is part of this checkpoint.

The user explicitly chose **prepare files only; do not install**. No install,
instrumentation execution, production-app modification, data deletion, wallet
unlock, biometric approval, financial signature or transaction submission was
performed. A connected CPH2451 Android was observed read-only before that
decision; its availability is not evidence that acceptance tests ran.

## Completed checks

- Full `npm test`: 998 discovered, **982 passed**, **16 skipped**, zero failures.
  Log: `.perps-build/native-release-full-node-tests.log`. Skips include opt-in
  real-browser, Linux CLI/initialization, age interoperability and checkpoint
  checks unavailable in this local invocation. They are not counted as passes.
- Two new audit build/fixture-guard tests passed separately:
  `node --test tests/wallet-device-audit.test.mjs`.
- Web assets rebuilt and copied into Android. No plugin synchronization or
  overwrite of the pre-existing dirty Gradle/iOS files was staged.
- Gradle assembled `walletAudit` and its instrumented test APK using
  `-PwalletDeviceTestBuildType=walletAudit`. Final build succeeded; log:
  `.perps-build/native-device-audit-build-final.log`. An initial test compilation
  used the wrong accessibility constant; it was corrected to the documented
  AccessibilityAction API before the successful build. No test was weakened.
- Final APK and merged/binary manifest checked by
  `scripts/check-wallet-device-audit.mjs`: distinct application ID
  `com.jamddmaj.ai.walletaudit`, version `1.38.1-walletaudit` / 157; no Internet,
  audio or notification permission; no VIEW/BROWSABLE OAuth callbacks;
  allowBackup=false and cleartext=false. The native wallet remains non-exported
  in `:native_wallet`.
- Both APKs verify with APK Signature Scheme v2 and the same **local debug**
  certificate SHA-256:
  `55ee5c6aef0a5258d6342ad12e39eb0914f0441f939b3cad590feba184964b4a`.
  This is not the permanent production certificate and is never presented as an
  update to an existing production install.
- The test APK's packaged instrumentation targets only
  `com.jamddmaj.ai.walletaudit`. Its setup refuses any other application ID or
  Internet permission before each test. Its records use a fresh private test
  directory and disposable synthetic identifiers; no real wallet profile is
  created or read. SDK signature fixtures are explicitly non-transaction bytes.

## Prepared files

Directory:
`C:/Users/JamdDmaj/Desktop/jamddmaj-trading-release/.perps-build/android-offline-audit-20261024/`

| File | SHA-256 |
| --- | --- |
| JamdDmaj-Offline-Checks.apk | e777c827b2e8dbbae1b704414ca559b0475df5c36dacd5c6a12c2378c13e9710 |
| JamdDmaj-Offline-Checks-tests.apk | 73a94ec1efd7fe70a33fb72ad5a6725fb0f6c95ece01f9bd2afef6bb5a2dbb42 |

The directory also contains the manifest, public signature reports, checksum
list and Spanish safety notes. An archive with the same contents is prepared
alongside it. No app version/release tag, website, server configuration,
production signing credential or bot setting was changed.

## Still pending — do not report device or trading acceptance

1. Explicit later authorization to install/run the separate offline test app.
2. Execute its four device tests: packaged isolation, actual native SDK linkage,
   Android durable journal behavior and locked native Futures actions.
3. Separately verify real strong-biometric approval/cancellation, rotation and
   re-entry without accessing or moving a funded wallet during these checks.
4. Review the remaining production first-party API/deployment boundary and
   prepare a new permanently signed version through the existing release path.
5. Physical/funded acceptance and enabling real automation remain distinct
   decisions; this offline APK cannot contact any financial service.

## Subsequent explicitly authorized device run

The user subsequently answered yes to installing the separate verification app.
This supersedes the earlier prepare-only choice for this installation/test run;
the historical preparation report above remains unchanged.

Both previously recorded APK hashes were checked again before installation.
The connected CPH2451 was authorized for ADB, and neither exact audit package
was already installed. Only `com.jamddmaj.ai.walletaudit` and its separate
`com.jamddmaj.ai.walletaudit.test` package were installed, without replacement,
uninstall, data clearing or modification of any production package.

The packaged, class-filtered AndroidJUnitRunner ran the four tests on the
physical device and returned **OK (4 tests)**, with zero failures:

- Actual Android private-file durability: an UNKNOWN synthetic journal entry
  survived a new journal instance and blocked another operation.
- The packaged native SDK loaded, derived deterministic disposable identities
  and verified a signature over explicitly non-transaction fixture text.
- Installed manifest/process checks verified no networking, no backup, private
  native wallet process and absence of OAuth callbacks.
- Locked native full-close/cancellation/conversion/receipt controls were
  reachable on the physical screen without creating a wallet or authorization.

Evidence: `.perps-build/native-device-acceptance-20261024.log`, instrumentation
duration 1.331 seconds. Only this exact test class was selected; the unused
template instrumentation class was not run. The harmless synthetic journal
record remains inside the audit app's own private test directory.

No real wallet was imported, unlocked, read or signed with; no financial network
call or transaction was sent. The offline app remains installed separately.
Strong-biometric approval/cancellation, rotation/re-entry and funded trading
acceptance are **still pending**. These four successful tests do not prove those
later boundaries and do not activate real trading, the bot or publication.
