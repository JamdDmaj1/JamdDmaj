# Bot fee runtime preparation — 2026-10-27 UTC

## Scope

Resolve the production bot configuration blocker while preserving paused controls and existing custody, limits and operation history. No activation, signatures or financial submissions in production tests.

## Installed

- Fresh encrypted pre-change archive SHA-256 `4d44c7524fb936e6edfc784b2a56d6f42d6bd86a72b88fb1bcf7b0bd1196b85f`; restored in private off-host quarantine and operator proof accepted.
- Operator-only `preparePausedPerpsFeeStores` takes the worker lease and locks existing controls, journal and swaps. Requires all accounts paused, no open/pending financial operations, fresh branded swap-inclusive recovery proof, absent output stores and strict private canonical paths. Never overwrites partial stores, changes controls or reads custody keys. Six tests passed on Windows and isolated Linux.
- Empty private fees.sqlite and payments.sqlite created using existing exact-schema libraries. New fee-inclusive archive SHA-256 `640a5ec7cf7a98f2239f1e037edb5abf1c3efd68a13170b3ba3deeff0d5a1db3`; off-host quarantined restore verified and proof accepted. Recovery files remain outside repository in the existing private operator recovery area.
- DynamicUser disappeared during service stop, so an initial proof ownership command failed and verification did not run. All services were restarted, exact proof ownership corrected under the now-live service identity, then the real proof was accepted. No fabricated verification or permission bypass.
- Worker includes `--platform-fees` alongside existing controls/custody/bot-swap flags. New bundle SHA-256 `3144fa9650a9f8c03ae88c11be849e9dc167fc4dd0528211671ab80ecc49ebe3`; predecessor retained at `/opt/jamddmaj-perps/checks/fees-20261027/worker-before-fee-readiness.mjs`.
- Worker refuses restart if fee stores exist but its fee capability flag is omitted. This prevents silently forgetting durable commission state.
- Review and confirmation check actual recipient account and fee-inclusive backup before issuing a review/recording consent. Missing recipient gives bounded `fee-recipient-account-missing`; client/panel explain administrator action, not extra customer funding.
- Worker, web and HTTPS active, worker Result=success and NRestarts=0 after replacement. Existing account remains paused; three historical operations and zero pending operations preserved.

## Verification and remaining blocker

- Isolated Linux API/fee suites: 47 passed, zero failures. New activation-readiness check does not sign, record consent, activate or pay. Foreign ownership rejected before invoking it.
- Focused runtime/API suite: 36 passed, three Linux-only CLI cases skipped on Windows.
- Actual production readiness probe, with no vault/key imports or signer, reports one account, zero active, verified fee-inclusive backup, zero due/paid/pending fees, and `PLATFORM_FEE_RECIPIENT_USDC_ACCOUNT_MISSING`.
- Browser test uses compiled client, real DOM panel and synthetic API response; shows specific setup error, never invokes activate/sign/send. Existing inline Assets swap and first-visit browser regressions also passed locally.
- Full regression exposed an older backup-status expectation: fee error had overwritten independently verified recovery information. Panel now retains both facts; focused registry regression passes. Fresh full result and web publication are recorded after completion.

The goal is NOT complete. The operator Phantom must independently approve recipient USDC ATA creation through /fee-recipient-setup.html. Do not bypass this requirement, charge a customer to create it, or declare real automation enabled. After chain verification, check the remaining account risk/readiness and user review flow without confirming activation.

## Published verification

- Source `0ad608c`; deployment `dpl_ECZ6Me5Ewnmtm4vzatCVCFnCG9Fi`, candidate https://jamd-dmaj-ey4p3nm32-jamd-dmaj-s-projects.vercel.app, production READY and promoted to www.jamddmaj.com without rebuilding.
- Fresh complete regression after the backup-message correction: 1,140 tests, 1,121 passed, 19 skipped, zero failures, 210 seconds. The earlier run's sole failure was corrected and the entire suite rerun.
- Authenticated candidate and public byte hashes matched the local build (LF-normalized raw panel): panel `f65b55a479eb4c014314ac5c0194cb0586c923311d1105efdc79f24f196efe3d`, compiled client `3164791e44faacae4b9f5dce9c1129f6732c575c38d1ae1a753cb04c57510cb9`.
- Public browser regressions passed for specific fee-recipient readiness error, first-visit access and existing inline Assets swaps. Financial requests were synthetic/intercepted; no real session, activation, signing or submission.
- Bounded production deployment error query over the last ten minutes returned zero records. Not continuous monitoring.
- Web/server release only; no APK generated or installed.
