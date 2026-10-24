# Release 1.38.1 — step 7

Subsequent owner-authorized platform availability is recorded in
[the execution-availability report](execution-availability-20261024.md).
This report preserves the state at the time of publication.

Source commit: `00de22f71d6bed4c456eb5de4d179c59d61d5f56`.
Publication does not enable manual trading, server custody signing or automation.
No deposit, user-wallet signature, transaction submission or phone installation
is performed by the release checks.

## Recovery and manual server

Before replacement, all three dependent services were drained/stopped. A new
five-database checkpoint was encrypted to the previously approved public age
recipient. The private recovery identity stayed on the PC. Exact offline restore
of all five databases passed in a new quarantine directory.

- Encrypted checkpoint SHA-256:
  `8f1ca14e0b219c2384e2f458ddbf93bca964b6040e88795e78dd0b59616807be`.
- PC archive:
  `C:/Users/JamdDmaj/AppData/Local/JamdDmaj-Recovery/manual-production-20261024-1381/manual-runtime.age`.
- VPS rollback snapshots:
  `/var/lib/private/jamddmaj-perps-runtime/manual-checkpoint-20261024-1381`.
- Prior custody-key archive remains separately preserved; this additive
  checkpoint contains no custody keys.
- New manual-service bundle:
  `/opt/jamddmaj-perps/web/perps-web-service.mjs`, SHA-256
  `0adf4b477d63d656c01657e4aea62cc64524387dcd9a0c2221afb78817645b9d`.
- Previous compatible bundle:
  `/opt/jamddmaj-perps/web/perps-web-service.pre-1.38.1.mjs`, SHA-256
  `9525c61743a97c08c7ebbd7da5f100f88552b404b00ae6526649b2cb8a0bab9d`.
- Previous TLS configuration:
  `/etc/jamddmaj-perps/Caddyfile.pre-1.38.1`.
- Caddy configuration validated before replacement. Only the fixed
  `/api/perps-close` path was added. No destination, authentication, TLS policy,
  financial flag or schema was widened.
- Worker, manual web and TLS services are active. Public health remains
  `tradingEnabled:false`, `executionAvailable:false`, `mode:controls-only`.
- No error-level manual-service journal entries during the post-cutover scan.

Permanent database checksums matched exactly before/after replacement:

| Store | SHA-256 |
| --- | --- |
| Controls | `8ff620251fafeb383eb1820009e02d9638a9d8d835920311ac0b157966122228` |
| Risk | `aebbe046c216c9b3e47c31a3bdf6efb005f702e2ea8de431a4befb320328730a` |
| Web submissions | `b2fd68d952e218ae0fdb4453803ac21cf326815405d4a6dfbe4c53c585a3bb3a` |
| Manual policy | `308851d3060e7c17d1f537bcc018f9377835939d5fccea1d00a9473c1298bd21` |

Active bot accounts: zero; reservations and permanent web submissions: zero.
Never roll financial records back to these snapshots after a signature or send;
reconcile the newest permanent facts before selecting compatible code.

## Web

- Intended project/team verified before deployment:
  `prj_MDNgTRQMQhZHy0Np4HuKiqTKbsjd` /
  `team_JORXYGzaQKli6kcSkgcGRU33`.
- Source exported from the exact committed tree; unrelated local changes,
  native folders, environment files, recovery material and tests were not
  uploaded to Vercel.
- Production-target deployment `dpl_4VFh7DmbrmW7oAnuSkK2WzSSB2mx`, READY.
- Candidate:
  `https://jamd-dmaj-cymib3dxg-jamd-dmaj-s-projects.vercel.app`.
- Staged with `--prod --skip-domain`, inspected through existing deployment
  protection, then promoted unchanged to `https://www.jamddmaj.com`.
- `/api/status` returns `webVersion:1.38.1`; new close panel module returns 200;
  unauthenticated close POST returns `401 LOGIN_REQUIRED`, GET returns 405.
  These boundary checks do not claim an authenticated funded trade.
- Isolated real Edge: finance page returns 200, all three close panels (Assets,
  Trade, Futures) initialize without module errors, consent is unchecked and
  confirmation is disabled with no wallet. Financial requests: zero. No user
  browser profile, Google login or wallet connection was used.
- Vercel error query over the deployment's first 15-minute window returned zero
  records. This is a bounded scan, not a promise of ongoing monitoring.

## Android

Release workflow: `https://github.com/JamdDmaj1/JamdDmaj/actions/runs/40095231130`.
Tag: `v1.38.1`; application ID remains `com.jamddmaj.ai`, version code 157.

The prior published 1.38.0 APK checksum and signature were verified first.
Prior public certificate SHA-256:
`d4799319516f9b243b12ef4678823baed39d9203e42fa70f8de0ba0f7c0080d6`.

All three required release jobs completed successfully: offline wallet SDK,
native Android verification and signed release. Public release ID `422731818`
is neither a draft nor a prerelease and contains both `JamdDmaj-AI.apk` and
`JamdDmaj-AI.apk.sha256`. Published at `2026-10-24T12:54:30Z`:

`https://github.com/JamdDmaj1/JamdDmaj/releases/tag/v1.38.1`.

The published tag resolves to the exact source commit above. The APK was
downloaded from that release and checked against both its checksum asset and
GitHub's asset digest:

- Size: 79,716,477 bytes.
- SHA-256: `d880983e2f21ee815dbb770cd3b672137c3730c256d468b1808d8be223eebfcd`.
- Signature: valid APK Signature Scheme v2; certificate SHA-256 exactly matches
  the prior production APK certificate recorded above.
- Manifest: `com.jamddmaj.ai`, version code 157, version name `1.38.1`, not
  debuggable. Prior published version code was 156; application ID unchanged.
- Embedded web entry reports `1.38.1`; the compiled close module is present.
- Public `/api/status` independently reports `webVersion:1.38.1`,
  `latestVersion:1.38.1`, `updateSource:github-release` and the exact tag-specific
  APK download URL. This confirms update discovery, not phone installation.

The update is compatible with installing over the previous production identity.
Do not uninstall or clear app data. Actual user-phone installation and device
state were not accessed or modified.

## Completion and remaining financial boundary

**Step 7 publication completed:** matching server, public web and signed Android
release are published and verified. Final production database checksums still
match the pre-replacement values; active bot accounts remain zero. No manual
policy or financial submission was created by the release process.

**Not enabled:** real manual web execution and bot execution remain disabled.
Publishing tested code is not an authorization to activate custody or perform a
funded provider acceptance. The user's real session/wallet and account limits
must not be inferred from unauthenticated release checks.
