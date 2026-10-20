# Perps control service: deployment and remaining gates

This is part of the real Jupiter Perps integration, not a completed trading
release. Installing this control-plane service does not activate automation,
create a custody wallet, sign a transaction, or submit an order.

## Verified deployment, 2026-10-19

- Host: the approved DigitalOcean VPS, `157.230.54.133`.
- Unit: `jamddmaj-perps-controls.service`, active, enabled, zero restarts at
  verification. It uses a dynamic unprivileged user and private persistent state.
- Listener: **127.0.0.1:8788 only**. No new public HTTP/HTTPS port was opened.
- Bundle: `/opt/jamddmaj-perps/controls/perps-control-service.mjs`.
- SHA-256: `cd50d80f0d61cd12224148d890b10169a620ac1f40fffa584609ada4e6b1494e`.
- Build dependency inspection found no custody-vault, signing-authorization,
  executor, or broadcast module in the service bundle.
- Local `/health`: HTTP 200, `mode: controls-only`, `tradingEnabled: false`,
  `executionAvailable: false`, `custodyProvisioningAvailable: false`.
- Local `/v1/automation` without a session: HTTP 401, `login-required`.
- The legacy Bitget executor remains inactive and disabled. No positions or
  orders were closed or cancelled during this deployment.

The HTTP boundary accepts only `/health` and `/v1/automation`, bounds request
sizes and concurrency, and does not expose custody/provisioning/signing routes.
The default peer quota ignores forwarding headers. Enable loopback-proxy trust
only after the deployed reverse proxy is verified to replace untrusted client
headers. Owner quotas are durable and atomic across database connections.

The identity adapter forwards only the opaque authorization header to the fixed
JamdDmaj `/api/perps-identity` endpoint. That endpoint checks the existing Redis
session ledger; a Google profile, device identifier, request-body identity or
wallet connection is not sufficient. Session verification must work in the
actual production deployment before the app can use these controls.

## Local verification

`npm test`: **484 passed, zero failed**. Coverage includes real local HTTP,
session-ledger interface, owner isolation and ambiguous-owner rejection,
durable per-owner quotas, untrusted forwarding headers, browser/native CORS,
service lifecycle, loopback binding and absence of created custody files.
It also includes the existing mocked execution chain. These tests are not proof
of a completed production app-to-Jupiter trade.

The Android workflow for source `bf43f4bf276c0521355ab9d06532c635474075be`
completed successfully at run `39197216209`. A successful build or downloadable
artifact is not a published user release, nor evidence that financial execution
is enabled. The controls/authentication changes documented here are newer than
that build.

## Required before claiming real trading completion

1. Publish and verify the identity endpoint and Telegram publication metadata
   on the actual production origin. Preview success is insufficient.
2. Establish verified public HTTPS transport to the VPS; do not use an internal
   self-signed certificate, disable TLS validation, or bypass deployment access.
3. Connect app controls to the owner-authenticated service and verify the flow
   using a real authorized session, without financial signing or submission.
4. Complete explicit custody provisioning, durable ownership binding and secure
   independently recoverable encrypted backup before accepting funding.
5. Wire the durable execution daemon to the real validated providers, keeper
   transport, published Telegram feed and risk readers. Do not enable it during
   tests. Validate supported markets instead of offering arbitrary tokens.
6. Complete explicit safe handling of leftover sibling exits, including reviewed
   cancellation and its own durable/signing/reconciliation policy. Full-size
   request-bound individual exits are now reconciled in source (see below), but
   arbitrary partial/manual decreases do not release a logical entry. The engine
   stops new entries if an executed exit still has live sibling requests.
7. Verify all requested controls and manual execution through the actual app,
   including balances, limits, SL/TP inheritance, pausing, daily loss responses,
   restart recovery and unknown-transaction reconciliation.
8. Complete release and production verification. Do not equate controls-only
   health, a passing suite, a preview, or an APK artifact with trading readiness.

No production custody master key or exclusive wallet was created by this
control-service deployment, and no funds were moved.

## Individual entry reconciliation: source verification, 2026-10-19

Preparation now privately binds the exact opening size and simulated SL/TP
request addresses, sizes, prices and counters to the durable reservation. Exit
addresses cannot be assigned to multiple entries, even across separate database
connections. Signing authorization, signed-envelope verification and broadcast
revalidation reject changed or missing durable bindings.

A finalized, verified full-size decrease tied to that exact exit request can
close its logical entry while another entry in the same aggregate position stays
open. The finalized account must remain fresh and all that entry's exit requests
must be absent in a rooted account bank. Closure proofs bind the complete exit
plan; replacing it with an empty plan cannot bypass pending-order checks.

After a restart or a UTC day change, the reader can recover positive exit
evidence through the recorded request addresses and signature-verified finalized
transactions. Reads are bounded (40 index rows per request, at most 12 extra
transaction reads per entry). Unavailable, pruned, excessive or inconsistent
history leaves capital held. Prior-day exits do not count as current-day losses
or erase the original entry day. Consumed event identities are durably unique.

If a sibling exit remains live after closure, the coordinator returns
`EXIT_CLEANUP_REQUIRED` and starts no new entries. It performs no cancellation.
Unknown recovery results or legacy rows without proven exit bindings also stop
new entries instead of guessing missing metadata.

Verification: the complete local suite passed **493 tests**. The eight dedicated
entry-closure tests also passed on Node 22.23.1 on the approved VPS under a
transient dynamic-user service with `PrivateNetwork=yes`, `PrivateTmp=yes`,
`ProtectHome=yes`, `ProtectSystem=strict` and no financial service activation.
Only deterministic unfunded fixtures and injected RPC responses were used.

Linux test artifact:
`/opt/jamddmaj-perps/checks/entry-exit-d2ecfd33f337/perps-individual-entry-closure.test.mjs`.
SHA-256: `d2ecfd33f33765260a734f7b29191eafc405765a3bae94a7968b02aae670b23a`.
The transient check finished successfully; this artifact is **not** a running
executor or user release. The deployed controls-only bundle remains the one
identified above. The production app-to-Jupiter verification gates remain open.

## Finance controls client and prepared HTTPS, 2026-10-19

The Finance automation panel now has explicit server read, save-and-pause and
pause controls. The client uses only `https://157.230.54.133`, requires the
existing opaque JamdDmaj session, and verifies the public health response before
sending authorization. It follows no redirects, sends no cookies, retries no
mutations, bounds response bodies, rejects account changes during a request and
does not export provisioning, signing or activation methods.

Finance is a separate same-origin page. The session reader therefore uses the
main page's session helper when present and otherwise reads the existing
`jamdWebTrialSession` from sessionStorage. It does not authenticate from a saved
Google profile, device ID, main wallet or Phantom connection. The automation
capital display no longer labels the main-wallet balance as exclusive bot funds.

The local integration test connects that actual app client through the real
local HTTP boundary and session-ledger interface to owner-scoped SQLite
controls. It proves read/save/pause behavior without financial activation, not a
production HTTPS or trading flow. The built Finance module graph is also checked:
the previously missing `perps-navigation.js` is now emitted, and the control
client's package dependency is bundled for browsers rather than shipped as a
bare unresolved import. The complete local suite passed **507 tests** and the web
build succeeded.

HTTPS preparation on the approved VPS:

- Caddy version: **2.11.7**, downloaded from the official GitHub release.
- Archive SHA-256:
  `727b91701a392de6ebc5027509f548bf39979e5216340d0faed8fa5e69c84f8b`.
- Installed binary: `/opt/jamddmaj-perps/https/caddy`, SHA-256
  `678ade3bfc088749c81a681adc603333ee0bb023b6a6cfe3c0f58bef8ff854e9`.
- Config: `/etc/jamddmaj-perps/Caddyfile`, adapted successfully by that binary.
- Unit: `jamddmaj-perps-https.service`, installed but **inactive and disabled**.
- Only a public ACME issuer with the `shortlived` IP profile is configured; there
  is no internal/self-signed issuer fallback or disabled TLS validation.
- Only the two controls paths are proxied to loopback. Cookies are stripped,
  forwarding headers replaced, and request sizes/timeouts bounded. No access
  logging of authorization headers is configured.
- No certificate-provider account was registered by the agent. Certificate
  registration remains an owner-handled step after reviewing the provider's
  subscriber agreement. The owner may start the prepared HTTPS unit directly
  from their console if they accept that step; the agent must not treat pending
  or prospective acceptance as completed registration.
- A read-only socket check still showed no listener on 80/443. Public certificate
  issuance, chain validation, renewal and app access are **not yet verified**.
- `perps.jamddmaj.com` currently resolves away from this VPS; no DNS record was
  changed and Vercel deployment protection was not bypassed.

Starting the HTTPS unit would enable transport only, not the financial bot. It
does not make the production identity endpoint, custody provisioning, encrypted
backup, execution worker or final release gates complete. These source changes
must not be described as already available in the installed Android app.

## Idempotent custody provisioning: source verification, 2026-10-19

The private vault now supports explicitly approved, owner-bound idempotent
creation. The authenticated owner binding and encrypted seed are committed in
one immutable `owner-<accountHash>.json` record, avoiding a separate owner index
that could be lost between writes. Reopening the vault or repeating a completed
request returns the same public wallet. The legacy address-named format remains
readable; existing control mappings are verified rather than silently replaced.
If no owner-bound record exists, exactly one authenticated legacy wallet can be
adopted without changing its key. Multiple legacy wallets for the owner require
review. The legacy lookup is bounded and never treats unreadable records as
proof that no old wallet exists.

A partial, corrupt, symlinked, hard-linked, or insecurely permissioned owner
record is rejected without overwriting it or generating a replacement address.
A concurrent incomplete write may fail a request safely; a later explicit retry
reads the completed record. Successful creation makes the file and its directory
durable before returning. The seed remains AES-256-GCM encrypted, owner/purpose/
address-bound, and unavailable through any public export method.

The new private provisioning coordinator validates server-side sizing and
explicit custody consent before key creation. It binds the resulting wallet to
paused durable controls, recovers from lost responses or interrupted control
writes, and preserves existing settings/revisions on repeated requests. It
rejects caller-selected wallets, imported keys and seeds. Its ownership argument
must come from the verified session adapter, not forwarded user JSON. The
coordinator is not itself a login mechanism: the HTTP adapter must supply identity;
this coordinator is **not yet exposed by the deployed controls-only service**.

Provisioning reports `backupVerified: false`, `fundingAvailable: false`, and
`readyForSigning: false`. It does not bootstrap a production master key, create
an off-host backup, enable a worker, send funds or grant signing authority. Those
gates remain incomplete. A restored encrypted owner record plus its separately
matching master key recovers the same fixture wallet; that restore test is not
proof that a production recovery copy has been installed.

Verification: the complete local suite passed **517 tests**. The full mocked
Telegram execution cycle now also uses the new owner-bound provisioning path,
retaining all preparation/reservation/signing/reconciliation gates. Any fixture
signature and submission in that cycle belongs only to ephemeral unfunded test
keys and an injected mock transport, never a production transaction.

On the approved VPS, **16 custody/provisioning tests passed** on Node 22.23.1
inside a transient dynamic-user service with network disabled, a private `/tmp`,
read-only system paths, protected home directories and a 384 MB memory ceiling.
The concurrent case used four Linux processes (eight in the local suite). The
worker refuses files outside its own isolated test directory. All temporary
keys and databases were fixture data, not a production custody wallet.

Artifacts under `/opt/jamddmaj-perps/checks/provisioning-7630a2f39eac/`:

- `perps-custody-provisioning.test.mjs`, SHA-256
  `7630a2f39eac921b8795ee740e3c0b30f50d75cf90b04c7cc9d8f7761371479c`.
- `perps-provisioning-worker.mjs`, SHA-256
  `8e809c225b5f71aafb63dc0cc73c30f39db44d9a9eefe85a9560c2f4aa179601`.
- `perps-custody-vault.test.mjs`, SHA-256
  `4fb9189ef0e8418e8fc47d714abdccafdb5ac1aa41babd06d9d0d77aaeb98f80`.

Android workflow `39200943000`, source
`9801e2bf2c621e6b7c8c70270746b14b7cc65968`, completed successfully. Its APK
artifact is not a new published user release and predates the provisioning
changes in this section. The HTTPS unit was still inactive and disabled when
checked; no owner certificate-registration action was inferred from goal
continuations. Bitget remained inactive and disabled.

## Operator recovery destination approved and initialized, 2026-10-19

The owner selected this PC with a dedicated recovery encryption identity. The
operator identity was initialized outside Git and cloud-synced document folders:
`C:\Users\JamdDmaj\AppData\Local\JamdDmaj-Recovery`. Windows ACL verification
permits only the current user and SYSTEM. Initialization is idempotent and does
not replace an existing identity. A missing identity with an existing recipient
is an error, not permission to rotate the recovery key.

The private `operator-age-identity.txt` stays on this PC. Never print, commit,
send through chat, copy to the VPS, or reuse it as an SSH or Solana signing key.
Only `operator-age-recipient.txt` is public. This is an operator-controlled
custody recovery mechanism, not a user-facing seed export or HTTP endpoint.
Keep access to this PC restricted: possession of a future archive and its
operator identity would permit recovery of every custody key in that archive.
Loss of this PC and identity would make those archives unrecoverable. A separate
offline copy of the operator identity needs an owner-selected secure destination;
none was inferred or created.

`lib/perps-custody-recovery.js` encrypts bounded, authenticated custody records
and their matching master directly in memory using age-encryption 0.3.1. No
plaintext archive is written. Restoration validates age authentication, every
record MAC, owner/address bindings, checksums, paths, format, and network before
creating a fresh private destination. It never overwrites an existing target.
It installs `.restore-review-required.json` before writing recovered keys.
The vault then reports nonexclusive/review-required and refuses creation and
signing, including previously issued private signing grants. No HTTP/browser
API can remove this hold. There is no automatic resume or marker-removal command.

**This archive contains custody keys only, not the controls database, execution
journal, or chain reconciliation state.** It always reports
`runtimeStateIncluded: false`, `backupVerified: false`, and
`readyForSigning: false`. Restoring keys alone must never authorize operation.
Full operational backup, fresh state reconciliation, reviewed hold release,
actual production custody provisioning, and an off-host production restore drill
remain required before capital or activation. No production custody master or
wallet was created in this verification; no actual funded wallet backup exists.

Verification: full local suite **524 passed, 0 failed, 1 skipped** (525 total;
the optional external age CLI check is skipped locally). The local Windows ACL
test used only a disposable temporary operator identity before initializing the
approved real operator identity. On the VPS, six recovery tests passed in a
transient dynamic-user service with networking disabled, private temporary
storage, read-only system paths, and a 384 MB memory limit; the Windows-only
case was skipped. Official age CLI 1.3.2 interoperated with the SDK in both
directions using ephemeral unfunded fixtures. No actual signing or transaction
submission occurred during this recovery check.

Isolated VPS artifacts: `/opt/jamddmaj-perps/checks/recovery-193646fb3086/`.
Test bundle SHA-256:
`193646fb308636dcbe295c3f2fed21c1a6b185d48ed980817ea4dbc3322616e0`.
The official Linux age 1.3.2 download was checked against SHA-256
`cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10`.
The binary is only a test artifact, not a production backup service.

Dependency audit still reports the two pre-existing high-severity dependency
findings for `@xmldom/xmldom` 0.9.10 and `brace-expansion` 5.0.9. Their versions
were unchanged by the recovery dependency installation. Do not describe the
whole dependency tree as audit-clean or release-ready; scoped remediation and
regression verification remain open. No blanket dependency rewrite was run.

## Runtime-aware recovery v2: verified source and unfunded off-host drill

The preceding custody-only v1 format remains supported. The new optional v2
archive additionally contains standalone SQLite snapshots of controls and the
execution journal. `runtimePaths` must name both existing private databases and
a private temporary directory. An explicit operator approval is required before
accessing them. Ordered `BEGIN IMMEDIATE` locks prevent writers on both databases
while separate read connections use SQLite's WAL-aware backup API. The locks and
private in-process snapshot handle are released on success or failure. Existing
live policy is not paused, revised, or activated by taking a snapshot.

The snapshot includes committed WAL rows, all six reservation states, exact
signature/hash and exit-plan bindings, consumed exit events, cancellation/signal
history, settings, daily risk markers, request quotas, and audit records. Both
database schemas are pinned to the reviewed source schema fingerprints. Unknown
tables, triggers, views, changed schemas, invalid integrity/foreign keys, excessive
size, and wallets without matching custody/control ownership are rejected.
Each database is bounded at 8 MiB and the complete decrypted archive at 24 MiB;
larger deployments need an explicitly reviewed capacity/streaming update, not a
truncated backup. No untrusted archive SQL is executed.

Restoration verifies all keys and both database snapshots before creating the
fresh destination. It preserves journal rows exactly, including unknown sends
and already-consumed exits. The restored controls get new revisions, disabled/
paused state, `RESTORE_REVIEW_REQUIRED`, cleared activation challenges, and a
`RESTORE_AND_PAUSE` audit record. Original risk markers, sizes and quotas survive.
The custody quarantine marker remains mandatory, including for keys-only v1
restores; this tool cannot release it. A snapshot is historical evidence, not
proof that no transactions occurred after its cutoff. Fresh complete on-chain
reconciliation and reviewed recovery remain mandatory before any resumption.

The operator CLI now supports a hash-pinned restore into a fresh private target:

```
node scripts/perps-recovery-operator.mjs restore --directory ABS_OPERATOR_DIR --archive ABS_ARCHIVE --destination ABS_FRESH_TARGET --expected-sha256 ARCHIVE_SHA256
```

It prints only public identities, paths and review-required status. It cannot
export the operator identity, replace an existing target, remove quarantine,
enable controls, sign, or submit. The shared private-files module enforces POSIX
ownership/modes and actual Windows ACLs; the Windows restore test uses real ACL
checks rather than the isolated fixture override.

Verification: **530 passed, 0 failed, 1 skipped** in the complete local suite
(531 total). On the VPS's Node 22.23.1, five runtime recovery cases passed in a
network-disabled transient dynamic-user sandbox; the Windows case was skipped.
The current verified bundle is under
`/opt/jamddmaj-perps/checks/runtime-recovery-13e38aaff477/`, SHA-256
`13e38aaff477668edcd2d3fe2d786cae791526da632fd82d041d1f66b7329d49`.
Its unfunded fixture generator has SHA-256
`70931a38e9ba6ce478e97e4526928adaedc949d2897d77a0b3db1f56eda90f1b`.

A separate end-to-end off-host drill generated a **new ephemeral unfunded**
wallet, disabled controls and an unsigned `SIGNING` reservation in the VPS
sandbox, encrypted the whole archive to this PC's real operator public
recipient, then copied only the encrypted archive to the PC. The operator
private identity never left the PC. The 99,590-byte encrypted fixture has
SHA-256 `4840425233734a0814bc135604df3475ba066e71cf2b9e27df200f6e5db59e9b`.
It was restored with native Windows permissions under
`C:\Users\JamdDmaj\AppData\Local\JamdDmaj-Recovery\verification-20261019-runtime\restored-UNFUNDED`.
Read-only checks verified matching ownership, disabled/paused controls, cleared
challenges, the custody quarantine, and the retained 10 USDC fixture margin in
`SIGNING` with no signature. That is fictitious reservation data, not funded
capital or an actual operation. No real transaction was signed or submitted.
This drill used the earlier bundle under `runtime-recovery-ae6f7aa0ba33`; the
later verified bundle adds the explicit all-six-state and consumed-exit corpus.

No production custody wallet/master was created, no actual production wallet
backup exists, and no production scheduled backup/PC synchronization service
has been installed. `backupVerified` and `readyForSigning` remain false. The
new source is not evidence of a published Android release or activated worker.
At the final server check, the legacy Bitget worker and prepared HTTPS service
were still inactive/disabled; controls remained active in controls-only mode.
Vercel project authorization and owner action on certificate registration remain
external integration gates; no acceptance or additional access was inferred.

## Paused-cycle reconciliation correction, 2026-10-19

Source review found that the bounded executor returned `AUTOMATION_INACTIVE`
before examining existing journal rows. That could leave a closed position
consuming a logical slot while paused, preventing the fresh risk check needed
for reactivation. The executor now verifies ownership/exclusive custody first,
then performs read-only reconciliation of recorded sends and finalized position
closures even when new entries are disabled. It does not close positions or
cancel exit orders. Recovery still needs the existing privately branded,
fresh, request-bound chain evidence.

An unresolved pending send no longer prevents independent recovery of a known
closed position. It still blocks every new entry and retains its full pending
collateral. Live sibling exits retain `EXIT_CLEANUP_REQUIRED`; partial, failed,
ambiguous, stale or legacy exits never become closure proof. A cycle that began
paused cannot open a new entry merely because activation arrives during the
read-only checks. Conversely, a pause/revision change arriving during an active
cycle is rechecked before entry-risk reads, feed reads or preparation.

Five regression cases cover paused confirmed closure, unknown `SIGNING` plus an
independent closure, partial/live-sibling exits, concurrent activation, and
concurrent pause. Forbidden financial capabilities are counted and remain at
zero in those cases. The full local suite passed **535 tests, 0 failed, 1
skipped** (536 total). The complete 13-case individual-closure/executor corpus
also passed on the VPS's Node 22.23.1 inside the network-disabled transient
dynamic-user sandbox with private `/tmp`, protected home, read-only system paths,
and a 384 MiB memory ceiling.

Verified fixture bundle:
`/opt/jamddmaj-perps/checks/paused-reconciliation-5abae598b2b5/perps-paused-reconciliation.test.mjs`,
SHA-256 `5abae598b2b5506d1d6a6652e02b080dfc8cabdd893bb4c3673ca2c4a92721ea`.
Fixture signatures belong only to ephemeral unfunded test identities and mocked
RPC history, not production accounts or submitted transactions. This is a source
correction, not installation/activation of a financial daemon, a new Android
release, or completion of the live backup/execution/app integration gates above.

## Worker lifecycle foundation, 2026-10-19

`lib/perps-server-worker.js` now connects the durable private controls inventory
to the bounded executor in paced, nonoverlapping cycles. It defaults to
`maintenance`, which invokes only the executor's new `reconcileOnly` entry.
That entry returns before entry-risk reads, signal selection, preparation,
reservation, signing or broadcasting, even if a stored user consent is active.
The separately selected private `execute` mode uses the existing complete
executor gates and stored per-account activation; starting a loop never calls
activation or provisioning. A host must still verify actual backup/readiness
and provide the reviewed transports before exposing financial activation.

The private `controls.listForWorker` pages both paused and enabled owners in
binary wallet order (20 accounts per default batch, maximum 50). It returns no
settings, challenge tokens or keys. Multiple wallet mappings for a single owner
fail review instead of multiplying that owner's capital allowance. The entire
page is validated before dispatch, and the API continues to reject inventory
enumeration as an unknown action. The database schema is unchanged.

The worker waits after every bounded page, including empty inventories. An
account-level failure cannot starve later accounts or leak upstream error text
into the aggregate report. Reports contain stage counts, not account identities
or credentials. A failed inventory/status operation fails the loop instead of
claiming it is healthy. `activationRequested: false` means no activation was
requested by the worker, not that the risk manager cannot pause an account.

One in-process promise is published before any dependency runs, preventing
overlapping loops and synchronous callback reentry. Aborting the provided signal
stops subsequent dispatches and waits for the already-running cycle to settle;
it does not abandon a signing/broadcast operation via a timeout race. A host
must wire process signals to that abort signal, await completion, and configure
an appropriate stop grace period. Journal uncertainty survives independent
worker instances and process restart; the loop has no resend shortcut.

A full integration test uses real temporary custody/control/journal stores,
published fixture signals, mocked read-only RPC/builder responses, and a mocked
submission transport. Maintenance leaves an actively approved fixture untouched
with zero feed, builder or signing/submission activity. Explicit execution
produces exactly one mocked submission. A fresh worker then sees the durable
`UNCERTAIN` reservation, reports reconciliation required, and never resends.
No production key, real transaction or live financial endpoint is used.

Verification: the full local suite passed **544 tests, 0 failed, 1 skipped**
(545 total). On the approved VPS's Node 22.23.1, all **26** worker-lifecycle and
full-preparation/execution fixture tests passed in a transient network-disabled
dynamic-user sandbox with protected home, read-only system paths, private `/tmp`
and a 384 MiB memory ceiling. Current bundles are under
`/opt/jamddmaj-perps/checks/worker-lifecycle-dc0c50729335/`:

- `perps-server-worker.test.mjs`, SHA-256
  `dc0c50729335559cdb685354b1bf9920449c6adf09ffee39ebfb550923922ee6`.
- `perps-server-preparation.test.mjs`, SHA-256
  `5f8ebff0cb1a412347e65abc6898d3aeaf8da2b1c98e21089572b2a0890c843d`.

This is the worker lifecycle library and verified integration, **not yet an
installed executable production host or enabled systemd financial service**.
No production master/wallet, actual backup/receipt gate, TLS registration,
transport configuration, app publication, or user activation was inferred from
these fixture results. Those end-to-end production gates remain incomplete.

## Authenticated app-to-custody setup path, 2026-10-19

The controls API now recognizes explicit `provision` requests only when the host
injects the private custody provisioner. The deployed controls-only host has no
such dependency and remains unavailable for custody setup. The request accepts
settings and `explicitCustodyApproval: true`, never a client-selected owner,
wallet, seed, readiness flag or activation field. Existing verified opaque
Google-linked session introspection and durable per-owner rate limits remain
mandatory; no authentication provider migration or credential copy was added.
Protocol sizing is validated before the private provisioner is invoked.

After the private coordinator returns, the API independently rereads the
authenticated owner's durable mapping and requires a matching paused/disabled
wallet. A callback cannot supply another owner's identity as the returned
control state. The setup response explicitly reports
`BACKUP_VERIFICATION_REQUIRED`, `backupVerified: false`,
`fundingAvailable: false`, and `readyForSigning: false`. An active or
readiness-claiming setup result is refused, not silently paused or treated as
fundable. Repeated valid requests retain the same encrypted owner-bound wallet
and its existing revision/settings; they do not rotate keys or overwrite limits.

The fixed-HTTPS app client exposes an explicit `provision` method, not automatic
creation. It validates custody consent and protocol minimums locally, checks
that the server actually advertises custody setup before forwarding a session
token in the POST, verifies the paused/nonfundable response, and rechecks that
the session did not change in flight. It never activates, signs, retries, or
forwards an owner hash. Failure after a POST is unconfirmed rather than proof
that no wallet was created; the next action is an explicit server read.

The Finance panel now permits setup only after an explicit read confirms that
the current account has no wallet and the user checks the initially unchecked
server-custody consent. The checkbox uses the existing JamdDmaj settings layout.
Successful setup displays the exclusive public wallet with an explicit **do not
deposit yet** warning. No deposit QR, funding action or activation action is
introduced. Connection/session failures clear stale identity and require a new
read before retry. Preparing a wallet does not transfer the principal/Phantom
balance into bot capital.

Verification: **552 passed, 0 failed, 1 skipped** in the complete local suite
(553 total), including the shipped Finance module graph. A full in-memory
app-panel -> fixed-origin client -> session ledger -> API -> real temporary
custody/control-store test passed using unfunded fixtures. Replay preserves the
same wallet/settings, foreign reads are denied, and a session change after the
POST cannot display that wallet for the new session. On the VPS's Node 22.23.1,
all **8** authenticated API/integration cases passed in the network-disabled
dynamic-user sandbox with private `/tmp`, read-only system paths, protected home
and a 384 MiB memory ceiling.

Verified bundle:
`/opt/jamddmaj-perps/checks/authenticated-custody-fcfe215cdcfc/perps-authenticated-custody.test.mjs`,
SHA-256 `fcfe215cdcfcfc8acf153d314e216a0773e3528a0705e884482d1b86a9279853`.
No real wallet or master was created, funded, signed for, or submitted from.
The test's advertised setup capability and session ledger were injected fixture
dependencies, not evidence of a publicly reachable production flow.

Before the host may advertise custody setup, it still needs private production
key storage, admission/capacity policy compatible with the backup envelope,
actual off-host backup/receipt verification, and the reviewed operational host.
The authenticated identity route and HTTPS transport must be published and
verified end to end. No production host was replaced, no capability flag was
enabled, and no Android update was published by this source change.

## Publication access check and scoped dependency remediation, 2026-10-19

The authoritative VPS check still showed HTTPS inactive/disabled, controls and
the read-only signal observer active, and the legacy Bitget executor inactive/
disabled. No certificate registration or service activation was performed.
The owner was asked to review the Let's Encrypt subscriber terms and, only if
accepted, personally enable the prepared transport from the DigitalOcean
console. The owner was separately asked to reconnect the existing Vercel
connection to the account/team that owns `jamd-dmaj-s-projects`. Plugin discovery
confirmed that Vercel is already installed/enabled; that is not evidence of
project-level access. No duplicate plugin was suggested and no prior denied
project request was blindly retried. No credentials were requested or retrieved.

The existing Android branch-build workflow was inspected before considering a
push: it builds for `codex/native-wallet-protection` and can use the permanent
APK signing secrets. A branch push is therefore not treated as a secret-free
test. The protected-branch/reviewer conditions for a new secret-bearing run were
not verified in this check; no push, signing workflow dispatch, production
promotion, release/tag or APK publication was performed.

While those owner actions remain pending, the two previously reported vulnerable
development-tooling packages were updated within their existing parent ranges:

- `@xmldom/xmldom` 0.9.10 -> 0.9.12, used by Capacitor's `plist` tooling.
  [Maintainer release](https://github.com/xmldom/xmldom/releases/tag/0.9.12) and
  [maintainer raw-text advisory](https://github.com/xmldom/xmldom/security/advisories/GHSA-6mj3-qw4j-hgrw).
- `brace-expansion` 5.0.9 -> 5.0.12, used through `minimatch`/`glob`/`rimraf` by
  Capacitor CLI. [Maintainer rewrite advisory](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-q2hr-2g5m-vwhr).

Only those two lockfile resolutions/integrities changed; `package.json`, parent
dependencies, the Capacitor version, and financial runtime dependencies remain
unchanged. The update used `--ignore-scripts`, not a blanket audit fix. Fresh
`npm audit` reports **zero known vulnerabilities** in this local dependency
tree. This supersedes the earlier two-finding snapshot, not a claim that the
entire app, native code, deployed bundle, or financial system has been audited.

Four new regressions verify the reviewed same-line lock entries, the real
Android manifest parse and plist round trip without editing project files,
bounded mixed-case raw-text serialization, and compatible brace path expansion
with bounded adversarial nesting/rewrites. `npx --no-install cap --version`
returns 8.4.3. The complete local suite passed **556 tests, 0 failed, 1 skipped**
(557 total). A new Android compile/install and production end-to-end gate are
still unverified; source and local tooling verification are not a published app
update. No trading activation or real transaction occurred.

## Restore-proven custody backup gate, 2026-10-19

`perps-backup-registry.js` adds a private durable operator-attestation registry.
A genuine v3 age archive includes a random challenge inside its ciphertext;
the registry retains only its hash and exact owner/wallet coverage. Only a
completed restore writes the private receipt. The operator returns that receipt
and explicitly verifies it against the expected archive hash. This is a trusted
operator decryption/restore attestation, not independent hardware or remote
storage attestation. The registry is deliberately excluded from runtime recovery:
restoring keys and databases cannot restore signing readiness.

Pending challenges expire after 24 hours. Accepted receipts are idempotent;
older receipts cannot roll back a newer accepted archive, including after SQLite
VACUUM. Private two-second proof handles cannot be reconstructed from JSON.
Revocation, registry closure, changed identity/schema/file permissions, and
expired proof leases fail closed. Earlier v1/v2 archives remain recoverable but
do not grant this readiness proof. Restored wallets remain quarantined and their
controls paused; verification never removes quarantine or activates trading.

The executor checks this proof before consuming new signal/risk capacity.
Signing authorization and broadcast also recheck the real registry around their
asynchronous boundaries, so revocation invalidates an issued grant before key
use and prevents a later POST. Read-only reconciliation remains available while
the proof is absent. The deployed production host does not yet compose these
dependencies or advertise custody provisioning.

The complete local suite passed 565 tests, zero failures, two skips (567 total;
one local untracked probe is not part of committed CI). The Linux network-disabled
dynamic-user sandbox passed all 29 registry and preparation/execution cases,
including the actual archive/restore/verify CLI case skipped on Windows.
The optional external age CLI interoperability case is the other local skip.
The tested Linux bundles are under
`/opt/jamddmaj-perps/checks/backup-proof-803ef8000203/`:

- Registry tests: SHA-256 `803ef8000203d5b0795ec2a5b005fffc9b68fd0c983a6a0eb90bbb29765729c2`.
- Execution tests: SHA-256 `e24b6cebf8c75896bc2b326b269f5cdd1c988056178cb282470034e72142d7cb`.
- Unfunded fixture helper: SHA-256 `d626c0a7d47cef767f7a6c8e80d8fc9e433289a5b9407e30ef5f6fc049827e5c`.
- Operator CLI: SHA-256 `9d52d5c703002ec09ed818baa07ba0cf3002b697c3aefec78bfd2eb74ac94ec9`.

An unfunded fixture archive was copied from the VPS to the approved private PC
recovery folder, restored using the existing operator identity and production
Windows ACL checks, then only its private receipt was returned to the isolated
VPS fixture registry. Archive SHA-256:
`0ec625b1ec07d3b31b30798ceb70c2183ab5a1c3762b4d75b3816b20b50fc705`.
PC location:
`C:/Users/JamdDmaj/AppData/Local/JamdDmaj-Recovery/verification-20261019-v3-sequence/restored-UNFUNDED`.
VPS fixture state:
`/var/lib/private/jamddmaj-perps-backup-proof-fixture-d626c0a7d47c`.
The final verify command returned `OPERATOR_RESTORE_VERIFIED`,
`backupVerified: true`, `readyForSigning: false`, and
`activationRequested: false`. No operator private identity left the PC. The
original temporary fixture keys were removed by fixture cleanup. This proves
only that unfunded fixture backup, not a real user's production recovery.

No production custody wallet/master, financial daemon, real transaction,
certificate registration, Android publication or Vercel promotion was performed.
Production identity/HTTPS access, the operational host and activation readiness,
safe orphan-exit cleanup, real owner provisioning/recovery, and device-level
verification remain required for the full trading objective.

After the off-host verification, the full local suite was rerun with the same
result: 567 total, 565 passed, zero failed, two skipped. A fresh read-only service
check confirmed HTTPS inactive/disabled, controls active/enabled and the old
Bitget executor inactive/disabled. An unauthenticated request to the fixed public
`/api/perps-identity` returned HTTP 404 (plain text), so the required identity
route is not available at that production URL. The public `/api/pro-client-feed`
returned HTTP 401 JSON without credentials, which is not evidence of a broken
authenticated observer feed. No credentials were obtained or exposed by these
checks. Identity-route publication and end-to-end authenticated verification
remain a concrete production integration gate, not a presumed completed task.

## Durable worker entry point and real store composition, 2026-10-19

`scripts/perps-server-worker.mjs` now composes the existing control store,
execution journal, custody vault, private backup registry, read-only RPC,
finalized daily-account reader, exclusive-custody risk reader, published signal
feed, inspected preparation/signing/broadcast pipeline and paced worker.
This is an executable worker, not another observer or a readiness boolean.
It does not expose an HTTP API or create/provision/activate any wallet.

Startup requires existing private canonical state under one directory:
`controls.sqlite`, `journal.sqlite`, `backup.sqlite`, `wallets/`, and
`keys/master.key`. It refuses missing stores rather than initializing a new
financial history. Controls and journal schema/integrity/size are checked
read-only before opening their normal constructors, so a foreign database is
not migrated. Duplicate inodes and insecure SQLite companion files are refused.
Actual owner coverage is checked by the durable worker inventory and custody
reader; missing backup proof blocks new entries before feed or risk reads.

The default `maintenance` mode uses only `reconcileOnly`, with entry risk, feed,
builder, signer and broadcast entry paths replaced with rejecting functions.
It can reconcile recorded positions while an account's saved controls are active
without using that prior consent for a new entry. `execute` additionally requires
explicit operator execution configuration and a valid feed token; this does not
replace per-owner activation or any financial validation. No execution-mode
process was started against real custody during these checks.

`STATE_DIRECTORY` (or `JAMDDMAJ_PERPS_RUNTIME_DIRECTORY`) selects the durable
state. `RUNTIME_DIRECTORY`, when supplied by systemd, selects a separate private
process-lock directory. Without it the lock stays in durable state and a stale
lock requires explicit operator review; the runtime never guesses from its age
or steals another instance's lock. The new **uninstalled**
`ops/jamddmaj-perps-worker.service` template uses systemd-owned private runtime
storage, removed when its unit stops, so a crash restart can resume durable
reconciliation without preserving an obsolete PID lock. The durable journal is
never removed by lock cleanup. SIGTERM drains the actual in-flight worker and
closes private stores before removing its own lock; observation timeouts do not
abandon a financial cycle. Aggregate private status excludes owner identifiers,
wallet addresses, feed credentials and upstream exception text.

The full local suite passed **573 tests, zero failed, three skipped** (576
total, including the existing untracked local probe). The additional skip is
the actual Linux-only worker CLI case; it passed in the VPS's network-disabled,
dynamic-user sandbox, along with all other 15 runtime/worker lifecycle cases.
The sandbox has private temporary storage, read-only system paths, protected
home, umask 0077, no new privileges and a 384 MiB memory ceiling. Tests create
only ephemeral unfunded wallets and private databases. They verify no transport
calls in maintenance, blocking absent backup readiness in explicitly configured
execution, no migration of foreign stores, competing/abandoned lock rejection,
status privacy, shutdown/drain, and a real CLI one-shot maintenance cycle.

Hash-verified Linux artifacts under
`/opt/jamddmaj-perps/checks/runtime-b125d4abcab6/`:

- Runtime tests: `b125d4abcab6fb3ee504d29061efdf8817580d66e0f8fa428c21b9cd7707beae`.
- Worker tests: `76a7061c1613d3fd3ccf961ef0785b8ca701c4b5cc5d0d957b907dd508f4a699`.
- Executable worker: `b044c4eb170efc020ee88764ed153684d3e2108a41d073be34d394d202113dc0`.

Only isolated tests were run on the VPS. The new unit was copied into the check
artifact directory, not installed, enabled or started. Existing production
controls were not replaced, real custody/master files were not created, and
there was no real transaction signing/submission. This worker composition does
not complete the public control API's activation readiness callback, reviewed
shared-state ownership/admission, identity/HTTPS publication, real owner backup,
orphan-exit cleanup, manual futures or the Android/device end-to-end gate.

## Shared runtime controls and verified HTTPS, 2026-10-19

After the owner reported reviewing/accepting the CA terms and enabling the
prepared HTTPS unit, read-only checks confirmed HTTPS **active/enabled**. A
normal TLS-verified request from this PC to `https://157.230.54.133/health`
returned HTTP 200 and controls-only capabilities (execution/provisioning/trading
all false). No certificate check was disabled. Existing controls remain active;
the old Bitget executor remains inactive/disabled. This supersedes the earlier
HTTPS-disabled observations, not the incomplete financial deployment.

The owner also reported reconnecting Vercel and then explicitly authorizing the
team. The connector nevertheless returned HTTP 403 for the exact
`jamd-dmaj-s-projects` scope after that new report; team listing returned no teams.
The error identified `team_JORXYGzaQKli6kcSkgcGRU33`. No Vercel CLI command was
available in PATH, so no authenticated CLI fallback existed. No credential files,
tokens or browser auth state were retrieved. Denied calls were not retried
without new user-reported authorization. No Vercel release was attempted;
owner-reported reconnection is not evidence of project-level access.

The runtime now exposes the existing automation API using its **same** private
controls and account quotas as the worker. Authentication reuses the fixed
production session ledger, never a saved profile, client-selected owner or
wallet address. `--controls` adds the bounded loopback HTTP boundary to the
executable worker and uninstalled service template. Maintenance advertises no
execution or provisioning. Execution capability requires an actually running,
explicitly configured execution loop, and grants no owner-specific permission.
No custody provisioning capability was added to this runtime.

`perps-server-activation.js` supplies the startup activation callback. It checks
the live execution loop, exact stored owner/revision/settings, exclusive custody,
private restore-proven backup, absence of uncertain journal entries, and a real
fresh reconciled daily account. Recorded positions absent from the chain bank
require maintenance. Existing settings-bound one-use approval and durable risk
checks remain mandatory. Private readiness is rechecked after asynchronous risk
reads and immediately before commit, so shutdown, revocation, quarantine or a
settings change can prevent activation. No request JSON supplies these facts.
Shutdown rejects new requests, drains authenticated requests and worker work,
then closes private stores and releases only its own lock. The authentication
skill informed reuse of the existing session rather than a new login system.

The full local suite passed **580 tests, zero failed, three skipped** (583
total, including the existing untracked local probe). All **38** runtime and
preparation/execution cases passed on VPS Node 22.23.1 in the network-disabled
dynamic-user sandbox. Coverage includes the real CLI/loopback boundary, shared
authenticated state, identity-read shutdown, revocation after readiness resolves,
forged evidence/uncertain entry rejection, and explicit activation of an unfunded
fixture through the real callback. Only ephemeral unfunded identities and mocked
identity/RPC/builder/submission responses were used. No production bot activation
or real transaction signing/submission occurred.

Final hash-verified artifacts under
`/opt/jamddmaj-perps/checks/runtime-controls-91277b4cce3d/`:

- Runtime tests: `91b68626a956380611ccbcb6a0ab4220ec0b2d0f4caa50a193ea5723840a36a9`.
- Preparation tests: `91277b4cce3decd8b8c89df844fae4fe248bc4a0de1adf6001d853168f90a372`.
- Worker CLI: `e3a09aee5182210c5d81869fdd8c768aaadb9637ab482db09a1ae62c63dbc860`.

The production controls process was not replaced. Source composition does not
prove production provisioning/admission/shared-state ownership, real owner backup,
app activation UI, orphan-exit cleanup, manual futures, identity-route publication,
APK publication or device end-to-end behavior. Those remain required.

## CLI access recovery and verified web publication, 2026-10-19

The owner completed the local Vercel login. CLI 64.7.0 confirmed user
`jamddmaj1`, team `jamd-dmaj-s-projects` / `team_JORXYGzaQKli6kcSkgcGRU33`,
and explicit project inspection confirmed `jamd-dmaj` /
`prj_MDNgTRQMQhZHy0Np4HuKiqTKbsjd`. This resolves the operational access
blocker through the CLI; it is not proof that the separate connector's cached
authorization changed. No login credentials or token files were read.

Before release, production inspection identified the October 13 deployment
`dpl_F9RMK47ZTA8fvoho41X5gQdHTxHU` behind `www.jamddmaj.com`. Its missing
identity route was the concrete transport break. The new secret-free prebuilt
packager uses the existing web build and Edge runtime, preserving all existing
29 API routes, 57 web assets, and global security headers. No runtime migration,
financial worker or schedule is introduced. Builds receive only OS executable/
temporary-directory variables, not service/session/provider credentials; Edge
runtime variables are declared by source-derived names, never embedded values.
The fresh candidate directory contains only generated static/function artifacts,
public project IDs and private provenance metadata outside the public static
tree. It excludes native edits, screenshots, local keys and untracked probes.
This is not a signing CI run or a remote install/build with secrets.

Candidate source: `ce8658938c05d2dea0d625319fea41c59a04cb00`.
Private local packaging directory:
`C:/Users/JamdDmaj/Desktop/jamddmaj-trading-release/.perps-build/vercel-ce86589-candidate`.
Manifest SHA-256:
`dc4bdb7cfc592f7a8a9e8f4fcce99e7d7577d7702fe29925e4b8f3de84da2428`.
Full local tests: **582 passed, zero failed, three skipped** (585 total,
including the existing untracked local probe, which is not a committed CI case).

The prebuilt candidate was staged with production environment and `--skip-domain`
as `dpl_6XNJNzMK5z3essSVKpVAwS715u7L`:
`https://jamd-dmaj-6jyxrh81d-jamd-dmaj-s-projects.vercel.app`.
Vercel still assigned its team convenience alias automatically. The custom
`www` domain was confirmed unchanged, and the convenience alias was explicitly
restored to the exact previous deployment before testing. Protected requests
used the CLI's own deployment-protection support; its automatically generated
project bypass credential was not printed or read, and protection was not
disabled. An initial CLI call misplaced `--cwd` as a curl argument and failed
before reaching the route; the corrected calls used the candidate working
directory and global scope before `curl`.

The staged homepage returned 200 with the existing security headers, status
returned 200 with `ready:true` / `webVersion:1.37.99`, and identity returned the
application's JSON 401 `login-required` both without a bearer session and with
an invented invalid fixture session. It did not return a protection login page,
404, or a fabricated authenticated account. No real user's session was accessed.

After those checks, the exact staged production deployment was promoted without
rebuilding. Explicit inspection of `https://www.jamddmaj.com` now resolves to
`dpl_6XNJNzMK5z3essSVKpVAwS715u7L`, READY. Public fetches verify homepage and
`/lib/perps-control-client.js` byte hashes equal the candidate manifest. Public
status returns 200; public identity returns JSON 401/no-store rather than 404.
The VPS also reaches that fixed identity URL over normal verified TLS. HTTPS
and controls remain active; Bitget remains inactive/disabled, and control health
still reports all financial/provisioning capabilities false.

This publishes the **web and Edge API update only**, not an Android APK or the
financial runtime. The owner was asked to use the existing authenticated
`Consultar servidor` action and report its message, without activation/funding
or sharing session values. The owner subsequently reported the exact result:
`Your account does not yet have a provisioned exclusive wallet. Do not deposit into a test address.`
This is user-observed evidence that the installed app's authenticated control
read now reaches the no-owned-wallet state, consistent with disabled production
provisioning. It is not evidence of wallet creation, recoverable custody,
execution readiness, or an independently inspected authenticated response.
No session token or account identity was requested or inferred from this report.
Production custody/admission and backup, runtime installation, app activation,
orphan-exit cleanup, manual futures and device/Android verification remain open.
No transaction was signed/submitted or production bot activated by this release.

## Public feature discovery request, 2026-10-19 (local, not deployed)

The owner requested that all visitors can see application options, while keeping
private information isolated. Public navigation must not be confused with
operator administration or financial authorization. No owner allowlist was
introduced for browsing and no existing session/ownership boundary was removed.

The main sidebar now exposes Signals, Futures, Automation and Assets without
secret brand taps. Finance routes accept only known public section names;
Automation opens the existing Futures section with its configuration expanded.
URL fields cannot select an account, grant readiness, or activate anything.
Legacy global operator controls remain hidden/authorized; they are not a user's
personal trading settings and must not become public merely through UI changes.

Verification: 13 focused route/build/API tests pass, including two verified
fixture accounts reading only their own controls and rejected cross-account
mutations. A fresh 390x844 headless Edge context, without saved sessions or
wallets, verified the actual built menu, direct Automation and Assets navigation,
and Signals entry without hidden taps. All upstream network requests were
blocked; local API calls returned explicit unavailable fixture responses. The
private legacy server stayed hidden, no `/v1/automation` request was made by
navigation, and there were no page JavaScript errors. This browser check proves
public discovery, not live market feeds, custody availability or trading.
The full local `node --test --test-reporter=dot tests/*.test.mjs` suite also
finished with exit code 0. This includes existing optional/platform skips and
the unrelated pre-existing untracked probe; it is not a remote CI result.

This source change has not been published to Vercel or packaged into a new APK.
Production custody and execution remain disabled. No production account or
wallet was created, no keys were accessed, and no transaction was signed/sent.

## Shared runtime custody composition, 2026-10-19 (source and isolated tests)

The durable worker can now explicitly opt into the existing authenticated
custody coordinator with `--controls --custody-setup`. The new setup flag is
rejected without the HTTP control boundary and is absent from the uninstalled
maintenance service template. The runtime option `custodyProvisioning` is a
strict boolean, false by default, independent of execution approval. Startup
still requires reviewed existing stores and a master key: it never bootstraps
missing financial state or creates a wallet just because the process starts.

When opted in, each authenticated session can explicitly consent to creating
its own distinct encrypted wallet through the same durable controls used by
the worker. Setup retains paused/disabled controls and returns all three gates
false: backup verification, funding availability and signing readiness. Lost
responses and runtime restarts reuse the exact owner wallet and revision. A
shutdown while session verification is pending prevents subsequent custody
creation and immediately stops advertising setup availability.

Verification: the full local test suite exited 0. On the actual VPS Node
22.23.1, **15 runtime tests passed, none skipped**, including the real CLI,
two-user setup, restart idempotency and shutdown race. They ran as a transient
DynamicUser unit with PrivateNetwork/PrivateTmp, ProtectSystem=strict,
ProtectHome, NoNewPrivileges, UMask=0077 and MemoryMax=384M. No outside network
or funded accounts were available to the tests. Test source SHA-256:
`c84f910654338f641f25506fb5b8f425bb7fd41bbb8bab02260039f79c48c518`.
Worker CLI source SHA-256:
`7aeb1bb4b14da1e68f4e14099b12b1b846ffb9e47040265baefcb115afff01ee`.
Bundled test/worker directory:
`/opt/jamddmaj-perps/checks/runtime-setup-c84f91065433/`.

This is not installation of the production worker or permission to accept
deposits. Production initialization/admission capacity, real wallet backup and
off-host restore proof, execution integration and live-feed verification remain
required. Production controls and HTTPS were confirmed active, with the legacy
Bitget executor still disabled. No production custody was provisioned or bot
activated by this check.

## Explicit initialization and installed maintenance worker, 2026-10-19

`scripts/perps-runtime-initialize.mjs --approve-empty-runtime <private-dir>`
now performs one-time operator-only initialization. It refuses nonempty targets,
missing approval, insecure ownership/modes and existing state. Exclusive writes
create the master key and empty controls/journal/backup stores, never an owner
wallet. A durable incomplete marker blocks runtime startup after a partial
failure; neither startup nor a repeated initializer repairs or rotates keys.
Its success response keeps funding, backup and signing gates false.

Five initialization tests passed on actual VPS Node 22.23.1, with none skipped,
inside a network-isolated DynamicUser transient unit. Test source SHA-256:
`89cb010432ae008638897be2a2a23140d6ef0f460c524d374408e23d063d0507`.
The initializer bundle SHA-256 is
`a74cd4c878fa81b7cf8b6c0047eceb04f51ba7ef8d776fa75ae8c22999589c85`.
The Windows targeted run initially hit the existing numeric-inode comparison:
NTFS identifiers observed on this PC exceed Number's safe integer range.
Runtime store uniqueness now uses exact BigInt file IDs; targeted tests pass.

The first real initialization attempt refused systemd's root-owned compatibility
symlink `/var/lib/jamddmaj-perps-runtime` before creating any files. A separate
read-only DynamicUser probe confirmed both the alias and its canonical private
directory were empty. Initialization then succeeded against the canonical
`/var/lib/private/jamddmaj-perps-runtime` directory. Worker environment handling
maps only this exact known systemd StateDirectory alias to that private target;
arbitrary symlinks still fail normal private-path validation.

The approved empty runtime state now exists on the VPS, including a newly
generated private master key, but **zero owner wallets, zero configured accounts
and zero enabled accounts**. This master/state has not yet received an off-host
recovery archive; no deposits or custody admission are enabled. The initializer
was a one-shot explicit command, not an automatic startup step.

The new `jamddmaj-perps-worker.service` is installed, enabled and running in
maintenance mode, with no `--controls` or `--custody-setup` argument. It does not
bind a public or loopback control port, replace Caddy routes or activate any bot.
The existing controls service remains unchanged. The installed worker bundle
SHA-256 equals the local built bundle:
`a848838778e558abc50faabbc95cdd094d125a54ab75260c72ba16392258a1a5`.
Unit verification passed. systemd reported ActiveState=active,
SubState=running, ExecMainStatus=0 and NRestarts=0. The worker's actual durable
status reports `WORKER_CYCLE_COMPLETE`, maintenance, signing false and activation
requested false. Read-only inspection also confirmed the old controls store has
zero configured accounts; it has not been migrated or deleted.
Two live status reads advanced `observedAt` from 1792449054150 to 1792449084197
with the service still running and NRestarts=0, confirming successive real
maintenance cycles rather than only an old status file. The final full local
test suite exited 0 after the canonical-path and inode fixes (platform/optional
skips remain; this is not a remote signing CI run).

Remaining installation work: preserve/migrate existing control quotas and state,
cut over the authenticated control boundary to this same worker store, establish
bounded custody admission, and verify the actual owner wallet's off-host backup
before funding/signing readiness. The installed daemon is maintenance
infrastructure, not completed financial execution or a new app publication.

## Shared production control boundary cutover, 2026-10-19

The worker now supports an operator-configured canonical private
`controlsDirectory`, with the same ownership/mode/schema checks as its local
store. Production uses the **original** database at
`/var/lib/private/jamddmaj-perps-controls/controls.sqlite`, not a copied or reset
database. Wallet/journal/backup state stays under
`/var/lib/private/jamddmaj-perps-runtime`. The service runs as the existing
controls DynamicUser with both StateDirectories; explicit server-only paths
avoid ambiguity in systemd's colon-separated StateDirectory environment value.
Future recovery archives must use this actual external controls path, not the
unused empty `controls.sqlite` left in the runtime root by initialization.

The service now starts `--controls`, still in maintenance with execution approval
false and without `--custody-setup`. The old standalone controls listener is
stopped/disabled to prevent a competing port listener after reboot. HTTPS now
Requires/After the shared worker. No Caddy routes, DNS, certificate-trust settings, application
session credentials or financial activation settings were changed.

Deployment preflight required zero configured accounts, no wallets, no journal
reservations and a maintenance status. Before touching the active services, the
first attempt failed because the rollback parent directory did not yet exist;
both services were confirmed still active and that directory was created.
Prior unit/binary and aggregate database metadata were then preserved privately
at `/opt/jamddmaj-perps/backups/controls-cutover-20261019`. The original database
file identity and aggregates remained identical across cutover: zero configured
accounts, one quota row, three quota requests. No account identity or session
token was read to obtain those aggregates.

The first external check correctly detected connection refusal on 443: the old
HTTPS unit still required the retired controls service and had stopped with it.
The HTTPS dependency was updated to the shared worker and the service restarted.
Two new regression cases verify this dependency graph and that the installed
composition cannot enable custody or execution. Actual public TLS requests then
returned health 200/no-store with all financial/provisioning gates false;
anonymous and invented invalid-session automation reads returned JSON 401;
allowed-origin preflight returned 204. No authenticated production mutation or
real financial request was made.

Sixteen runtime cases passed on the actual VPS in a network-isolated DynamicUser
unit, including reuse of exhausted per-account quotas. A further Windows run
exposed another pre-existing rounded-inode comparison in runtime recovery;
database identity checks in that helper now use exact BigInt IDs too. The
corrected runtime passed the same 16 isolated Linux cases. The final installed
worker bundle SHA-256 is
`ab8d823437b863dd45449d75f2d2bfd269b92ae3bdc50f63034c49a8354583a8`.
Source runtime test SHA-256:
`3cf7a6711e279273d28931b97acc187c035ba23e70d3b5974fdc48c559d9cbfd`.
Artifacts: `/opt/jamddmaj-perps/checks/shared-controls-3cf7a6711e27/`.

This connects the app's existing authenticated API to the worker's controls; it
does not prove a new real authenticated device read, fund a wallet, authorize
signing, enable custody admission, publish an APK or complete trading.
The existing HTTPS isolation test was updated to require the new dependency;
all original certificate-isolation and no-custody/no-execution assertions remain.
Its three cases and the two new service-graph cases passed after that update.
The final full local test run exited 0. Post-install checks confirmed worker and
HTTPS both active/running with NRestarts=0, a fresh maintenance cycle, no signing
readiness and no activation request. Platform/optional test skips remain; no
remote APK/signing CI was run or bypassed.

## Bounded consented custody admission enabled, 2026-10-19

The single-host runtime now uses a synchronous bounded custody coordinator,
under its existing exclusive worker lock. Initial admission is limited to 20
private wallet-directory entries, conservatively including orphan records and
unexpected files; this is not a distributed quota. Valid existing owner mappings
and persisted owner-indexed wallets can still be recovered at capacity, without
rotating a key or resetting saved limits. A failed controls write therefore
cannot permit unbounded new key creation. New owners at capacity receive a
bounded 503 `custody-capacity` response. No account identity comes from JSON.

The base service remains maintenance-only. An optional operator drop-in changes
only ExecStart to `--controls --custody-setup`; it does not change execution
approval, secrets, session verification or financial readiness. The first enable
attempt did not confirm readiness and restored the previous binary/command.
Journal inspection showed no worker startup error. A subsequent attempt checked
the actual loaded command and bounded live readiness; it confirmed setup true
on its first observation. Recovery copies remain under
`/opt/jamddmaj-perps/backups/custody-admission-20261019` and its `-b` sibling.
No wallet was created by either deployment command.

The installed drop-in is
`/etc/systemd/system/jamddmaj-perps-worker.service.d/20-custody-setup.conf`.
The installed worker SHA-256 equals the local built artifact:
`bfcb959b5734fcb0b87c2ceacc193e7793f20bc1f29ec2821d019068bc99a16c`.
Normal public HTTPS health now reports custodyProvisioningAvailable=true while
executionAvailable=false and tradingEnabled=false. Anonymous reads and a setup
POST bearing an invented invalid session both return JSON 401. The deploy-time
aggregate still showed zero stored owner-wallet files. No real session was
borrowed, fabricated, or inferred from request-quota rows.

Verification: 25 runtime/provisioning cases passed on actual VPS Node 22.23.1,
none skipped, in a network-isolated DynamicUser transient unit. The full local
test suite exited 0, with the existing optional/platform skips. Runtime test
source SHA-256:
`8a217cf8a1f39802fb92cb26542317835f216a5ca833fc0dda642349786b7132`.
Provisioning test source SHA-256:
`9d0badabfd8fb56b681836aa3ea708028719185ae3617930ac3ed1f1f7e54894`.
Artifacts: `/opt/jamddmaj-perps/checks/custody-admission-8a217cf8a1f3/`.

The owner has been asked to use their real session to read controls, review their
own limits, explicitly confirm separate custody if still desired, and press
Prepare bot wallet, reporting only the resulting message. They were told not to
deposit, activate, or share keys/codes. This actual owner-wallet setup and its
off-host encrypted restore proof remain unverified. Setup always returns
fundingAvailable=false, backupVerified=false and readyForSigning=false and keeps
the account paused; enabling admission is not funding or execution readiness.

## Actual owner recovery verified, 2026-10-19

The owner reported successful authenticated preparation of the exclusive wallet,
paused and awaiting backup. An operator archive of the actual production wallet,
master and runtime snapshots was encrypted to the existing PC recovery recipient.
Only the public recipient was placed on the VPS; the private recovery identity
remained on the PC, outside the repository. Archive SHA-256:
`2c450aa90600680163e0fc744325a58f38298a8ad6c7e2dbf13144ed131f78d7`.

The encrypted archive was copied into the private PC recovery directory
`production-bot-20261019-3AXFGU5E`. Restoration with real Windows ACL enforcement
recovered the matching public wallet and runtime snapshots into a quarantined
directory with trading disabled. Its private restore proof was returned to the
VPS and accepted by the actual production backup registry, under the same
DynamicUser identity and with network access disabled. The verifier returned
OPERATOR_RESTORE_VERIFIED, walletCount=1, backupVerified=true,
readyForSigning=false and activationRequested=false. This was not the earlier
unfunded fixture proof. No financial transaction was signed or submitted.

Automatic cleanup of the temporary restored directory was rejected by execution
policy before it ran. The restored copy and proof therefore remain in their
private, quarantined PC directory alongside the encrypted archive; do not claim
that only the encrypted copy remains. No private key or proof token was printed.

Post-verification public health still reports controls-only, tradingEnabled=false
and executionAvailable=false. Worker and HTTPS are active; the legacy Bitget
executor remains disabled. Registry verification does not itself enable deposits,
funding, execution or activation. The current app setup response does not yet
reflect the operator registry's verified backup state.

Local-only form diagnostics now identify and focus the invalid field, expand
advanced controls when needed and retain the existing canonical validation and
risk limits. Required capital and margin minimums match the server. Invalid
settings do not send a provisioning request or change consent/settings. The
focused tests and final full local test run exited 0 with existing optional and
platform skips. These UI changes have not been published to web or Android.

## Private recovery status connected, 2026-10-19

Authenticated GET controls now include an informational recovery projection for
the durable owner/wallet binding. The runtime reads its actual backup registry;
the API requires the private, fresh registry proof rather than accepting a plain
backupVerified boolean. The projection contains only the owner's wallet, bounded
stage, verification timestamp and false funding/signing flags. Archive identity,
owner hash, restore token and proof handle are never serialized. Missing/revoked
proof stays unverified; an empty account does not query another wallet's backup.
The existing authentication, rate quota, no-store and ownership checks apply.

The local client adds readStatus without changing read's return contract, checks
the recovery-wallet binding, refuses funding/signing claims and rechecks the
session after the request. The local panel explains verified backup separately
from execution. An older server's missing projection is unknown, not verified.
Refresh failure clears the account display; revocation removes verified status
on the next read. No polling, auto-provisioning or activation was added.

The initial new full-flow test failed because its synthetic health response
omitted ok=true; fixing the fixture to match the real health contract made the
flow pass without weakening client checks. The focused run passed 48 cases with
three existing platform skips; the subsequent full local test suite exited 0.
The web asset build succeeded. The registry/API/client/panel flow and composed
runtime registry flow also both passed on actual VPS Node 22 in a network-isolated
DynamicUser unit, with temporary unfunded wallets and no skipped selected cases.
Artifacts: `/opt/jamddmaj-perps/checks/recovery-status-20261019/`.

The backend bundle was installed after checking the old artifact hash, paused
accounts and loaded service command, preserving the actual controls database
inode. Its SHA-256 is
`04dac73bfb767bdd24bb437e259e11c6532d4bb19aa142a4a71e23a69831458b`.
Previous binary: `/opt/jamddmaj-perps/backups/recovery-status-20261019/`.
Worker and HTTPS returned active; normal public HTTPS health returned 200 with
controls-only, executionAvailable=false and tradingEnabled=false. Anonymous
controls returned JSON 401 and no-store. No actual owner session was borrowed
for a production authenticated read. The new UI remains local-only: no Vercel
promotion, push, Android signing or APK publication was performed in this step.
This closes the backup-status data path, not the remaining execution/exit,
funding readiness, activation or release requirements.

## Native orphan-exit discovery proof, 2026-10-19

Official references checked read-only:
[PositionRequest lifecycle](https://developers.jup.ag/docs/perps/position-request-account),
[Perps API cancellation schema](https://perps-api.jup.ag/v1/docs), and
[official CLI close/cancel usage](https://github.com/jup-ag/cli/blob/main/docs/perps.md).
TP/SL cancellation is a separate transaction action; neither a missing index row
nor the position disappearing alone permits forgetting a recorded live request.

The closure reader now has a separate readServerPerpsExitCleanup discovery path.
It first proves the finalized full entry exit (or whole-position closure), then
reads the recorded request accounts at a finalized bank no older than the risk
snapshot. Every surviving request is decoded against the original wallet,
position, custody, mint, request PDA, counter, size, kind and trigger price. A
still-present executed request is not accepted as its own orphan sibling. The
result has a distinct private proof identity, an expiry, an immutable pending
request list and readyForSigning=false. Copies are invalid, and the execution
journal's closure method rejects this cleanup proof instead of releasing risk.
The ordinary closure reader still requires every recorded request to be absent.

Tests now derive actual fixture request PDAs instead of arbitrary request keys.
They cover overlapping same-pair entries, whole-position closure, both directions
and all supported markets, partial/failed/unrelated exits, stale banks/proofs,
altered native identities/amounts/options, and unchanged reserved capital. All
19 selected closure/native-exit cases passed on VPS Node 22 in a DynamicUser
transient unit with PrivateNetwork and temporary unfunded stores; none skipped.
The full local test suite also exited 0, with existing optional/platform skips.
Artifacts: `/opt/jamddmaj-perps/checks/exit-cleanup-discovery-20261019/`.
Source hashes: closure test
`c39d8db83e1fdbf6c5964eed5562bc0c6e96ff80e072fdd1f5f5a8cb244676ea`,
native exits test
`e31224d2308ba1d85b5c080d0e3b6b4c1fc2a2af0e998ab69be368ed434fe44b`.

This is discovery evidence, not cancellation authority or a completed cleanup
workflow. No cancellation builder was called, no real financial signature or
transaction was produced, and no new worker/UI/APK was deployed in this step.
Remaining work includes exact cancellation-wire inspection/simulation, narrowly
scoped authorization, durable one-send/restart reconciliation and finalized
absence before the journal can release an entry's risk. Production remains on
the previously installed recovery-status bundle, with execution disabled.

## Cancellation wire inspection, 2026-10-19

Added a separate no-authority inspection boundary for one proven orphan request.
It requires the distinct fresh cleanup proof and a selected pending request from
that proof, verifies the API-signed/owner-and-keeper-unsigned envelope, resolves
v0 lookup tables through the existing bounded mainnet resolver, and binds the
minimum bank slot to the finalized orphan observation. The entry preparation
path shares that resolver; its prior capability/intent checks remain mandatory.

The supported closePositionRequest/closePositionRequest2 layouts come from the
[IDL sample linked by Jupiter's developer documentation](https://github.com/julianfssen/jupiter-perps-anchor-idl-parsing/blob/main/src/idl/jupiter-perpetuals-idl-json.json).
Inspection permits one exact close instruction, bounded compute settings and at
most one idempotent creation of the owner's derived USDC ATA. It binds the
request, request USDC ATA, owner USDC ATA, pool, position, keeper and event/program
identities, checks writable roles (including close2's writable keeper), and rejects
transfers, updates, opening instructions, additional closes or foreign writable
accounts. The resulting immutable private inspection proof still explicitly
requires same-wire simulation, fresh orphan evidence and a durable cancellation
record. It cannot sign, submit, release journal risk or be replaced by a copy.

Seventeen closure/cancellation tests passed, with no skips, on VPS Node 22 under
network-isolated DynamicUser and unfunded temporary fixtures. They include
legacy/v0, old/new close layouts, correct signer mutability, optional owner ATA
creation, all role substitutions, duplicate/wrong instructions, network/table
failures and unchanged journal risk. The final full local suite exited 0 with
the existing optional/platform skips. Artifacts:
`/opt/jamddmaj-perps/checks/exit-cancellation-inspection-20261019/`.
Policy source SHA-256:
`b47b215342023c48af6a7f8cbfe95a04599f7584ea358edd5281e87fa2886302`.
Closure test SHA-256:
`8117723f86837ea6fb6d9e507d2830ca214f0c3fb951c5fe8ae3934fbd55488b`.
Synthetic cancellation helper SHA-256:
`e50a97ac35819331f6acdb6364e537235e0650dc2f5ad78066e75ffdafe7b795`.

Compatibility with a real current Jupiter cancellation response is not yet
proven by these synthetic tests. A bounded public-chain read-only observation
found no matching cancellation among nine decoded transactions and then received
RPC -32015; it stopped without further reads, signatures or submissions. No
real owner's cancellation builder was called. The inspection feature has not
been installed into the production worker or released to the app. Full effects
simulation, precise authorization, durable one-send/restart handling and
finalized request absence remain required before automatic cleanup is usable.

## Exact-wire cancellation effects simulation, 2026-10-19

Implemented a separate read-only simulation gate after the private cancellation
inspection proof. It uses the original owner/keeper-unsigned wire, sigVerify=false
and replaceRecentBlockhash=false, as supported by the
[Solana simulation RPC](https://solana.com/docs/rpc/http/simulatetransaction).
It checks the mainnet genesis, nondecreasing bank slots, inspected block height,
the [same-message fee](https://solana.com/docs/rpc/http/getfeeformessage), compute
budget and the absence of simulation errors or blockhash replacement. Inspection
now owns an immutable metadata/intent snapshot rather than borrowing a mutable
builder response. The existing entry simulation snapshot normalizer is reused.

Before simulation, the recorded native orphan is decoded again at the newer
bank, the fixed pool has its program owner/discriminator checked, and a surviving
position must decode to the same derived identity. After simulation, the request
and its USDC account must be closed. All request USDC must be credited to the
owner's derived USDC ATA, with no delegate/native-token/foreign-close authority.
An existing owner's token account cannot otherwise change. A new owner ATA has
an exact bounded rent calculation. The SOL payer delta must equal recovered
request/token rent minus the actual message fee and any added owner ATA rent.
Pool, keeper and position snapshots must remain unchanged. No unexplained
lamport/token difference is accepted. These expected effects are intentionally
not a claim that current live Jupiter responses have already been validated.

The immutable result has a distinct private identity and readyForSigning=false;
copies or expired inspection/cleanup evidence are rejected. It does not invoke
a builder, signer, transaction sender, activation method or journal closure.
Finalized absence and a durable authorized one-send lifecycle remain mandatory.

All 19 closure/inspection/simulation cases passed on actual VPS Node 22 in an
isolated DynamicUser transient unit with networking disabled, temporary unfunded
wallets and no skips. Cases include empty/nonempty request tokens, an existing
or new owner ATA, legacy/v0 wires, surviving/closed positions, altered balances,
owner/program fields, native counters, request closure, fee/height/slot failures,
simulation errors, compute limits, replacement blockhash and expired proof.
The final full local suite exited 0 with existing optional/platform skips.
Artifacts: `/opt/jamddmaj-perps/checks/exit-cancellation-simulation-20261019/`.
Simulation source SHA-256:
`8cd9b1ba875727deaafe3aa3dac489d8d229064a6744aa23dc66b2d1cbb8b237`.
Closure test SHA-256:
`6d8fd897b883684f6621fa056e2276210ab094215ece4c2e38994d51f63475d7`.
Fixture helper SHA-256:
`aaabdcae2c3593fbd0017ba57085f83b718fd9189edea3507a2b9eff4f5ca852`.

This step did not simulate a real owner's cancellation against mainnet, sign or
submit a real financial transaction, activate the bot, change production service
flags, or release an app/worker update. Runtime cleanup integration, live unsigned
compatibility, authorization and crash-safe cancellation reconciliation remain
incomplete; trading readiness is still not established.

## Durable cancellation restart ledger, 2026-10-19

Added a separate cancellation-attempt table within the execution journal. A
fresh private simulation/inspection/cleanup chain must match the exact durable
OPEN entry, signed entry identity, original exit plan and request binding before
SIGNING is persisted. It grants no signing permission. Only one unresolved
attempt per wallet and one non-failed attempt per request can exist. Signed
identity is recorded as UNCERTAIN before any future send capability. A duplicate
identity is rejected, including after a finalized failed attempt.

Restart recovery queries only recorded signatures and requires finalized,
identity-verified receipts. Missing history, timeout, confirmed-only status and
SIGNING without a known signature never clear the record or prepare a retry.
A finalized failure permits a new separately recorded, freshly simulated attempt;
there is no replacement-builder or sender in this recovery module. Even a
successful finalized cancellation leaves the parent entry OPEN. Its capital can
only be released by the separate finalized-closure proof, after all requests are
absent at a bank at least as new as every recorded cancellation confirmation.

The executor's maintenance path now reconciles these attempts before deciding
whether entries may run. Pending cancellation records also block reservation,
entry signing revalidation and activation checks. Conversely, cancellation setup
cannot race a SIGNING/UNCERTAIN entry. No cancellation signer or sender has been
connected; the runtime still cannot perform a complete automatic cleanup.

Recovery snapshots preserve the cancellation records. The new exact journal
schema hash is
`60e023d5a9fa36ae45b37402ad3956d2a9a8ab906b7df143f96d7ed89802591f`.
The previous known journal schema remains accepted for encrypted backup/restore,
but is refused by the new runtime startup preflight without migration. Startup
does not silently upgrade production. Cancellation wallet/entry/request bindings
are checked in backup inventory. Before deploying this worker version, an
explicit paused-store migration and a newly verified complete backup are still
required. The actual production stores were not changed in this step.

Three new selected durable/recovery cases passed on actual VPS Node 22 in a
network-disabled DynamicUser transient unit with unfunded temporary state; none
skipped. Tests cover independent connections, crashes before/after signature
identity, duplicate attempts, unknown/confirmed-only/finalized outcomes,
unreleased parent risk, native-absence ordering, encrypted restoration and
legacy preflight refusal. Test signatures use deterministic unfunded fixture
keys, never the real owner's wallet. The final full local suite exited 0 with
existing optional/platform skips. Artifacts:
`/opt/jamddmaj-perps/checks/exit-cancellation-journal-20261019/`.
Journal source SHA-256:
`d508324a2da912962c0236efc4ee62343394fbb78d868f61b537056413e95349`.
Cancellation recovery source SHA-256:
`ec68c0ed2325ca2b67402f98cd8439149e61497612135056e32c297b0ffa9ba6`.
Runtime recovery source SHA-256:
`291b27dd229a75a984a8286a5deea243fd1d373e7984a08057cd0ccce98a77b7`.

Normal production HTTPS health was rechecked: 200, controls-only,
executionAvailable=false, tradingEnabled=false. No production migration,
activation, real signature, financial submission, app release or worker
installation occurred. Narrow cancellation authorization/key-use, one-send
transport, non-trade cancellation daily-account handling, live unsigned
compatibility and final integrated release verification remain incomplete.

## Separate cancellation-only custody authority, 2026-10-19

Added a distinct two-second, one-use private cancellation grant, separate from
entry signing. It binds the simulated wire, exact SIGNING cancellation row,
original OPEN entry identity/exit plan, owner control revision and the actual
verified backup proof. A live execution-runtime callback must approve; a plain
boolean or UI readiness value is not accepted. Paused-entry controls can still
permit proven orphan cleanup, without enabling new entries or closing positions.
Unknown entry attempts or competing cancellation records block the grant.

The pending native request and request USDC account are re-read twice around a
fresh, privately verified chain-account read. Their exact identity, refund tokens
and recovered rent must still match simulation. SOL must cover the simulated
fee, any added owner ATA rent and a 1,000,000-lamport reserve. Mainnet identity,
minimum slots and block height remain checked. Controls, backup, runtime state,
native proof and bank freshness are rechecked after asynchronous reads.

The vault exposes only the new purpose-specific signExitCancellation method,
not a message/transfer signer or seed export. It consumes the distinct grant,
checks restore quarantine before and after decryption/signing, and changes only
the owner signature slot. Output verification checks the exact untouched message,
API bytes and empty keeper slot and verifies the owner signature. A separate
private signed-output handle is required for any future broadcast. Copied,
spent, expired, foreign, revoked or quarantined capabilities fail closed.

Three new selected cases passed on VPS Node 22 in a network-disabled DynamicUser
unit with no skipped selected cases. All custody records and signatures in these
tests use deterministic synthetic fixture seeds and temporary unfunded state;
no real owner's wallet or recovery identity was read. They cover grant copies,
cross-purpose use, one-use consumption, exact output bytes, revoked backup,
runtime refusal, account/owner substitution, low SOL, stale grants, changed native
state/control revision during reads, and restored-wallet quarantine. The initial
full local run failed only the old exact vault-method allowlist assertion; that
test now explicitly permits this narrowly scoped method and separately rejects
plain readiness objects, generic message signing and seed export. The subsequent
full local suite exited 0 with existing optional/platform skips.
Artifacts: `/opt/jamddmaj-perps/checks/exit-cancellation-authority-20261019/`.
Authorization source SHA-256:
`1c2caa88128bcd81004c029d7134afd4ce0a5b75c364a39e9742180dc81bb647`.
Vault source SHA-256:
`614e2d60801ec279415096c3c555d6af6f91f2aac24a31fab3905ab84db1a604`.
Closure/authority test SHA-256:
`66ff9231e5dfff00fca08d7199b964a55117d94367472d7b62ecf531141f9926`.

The actual runtime/executor does not yet call this new signing method. No
production migration, worker/app release, real signature, financial submission
or bot activation occurred. The cancellation broadcaster, complete coordinator,
daily-account non-trade handling, live unsigned compatibility and integrated
deployment verification are still required; this is not trading readiness.

## One-attempt cancellation broadcast boundary, 2026-10-19

Implemented a separate cancellation broadcaster with no implicit live transport.
It accepts only a private owner-signed cancellation handle from the same journal,
owner and control revision. Before recording an attempt, it repeats the private
native request/token/rent, chain account, runtime, control, backup and expiry
checks bound into the authorization. Submission arguments cannot replace those
readers or choose a URL, action, wallet or raw signed wire.

The exact signature and pre-keeper wire hash are durably UNCERTAIN before the
single injected transport attempt. A failed write stops transmission. Concurrent
callers cannot both transition the SIGNING record. The fixed request is POST
`https://perps-api.jup.ag/v2/transaction/execute`, action cancel-tpsl, without
cookies, redirects, caching or fallback/retry. Replies are bounded to 4 KiB with
an eight-second abort. Only the exact action/signature acknowledgement is
recognized; exceptions, non-200 responses, malformed content and wrong replies
remain unknown. Even an acknowledgement leaves the attempt UNCERTAIN and the
parent entry OPEN, pending finalized chain reconciliation and request absence.

The [public API documentation](https://perps-api.jup.ag/v2/docs) was rechecked;
it documents cancel-tpsl but still advertises v1 server URLs even when retrieved
under /v2/docs. The pinned v2 route is consistent with the app's existing Perps
integration, not proof of live cancellation compatibility. No execute endpoint
was called during verification.

Four new selected broadcaster cases passed on VPS Node 22 inside a DynamicUser
unit with networking disabled, no skips and temporary unfunded synthetic
wallets. All transport calls were in-memory mocks. They cover exact payload and
write-before-send ordering, one attempt, concurrent calls, unknown/error/HTML/
oversized/malformed/wrong acknowledgements, foreign/copied handles, revoked
backup, changed controls/native state, stopped runtime and persistence failure.
The full local suite exited 0 with existing optional/platform skips.
Artifacts: `/opt/jamddmaj-perps/checks/exit-cancellation-broadcast-20261019/`.
Broadcaster source SHA-256:
`16a01e4f6bd26efc603b11e9e0eaa119317e75feac6327845b0d1a03da2b4239`.
Authorization source SHA-256:
`f16be26759f4148cf02de00a59c2d5ca0a8f6cc3a2cb1c2cabd6e68fbb623038`.
Closure/broadcast test SHA-256:
`50773e6061aab870bcb9afcbbb876718db85360ee59086a61941c1cd0df33b91`.

The worker still does not call this broadcaster. No production schema migration,
app/worker installation, real signing/submission or bot activation occurred.
Remaining integration includes the bounded cleanup coordinator/unsigned builder,
daily accounting for non-trade cancellation transactions, a safe pre-sign failure
lifecycle (so async validation cannot strand a never-signed attempt), live
unsigned compatibility, paused migration/new recovery verification and the full
manual/automatic trading and release audit. Trading is not yet ready.

## Execute-only cleanup coordinator and provably unsigned failures, 2026-10-19

Integrated a bounded one-request coordinator into the execute-mode runtime and
executor. It obtains a finalized private orphan proof from a journalled entry,
prepares the exact request through a fixed bounded unsigned DELETE /v2/tpsl
builder, checks owner/request metadata and transaction version, then runs wire
inspection, effects simulation, authorization, purpose-specific custody signing
and the one-attempt broadcaster. Each asynchronous boundary rechecks controls,
backup and runtime readiness. Existing pending entries/cancellations or unknown
position evidence block dispatch. One cycle never continues into a new entry
after a cleanup attempt. A surviving sibling is handled in a later reconciled
cycle, not an unbounded batch of sends.

Maintenance/read-only execution has no coordinator or cancellation signer;
mode execute still needs explicit process configuration and an actually running
worker. Pausing new entries does not prevent cleanup of an already-proven closed
entry's orphan. It does not activate the bot or request closure of open positions.
The native funding reader used for cleanup is distinct from daily entry-risk
accounting. Worker reports whitelist only bounded result stages, not wallet data.
The backend guidance was used to retain the existing persistent single-host VPS
and private SQLite design, not move custody into stateless Vercel requests.

Cancellation records now begin PREPARED, which cannot reach any key. Successful
authorization atomically persists SIGNING only after asynchronous checks finish;
a second authorization for that SIGNING attempt is refused. PREPARED failures
can be cancelled safely by the coordinator or restart recovery; SIGNING and
UNCERTAIN cannot. This avoids stranding never-signed attempts when an RPC check
or proof lease expires before authorization. Both entry reservation/signing and
activation see PREPARED as pending risk work.

Latest journal schema hash:
`0f4ab1216a89d4d32e97af1c98707943d2add7702150ba577f206fe19f9a41d7`.
Both recognized prior schemas remain recoverable, but startup requires this
latest schema and will not migrate production implicitly. The actual VPS stores
were not upgraded. The earlier staged cancellation schema was never installed
in the production worker.

Seven selected cases passed on VPS Node 22 in a network-disabled DynamicUser
unit, with no skipped selected tests. They cover the complete mock-builder/
mock-send coordinator path with encrypted synthetic custody and verified backup,
safe unsigned failure cleanup, retained signing/transport uncertainty, default
runtime isolation, explicit execution requirements, encrypted recovery and
maintenance versus execute dispatch. The full local suite exited 0 with existing
optional/platform skips. Artifacts:
`/opt/jamddmaj-perps/checks/exit-cleanup-coordinator-20261019/`.
Coordinator source SHA-256:
`65a0a96908f8822c5beaf1d5ebf8811dc850c9963d93fe6c9064c2da5718690e`.
Journal source SHA-256:
`85500cb105af266aefa44c7a88e03ac87636e83afd6a973c8d340bbbce7eb5df`.
Authorization source SHA-256:
`9545b6f1ca28e63a4ba9bf6552f1c1046f437e224c681355b2388ef9e1928ba9`.

No real cancellation builder/execute call, financial key use, bot activation,
production migration, worker installation or app release occurred. Remaining
audit includes daily-account handling of non-trade cancellation receipts,
cached-template rejection before re-signing a previously failed attempt, live
unsigned compatibility, paused schema migration with a fresh verified recovery
archive, and the complete manual/automatic trading and publication requirements.
These mock-flow tests are not a claim that production trading is ready.

## Cached cancellation rejection before key use, 2026-10-19

Cancellation preparation now persists a hash of the exact canonical unsigned
wire (including API signature, with owner/keeper slots still empty). A partial
unique index reserves that hash for every state except CANCELLED. SIGNING,
UNCERTAIN, CONFIRMED and even finalized FAILED attempts cannot reuse it. A
never-authorized PREPARED attempt explicitly discarded as CANCELLED can reuse
the wire, because no key-use capability could have existed in that state.
Both the signing transition and private grant recheck the stored unsigned hash
against the actual simulated inspection, preventing a different wire from being
substituted into an existing PREPARED row.

The integrated coordinator test now finalizes a synthetic cancellation failure,
receives the same cached builder wire again and rejects it before a second vault
call or transport attempt, leaving no ambiguous SIGNING row. A genuinely new
synthetic blockhash/message is separately simulated and may prepare the next
attempt. A reopened journal retains the deduplication identity; the existing
signed-hash/signature uniqueness guards remain in place.

Latest journal schema:
`cba66ff21abc8f2dd3db1bbebbbc3908a9d8cda2fa24b41a2191e184c5477e54`.
The previous PREPARED schema joins the recognized backup/restore-only legacy
set. Runtime startup still refuses implicit production migration. The backend
architecture guidance was reapplied to retain the existing private VPS store;
no Vercel storage or custody migration was introduced.

Four selected cases passed on actual VPS Node 22 in a network-disabled
DynamicUser unit, no skips, using temporary unfunded synthetic custody and mock
transports. They cover cached failure rejection, fresh-message acceptance,
unsigned recovery, persisted identities and encrypted recovery compatibility.
The full local suite exited 0 with existing optional/platform skips.
Artifacts: `/opt/jamddmaj-perps/checks/cancellation-wire-once-20261019/`.
Journal source SHA-256:
`54f430735ae6c2aa1dca48751c7061d760485864bae57fb7bcbbb60a445f796e`.
Inspection source SHA-256:
`1a0126e12b57fc8c4af7293b8020f35ffedf8f69b865e62c9118b25a2132369b`.
Authorization source SHA-256:
`1afa4ca88ea232eee15bf19507a5748ae754272321390911e69e4c42b05a7940`.

No production migration, worker/app release, real financial key use, submission
or activation occurred. The next accounting boundary must not simply allow all
event-less Perps transactions: an accepted non-trade cancellation needs exact
finalized signed-wire/journal binding, strict cancellation account policy and
actual token/SOL effect verification, with its network fee retained in daily
accounting. Live unsigned compatibility, a reviewed migration/new recovery
proof, complete manual/automatic functionality and release remain unverified.

### Finalized cancellation accounting (2026-10-19, source only)

Finalized receipts now retain a private immutable copy of signed wire, resolved
keys and actual RPC metadata. A cancellation without trade events is accepted
only when its owner/keeper wire hashes match the durable cancellation row, its
parent and request match the recorded exit plan, the shared native cancellation
policy passes, and actual SOL rent/fee and USDC effects match exactly. Other
event-less Perps operations remain rejected. These proofs cannot authorize
signing, substitute for a trade exit or release a journal reservation.

The daily reader retains the cancellation network fee and does not increment
trade count or market P/L. Individual-entry closure accepts the separately
branded non-trade claim, including in request-index historical reads; native
request absence and durable reconciliation are still required. SOL network fees
are still reported separately, not converted into the USD daily-loss budget;
that risk-accounting boundary remains unfinished. Prefunded non-token owner
ATA creation is not supported and conservatively fails validation.

Two selected integration cases passed on actual VPS Node 22 in a network-disabled
DynamicUser unit, with temporary unfunded synthetic custody and injected mock
transports. Cases cover exact effects, altered fee/balance/owner/missing or
duplicate metadata, journal-hash mismatch, private-proof copies, immutable RPC
evidence, strict refusal without a journal, daily fee/trade totals and finalized
entry closure. Artifacts:
`/opt/jamddmaj-perps/checks/cancellation-accounting-20261019/`.
The full local test glob also exited 0 with existing optional/platform skips.
No production schema migration, worker/app publication, real financial key use,
transaction submission or activation occurred. Read-only production checks
confirmed the exclusive-wallet backup is accepted and health still reports
controls-only, tradingEnabled=false and executionAvailable=false.

### Network fees in the daily USD risk budget (2026-10-19, source only)

The runtime composition now supplies a bounded read-only SOL/USD fee valuation
reader to both finalized accounting and the exclusive-custody risk overlay.
For each authenticated finalized receipt paid by this wallet, including failed
transactions and non-trade cancellations, it charges actual lamports times the
Coinbase SOL-USD closed-minute high, rounded upward to integer USD micro-units.
This is an explicit risk valuation convention, not an execution price or proof
of a universal market-price upper bound. Market P/L and protocol fees remain
conservatively charged separately. Standalone diagnostic readers without the
valuation dependency still explicitly report networkFeesIncludedInUsdLoss=false;
the production runtime does not omit this dependency.

Only exact matching one-minute buckets are accepted, at least five seconds
after their end. Missing, partial, malformed, duplicated or substituted buckets,
an unavailable service, response overflow, or an expired proof cannot supply
zero expense. Requests are GET-only to the fixed public Coinbase endpoint,
without credentials, redirects, custody addresses or transaction signatures.
Only validated closed historical prices are cached within the UTC day; daily
totals, receipt identities and ten-second freshness evidence are rebuilt.
This deliberately may delay new entries until a recent fee's minute is closed.
The pending/new transaction's future fee allowance remains a separate risk
boundary to review before declaring the full lifecycle complete.

Reference: https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles
The initially checked Pyth Hermes price-update endpoints returned HTTP 401;
no key was requested, provisioned or bypassed. Coinbase returned HTTP 200 from
both PC and VPS. A live public-price read with an unfunded synthetic receipt
passed the real parser. This does not establish real trade execution.

All 15 selected accounting/valuation cases passed on VPS Node 22 in a
network-disabled DynamicUser unit, without skips. They include a durable risk
reservation that passes without network fees but fails specifically with
DAILY_LOSS_LIMIT when fees are included, plus bad service data, copies, expired
proofs, failed receipt charges, and exact source/request constraints.
Artifacts: `/opt/jamddmaj-perps/checks/network-fee-valuation-20261019/`.
The full local test glob exited 0 with existing optional/platform skips.
No production migration, installed-worker replacement, app release, real
financial signing/submission or bot activation occurred; actual health still
reports controls-only, tradingEnabled=false and executionAvailable=false.

### Live unsigned boundary and exclusive-wallet funds display (2026-10-20 UTC)

Read-only mainnet account inspection confirmed the approved exclusive bot wallet
has zero USDC, zero SOL and no open positions. An unsigned 10-USDC SOL-short
preparation request returned HTTP 422 simulation_error, Anchor 3012 specifically
on funding_account (AccountNotInitialized). A smaller USDC diagnostic on the
owner's separately funded main wallet returned collateral_size_below_minimum
and explicitly required at least $10 collateral for new positions. No deposit,
activation, owner signature, financial execute endpoint or on-chain submission
was performed. These are concrete compatibility/funding boundaries, not a
successful complete futures rehearsal.

A separate SOL-funded main-wallet diagnostic returned HTTP 200 and passed the
three-signature structural decoder. Its native SOL system transfer was rejected
by the existing USDC-only server capability policy as designed. That diagnostic
does not establish USDC intent/funding correctness or justify permitting generic
system transfers. No wire was persisted and production minimums were not lowered.
Reference: https://perps-api.jup.ag/v2/docs (versioned request contract still uses
the documented /v1/positions/increase endpoint and x-perps-api-version: v2).

Authenticated automation GET now optionally projects a fresh independently
branded native account snapshot for the wallet in the verified owner's durable
controls. Unknown sessions, foreign-wallet reads and denied quotas cannot invoke
the funding reader. RPC failure, copied evidence or mismatched identity yields
an explicit funds-unavailable object without invented zero balances. Replies
expose only public balance units, configured margin, chain observation and
insufficient-collateral information, never private recovery material or trading
authority. fundingAvailable and readyForSigning remain false even if collateral
is sufficient. Existing authentication, custody approval, risk and activation
gates are unchanged; no new identity provider was installed.

The client binds balances to its returned wallet and configured margin, checks
integer units and rejects forged readiness or contradictory sufficient-funds
flags. The automation header now shows that actual exclusive-wallet USDC
snapshot, while the server section gives SOL and margin context. Refresh,
changed settings or failed requests clear the previous display; unavailable
balances remain unknown rather than borrowing the main/Phantom wallet balance.
This was guided by the authentication skill's server-side ownership/session
verification principle, keeping the established JamdDmaj session ledger.

Four selected cases passed on VPS Node 22 with DynamicUser and PrivateNetwork,
no skips. They include the actual composed runtime -> authenticated API ->
fixed-origin client -> panel path, only mocked unfunded read-only RPC responses,
ownership denial, bad metadata and no financial transport. Artifacts:
`/opt/jamddmaj-perps/checks/exclusive-funds-status-20261020/`.
The full local test glob and web build exited 0 (existing optional/platform
test skips remain). These source/UI changes are not published or installed.
Production schema migration, current unsigned full-amount USDC compatibility,
pending fee allowances, native/manual execution and final publication still
require verification; no complete execution-readiness claim is made.

### Native manual funding preflight (2026-10-20, verification pending)

Source inspection confirmed the manual ticket already routes to native review
and an independently bound biometric confirmation; it is not a generic WebView
signer. Its live preparation now first reads the derived owner USDC ATA and SOL
payer in one confirmed mainnet bank, bracketed by genesis identity checks. The
bank must be at least the requested minimum slot; incomplete, noncanonical or
unsafe token accounts cannot become zero or available collateral. USDC below
the exact requested margin and zero SOL produce separate bounded native UI
messages. No automatic swap, deposit or signer is introduced. Having positive
SOL is only an early check; exact fee, rent, full same-wire simulation and
biometric checks remain mandatory afterward.

A standalone Java 21 harness using synthetic public account bytes passed local
compilation and execution. Added Android integration tests exercise the derived
bank and identity/slot/encoding failures; full Android compilation and those
Robolectric cases still require the native CI job, since this PC has Java but
no configured Android SDK. A dedicated non-release verification branch is used
for that check, rather than triggering the permanent-key APK workflow on the
main development branch. No APK release or execution-readiness claim follows
from the standalone harness.

### Verified native CI and live-copy journal rehearsal (2026-10-20)

Native CI for source `b6419c270cddc51d7c0f96760b61fa5c583624c7` completed
successfully: https://github.com/JamdDmaj1/JamdDmaj/actions/runs/39397214316
The Android unit/RPC-failure step, cryptographic encoding checks, APK compilation,
manifest isolation and preview identity checks all passed. This was the dedicated
`codex/perps-funds-preflight-validation` branch, not the signed main-app release
workflow or an installed user update. This supersedes the pending native-CI
status above, not the remaining complete execution requirements.

Added an operator-only paused-empty legacy journal upgrade rehearsal. It locks
and snapshots the existing reviewed controls/journal, requires paused accounts
and zero reservations/bindings/consumed events, upgrades a fresh private copy,
and checks the exact current schema. Unknown schemas, active controls or even
cancelled historical reservations are refused; this is deliberately not a
generic financial-row migration. Copies are removed only from the freshly
created verified temporary child. The helper never replaces live stores, reads
custody keys, enables controls, or invokes a financial transport.

Both selected cases passed on VPS Node 22 in a network-disabled DynamicUser
unit. A rehearsal using the actual private production stores then passed with
the existing service UID and explicit StateDirectoryMode=0700. It found one
paused account and zero reservations, source schema
`f4c79e669461914ff30fe59063f6ca11270d951600fc320c6ce87dcd616ca786`, target
`cba66ff21abc8f2dd3db1bbebbbc3908a9d8cda2fa24b41a2191e184c5477e54`.
Source snapshot SHA-256:
`7ba2ce003d0c8a1496548ee3adc3b2fc47495590758386a021c2a3393359878f`;
candidate snapshot SHA-256:
`46f319d5a7e5c798863b77e1c0b6f324b8d866a369715512b6024bdc98686831`.

The initial transient-unit invocation omitted StateDirectoryMode=0700 and
returned an unavailable result. The retry with the correct explicit mode passed.
The worker reported one restart; subsequent checks confirmed active/running,
both private directories at 0700, and health controls-only with execution false.
A final independent read confirmed the LIVE journal still has the old source
schema, zero reservations, and zero active accounts. No live schema replacement,
key access, financial signing/submission or activation occurred. The full local
suite exited 0 with existing optional/platform skips. Artifacts:
`/opt/jamddmaj-perps/checks/journal-upgrade-rehearsal-20261020/`.
Actual migration, new verified recovery archive, worker installation, manual
closing lifecycle and full current-amount unsigned compatibility remain pending.

### Paused empty journal upgrade operator (2026-10-20)

The explicit operator upgrade uses the same reviewed cancellation DDL as normal
journal initialization, without accepting caller SQL. It acquires worker.lock
in the worker's actual private RuntimeDirectory, freezes controls and journal,
requires the exact known source schemas, all accounts paused, no financial rows,
and fresh privately branded verified-backup evidence for every mapped account.
It writes private WAL-aware rollback copies and rehearses the candidate before
applying DDL in one SQLite transaction. Controls and custody keys are not changed.
Backup proof is checked again before COMMIT. A post-COMMIT verification failure
retains the worker lease for operator review rather than allowing a blind restart.
Successful structural migration still requires a new verified recovery archive
and does not grant trading or funding authority.

Four synthetic cases passed on actual VPS Node 22 in a network-disabled
DynamicUser unit, no skips: preserved rollback files/control state; active,
nonempty, foreign, unbacked and already-locked refusals; proof loss after DDL
rolling back schema; and competing coordinators yielding only one upgrade.
The full local suite also exited 0 with existing optional/platform skips.
Artifacts: `/opt/jamddmaj-perps/checks/paused-journal-upgrade-20261020/`.
Candidate maintenance worker SHA-256:
`3dfc332b8d4f4a45185fba6e95e306fd7aa501a1b5b08f7e2673ba838d607e19`.
The actual installation result is recorded separately below, not inferred from
these tests or the prepared artifact.

### Production paused cutover and renewed off-host recovery (2026-10-20)

The approved empty production journal was upgraded with the explicit operator
tool after stopping the worker. The HTTPS service also stopped through its
existing dependency, then both were restarted after installing the tested worker.
No execution flag, owner activation or custody identity was changed. The operator
reported one paused account, zero reservations, controlsChanged=false and
custodyKeysRead=false for the structural migration. Final independent read-only
inspection confirmed the live target journal schema, zero reservations,
zero cancellation attempts and zero active accounts.

Actual installed worker, source `daba21d` plus its preceding reviewed commits:
`/opt/jamddmaj-perps/worker/perps-server-worker.mjs`, SHA-256
`3dfc332b8d4f4a45185fba6e95e306fd7aa501a1b5b08f7e2673ba838d607e19`.
Previous worker is retained at
`/opt/jamddmaj-perps/backups/paused-journal-upgrade-20261020/worker-before.mjs`
with SHA-256 `04dac73bfb767bdd24bb437e259e11c6532d4bb19aa142a4a71e23a69831458b`.
Private SQL rollback copies and the admission manifest remain in
`/var/lib/private/jamddmaj-perps-runtime/jamd-journal-upgrade-xvwVTL/`.
Rollback must use the matching schema/runtime pair, never restart an old worker
against a schema it rejects. No automatic rollback or database replacement was
performed.

The first immediate post-start health request preceded HTTP readiness; the same
service was rechecked without restarting it. Actual health then returned HTTP
200 controls-only, executionAvailable=false, tradingEnabled=false; unauthenticated
automation returned HTTP 401. Both services were active, NRestarts=0 for the new
worker, and custody setup remained separately available. This is an installed
backend update, NOT a new Android APK or Vercel frontend publication.

A new v3 encrypted archive includes the actual upgraded runtime and the existing
exclusive wallet. It was downloaded to the approved private PC recovery folder,
its SHA-256 matched, and a full local quarantined restore recovered the same
public wallet and paused runtime. Archive SHA-256:
`fcf1692e777bb60b6c59a17a8cc829fea277b172ab53e56f67559701bacc0ce6`.
Encrypted PC copy:
`C:\Users\JamdDmaj\AppData\Local\JamdDmaj-Recovery\production-bot-20261020-upgraded-3AXFGU5E\bot-wallet.age`.
The private restored test copy and proof remain under `restored-QUARANTINED`;
this does not claim that the encrypted archive is the only local recovery data.
The operator identity never left this PC; no key bytes or proof token were
printed. Only the opaque proof file was returned privately to the VPS.

The live registry accepted the matching proof as OPERATOR_RESTORE_VERIFIED,
walletCount=1, backupVerified=true, readyForSigning=false and
activationRequested=false. A final independent read confirmed one accepted
backup for the exact new archive. All real financial signing, transaction
submission and bot activation remain prohibited during verification. Feed
configuration, pending/new fee allowances, manual closing lifecycle, current
funded-amount unsigned compatibility and final app publication still require
completion; this cutover is not a complete trading-readiness claim.

### Dedicated production read-feed connection (2026-10-20)

The installed maintenance worker initially lacked JAMDDMAJ_CLIENT_FEED_TOKEN.
The legacy configuration also had no dedicated feed token. Vercel production
metadata confirmed the dedicated variable was absent while the feed correctly
returned HTTP 401 without credentials; no cron/admin or Telegram secret was
extracted or reused. The environment-variable and CLI skill guidance was used
to confirm the existing team/project and keep credentials out of source, public
bundles, process arguments and chat output.

The operator provisioner creates one root-private feed credential file, without
rotating an existing valid value or accepting unrelated legacy configuration.
Its 32-byte random token is used only for the existing read-only client-feed
route. It was streamed privately into Vercel stdin as a Production-only Secret,
not pulled back, printed, added to preview or included in a repository artifact.
The exact server-only file is `/etc/jamddmaj-perps/feed-access/client-feed.env`.
The optional `ops/jamddmaj-perps-read-feed.conf` loads that file without changing
mode, execution approval, custody identity or owner settings. Two credential
cases passed in an isolated network-disabled VPS unit, and composition checks
plus the existing feed/filter cases passed locally. The full local test glob
also exited 0 with existing optional/platform skips (the subsequently added
drop-in composition case passed its targeted run).

For activation of the environment variable, the previous reviewed secret-free
prebuilt WEB candidate was reused, not the incomplete newer application source:
source `ce8658938c05d2dea0d625319fea41c59a04cb00`, manifest SHA-256
`dc4bdb7cfc592f7a8a9e8f4fcce99e7d7577d7702fe29925e4b8f3de84da2428`.
All 116 candidate output files were independently checked against its manifest.
The deployment/access-protection skills guided staging production without domain
assignment, verifying with existing Vercel authentication (never disabling
protection), and promoting only the tested artifact.

Actual NEW production deployment: `dpl_BPVXgUAHrMomJSEHozF2C6aRf25r`, READY,
https://jamd-dmaj-pst7ytkcx-jamd-dmaj-s-projects.vercel.app and
https://www.jamddmaj.com . Build duration 9 seconds, post-build 5 seconds.
This supersedes deployment 6XNJ for WEB configuration only; source/assets are
unchanged, and it does not publish the newer Android APK or local UI changes.
The staged feed accepted the dedicated token and passed the actual Jupiter
selector; credential-free feed and identity GETs returned 401. The actual Finance
page `/private-simulator.html` and `/` returned 200. `/finance.html` is not an
application route and returned 404 in the initial smoke check; no route was
changed or assumed working on that basis. The production domain stayed on the
old deployment during staging, then inspection confirmed the new deployment
after explicit promotion.

Installed drop-in:
`/etc/systemd/system/jamddmaj-perps-worker.service.d/30-read-feed.conf`.
After its maintenance-only restart, an isolated one-shot process used the
EnvironmentFile to call the real fixed production GET route and reported
READ_ONLY_SIGNAL_FEED_CHECK, available=true, remotePaused=false, eligible=0,
rejected UNSUPPORTED_MARKET=3. Those were three actual open signals, not invented
test trades; none matched Jupiter BTC/ETH/SOL. No scanner, cron, Telegram send,
builder, activation, signing or financial execute endpoint was called.

Independent process-state inspection confirmed the credential is loaded,
maintenance mode remains true, execution approval remains false and there are
zero active accounts. Both worker/HTTPS services were active; new worker
NRestarts=0, public health remains controls-only/executionAvailable=false and
the retired Bitget executor remains inactive. A one-hour Vercel error scan was
unavailable due to plan retention; the supported five-minute query returned only
a summary and no error records. This is not a claim of complete historical
monitoring or configured drains. The dedicated read credential is deliberately
separate from the wallet recovery archive and can be independently rotated if
the server is replaced. Full trading lifecycle and app release remain pending.

### Full-position close intent and instruction-data gate (2026-10-20)

A new read-only mainnet query at confirmed slot 459186694 verified the
program-owned Anchor IDL account and the same raw IDL SHA-256 recorded above.
The fixture now records both instantDecreasePosition layouts, their 22 account
roles and Borsh fields. The official v2 API documentation describes
POST /v1/positions/decrease with an explicit entirePosition flag; no close
builder or financial endpoint was called during this work.

`lib/perps-server-close-intent.js` plans a full close of exactly one position
from the existing private, fresh native account proof. It selects USDC as the
recipient token, preserves the observed position identity and rejects copied
or expired proofs and absent/foreign positions. LONG sell-floor and SHORT
buy-ceiling limits use inward micro-USD rounding and explicit bounded slippage.
The instruction-data check accepts only the two confirmed discriminators,
exact full-close wire lengths, Some(true), bounded redundant position deltas
and a signed request time within the freshness interval. Unknown instructions,
partial closes, trailing bytes and one-micro-unit tolerance violations fail.

Five new local tests passed, the neighboring account/opening-intent tests
passed, and the full local Node test glob exited zero. These are synthetic
unfunded tests and a read-only IDL observation, not successful live closing.
The new module is deliberately NOT connected to custody signing or the Android
UI yet. Account-role/custody/oracle/token checks, exact-wire simulation, durable
close accounting, native review/biometric integration and funded unsigned
compatibility still need completion before a real close can be authorized.
No new APK, worker deployment, activation or financial transaction occurred.

### Close envelope and custody-account inspection (2026-10-20)

`lib/perps-server-close-bindings.js` connects the full-close plan/data gate to
the existing canonical three-signer/API-cosignature envelope decoder and
independent lookup-table resolver. It requires the provider position to equal
the selected, fresh native position before RPC access, then fetches the
program-owned custody accounts in one confirmed bank no older than the
resolved transaction. Mainnet genesis is checked around those reads.

Both close variants bind all 22 roles to the derived owner USDC recipient,
position, pool, transfer/perpetuals/event authorities, actual decoded market
and collateral custody vaults/oracles, known programs and USDC mint. The
optional referral must be the absent-account program sentinel. Variant 2's
request/USDC ATA are derived using the existing decrease-request PDA seed
convention and its exact counter. A funded positive close still needs to
confirm full builder/program compatibility; synthetic vectors do not prove it.

The gate requires native writable capabilities for recipient, position,
custodies, vault and request accounts and forbids signer-role substitution.
Oracle role write upgrades are explicitly left for the subsequent oracle
policy, not silently treated as authorization. It permits exactly one Perps
core instruction; extra opens, closes or pre-swap instructions fail. Caller
structure is copied before asynchronous derivations; the original account
proof is checked again at completion.

Twelve focused local tests passed, including all three markets/two directions/
two variants, every core role substitution, unsafe capabilities, copied or
expired proofs, wrong-network/stale/missing/foreign/disabled custody snapshots,
and an in-flight mutation. Four synthetic exact-envelope integration cases
exercise the real decoder/resolver and custody read sequence without a network
or financial transaction. The neighboring account/custody/preparation runtime
suite also exited zero (40 tests at that run). These results remain
FULL_CLOSE_INSPECTED_NOT_AUTHORIZED: complete oracle/token/side-effect policy,
same-wire simulation, durable close lifecycle, native confirmation and actual
funded unsigned compatibility are still required. No deployment, account
activation or real financial signing/submission occurred.

The full local Node test glob also exited zero after the binding/permission
implementation; the final added mutation regression passed in the subsequent
twelve-test focused run. This does not imply Android compilation or a published
APK for these server-only changes.

### Exact-wire close position/recipient simulation (2026-10-20)

`lib/perps-server-close-simulation.js` now consumes a privately branded close
inspection, not an object with a matching public stage label. The inspection
remains bound to the original fresh native position proof and immutable exact
API-cosigned, owner/keeper-unsigned envelope. It records every writable account
in the pre/post snapshots, checks mainnet, increasing bank slots, block-height
expiry before/after simulation, the fee for the exact message and the explicit
compute limit. simulateTransaction uses the original wire, sigVerify=false and
replaceRecentBlockhash=false; no substitute transaction or refreshed message
is accepted.

The native before-position must exactly match the originally selected decoded
position, including timestamps, collateral, size and identity. After simulation,
the selected position must be closed or retain a valid native zero-size,
zero-collateral record with a non-regressed timestamp. The receiving account
must be the owner's initialized, undelegated USDC token account; its balance
cannot decrease. Returned USDC is the actual simulated delta, not the original
margin or provider quote. Zero proceeds remain representable as a complete
loss, not invented reimbursement. The private snapshot evidence is immutable,
non-copyable and invalid once the underlying position-proof lease expires.

Sixteen focused tests passed, including synthetic exact-envelope simulation,
all prior close gates, incomplete closure, remaining collateral, a changed
before-position, wrong recipient authority, recipient loss, absent snapshots,
stale banks, unknown fee, expired blockhash, wrong network, failed simulation,
substituted blockhash, excessive computation, clock expiry and copied proofs.
These are unfunded fixture simulations with no real wallet signing or send.

This remains FULL_CLOSE_POSITION_AND_RECIPIENT_SIMULATED, readyForSigning=false,
tradingEnabled=false. Snapshot collection does NOT yet validate every pool,
oracle or other writable-account side effect, token setup or rent/SOL movement;
the result explicitly requires those checks and durable close accounting. No
custody signer consumes it. Complete native review/confirmation, funded unsigned
compatibility and app publication still remain; production was not changed.

The full local Node test glob also exited zero after this simulation
implementation. The final additional expiry/fee/network regression was verified
in the subsequent sixteen-test focused run; no Android build or live funded
close was implied by these results.

### Evidence-driven correction: close plus collateral post-swap (2026-10-20)

Before implementing rent/SOL accounting, a bounded read-only scan of finalized
public Perps history found a successful close whose Perps sequence was
setTokenLedger -> instantDecreasePosition -> swapWithTokenLedger. The observed
transaction was at slot 459191845, signature
`5eCUbVqkL9sVM6xooWGBDC3ixBZ9Be7ioutazcNz13GCQDkPXTKKShHLwxzDiCqbMAMMTqdVKxeT8mFQmQKEF43j`.
It closed USDC-collateral exposure and converted the resulting amount to SOL;
the close instruction's USDC receiving account was therefore not the final
requested token. This is public third-party historical evidence, NOT our own
wallet or a submitted test. A subsequent bounded eight-transaction scan found
no additional close; it did not establish positive LONG-to-USDC compatibility.

The earlier one-core-only/always-direct-USDC candidate was insufficient for the
requested complete lifecycle. A new program-owned confirmed IDL read at slot
459192018 returned the same recorded raw IDL hash and confirmed
swapWithTokenLedger: discriminator 8b8deec529d3ac13, 16 bytes, minAmountOut u64,
17 account roles. Its layout and the public observation are now recorded in
the security fixture. Official API reference remains
https://perps-api.jup.ag/v2/docs; the official CLI also documents closing with
an explicit receive token at https://github.com/jup-ag/cli/blob/main/docs/perps.md.

The close binding candidate now distinguishes the native collateral receiving
account from the final owner USDC ATA. LONG-to-USDC requires a single ledger
before the close and the bound collateral-to-USDC swap after it. All 17 swap
roles are pinned to independently decoded collateral/USDC vaults and oracles,
the original owner, derived ATAs/authorities and the same ledger. Ledger identity
cannot alias funds, positions, custodies, vaults, oracles or request accounts.
SHORT-to-USDC keeps its direct path. Both native custody snapshots are fetched
for either direction. Variant-2 request ATA derivation follows the core's
collateral mint; actual funded variant-2 compatibility is still unproven.

The swap's minimum output is reported and the exact-wire simulation must meet
it in final USDC, not intermediate collateral. This does NOT establish that a
provider-supplied zero minimum is an acceptable risk policy: the inspection
explicitly requires a separate minimum-return check before signing. No custody
signer consumes these candidate results. The observed USDC-to-SOL transaction
would not be authorized by the USDC-final-receipt path.

Nineteen focused synthetic tests passed, including LONG complete-envelope
inspection/simulation, every swap-role substitution, missing/duplicate/reordered
ledger and swap, malformed data, copied custody and insufficient final USDC.
An initial added minimum-output test mutated an old uncaptured fixture instead
of the captured wire; the test was corrected to build/inspect a distinct wire,
and the intended rejection passed without weakening the production check.
Rent/SOL conservation, complete other-account/oracle/token effects, independent
minimum-return risk, durable close accounting, native UI confirmation and
funded unsigned compatibility remain unfinished. No owned transaction builder,
financial signer/send, bot activation, deployment or app release was invoked.

The full local Node test glob subsequently exited zero with this post-swap
correction in place. That result is not a funded close, Android build or
publication proof.

### Close wallet conservation and connected unsigned preparation (2026-10-20)

`lib/perps-server-close-funding.js` consumes the private exact-wire simulation
snapshots, not caller-supplied balances. It checks the owner's SOL account and
the exact equation: pre-SOL + observed refunded rents - chain-message fee -
new ATA rent = post-SOL. At least the network fee must exist before execution.
Recipient metadata and existing rent cannot change apart from its USDC amount;
new ATAs use independently queried rent, preserving any pre-funded lamports.
Position rent is refunded only when that exact account was actually closed.

For LONG post-swap, pre-existing collateral tokens must remain intact; closing
the empty collateral ATA refunds only its observed lamports. Wrapped SOL's
native reserve/amount/lamports must agree. TokenLedger must remain a real
program-owned 48-byte ledger with unchanged rent and the captured collateral
account/pre-balance. Variant-2 request accounts must be initially absent and
closed at the end; a retained request ATA may hold only zero collateral tokens
at exact rent. Other wallet-owned/delegated/close-authority token accounts in
the writable snapshots cannot change. Extra SOL debits or credits, inflated
rent, altered token authority, reused requests and leftover request funds fail.

`lib/perps-server-close-preparation.js` connects fresh native ownership ->
privately branded plan -> one bounded unsigned provider request -> exact
envelope/custody inspection -> same-wire simulation -> wallet conservation.
The only provider route is POST https://perps-api.jup.ag/v1/positions/decrease
with x-perps-api-version=v2, omitted credentials, forbidden redirects, an
eight-second timeout and 64 KiB streamed response cap. The canonical unsigned
envelope, API cosignature, position, blockhash and block-height format are
checked; provider fee/rent/quote assertions are not used as evidence. There is
no financial execute endpoint, retry, signer or journal mutation in this module.

Twenty-five focused synthetic tests passed locally and as a bundled fixture
on the actual VPS Node runtime. The latter ran under a distinct DynamicUser,
PrivateNetwork=yes, ProtectHome=yes, ProtectSystem=strict, NoNewPrivileges=yes
and a 384 MiB memory limit, without custody state-directory access. The unit
jamddmaj-close-funding-check-20261020 exited status 0 with 25/25 passing. Bundle:
`/opt/jamddmaj-perps/checks/close-funding-20261020/tests/test.mjs`, SHA-256
`430a19383778ace3ec3abb8457090a5805fbe7063fe398d4c18539e155e0233c`.
This is an isolated test artifact, not a deployed worker update. The full
local Node test glob also exited zero. Subsequent read-only service checks
showed worker/HTTPS active and public health controls-only,
tradingEnabled=false, executionAvailable=false.

The connected result remains FULL_CLOSE_SIMULATED_WALLET_ONLY,
readyForSigning=false. Wallet conservation does NOT validate all protocol
pool/vault/oracle effects or all top-level instructions, independently approve
a provider's minimum return, implement durable close/finalization, or provide
native review/biometric confirmation. Transient intra-transaction rent funding
still relies on simulation; this is not a completed future network-fee budget
reservation policy. Actual funded unsigned compatibility, native integration,
final audit and app publication remain pending. No owned live provider request,
real financial signature/submission, activation, APK release or worker restart
was performed for these fixture tests.

### Close instruction boundary and independently bound oracle configuration (2026-10-20)

`lib/perps-server-close-policy.js` now checks the complete top-level instruction
list before simulation in the close coordinator. It rejects unknown writable
accounts, arbitrary token spending/approval, incorrect or early collateral
cleanup, unrelated ATA setup, setup after an account has been used, duplicates
and oracle instructions requesting pool/owner spending capability. Allowed ATA
creation is idempotent and bound to the owner/counter-request's exact mint and
derived account; collateral cleanup is possible only after the LONG post-swap.
This is a capability boundary, not approval of every oracle/protocol effect.

A first candidate allowed only aggregate-oracle writes. Read-only inspection of
the existing finalized public close at slot 459191845 showed that this was too
narrow: DOVES update_many_with_pyth_lazer also writes its configured PriceFeed
and the Pyth treasury. The keeper, not the owner, lost one lamport in that
observation; aggregate-oracle lamports did not change. No transaction was
created or submitted to obtain this evidence.

The independently derived DOVES Anchor IDL account
`4D2RLxRVWjGUp7E45noWC6x7BfmSQbQ4mQevHvTV5ai6` was read with confirmed
program ownership at slot 459304963. Raw IDL SHA-256:
`1ae8e5e335beec1646d5484671d8f07902fb5ac55581c3028701893b998025f5`.
The instruction layouts, aggregate/PriceFeed prefix offsets and constant
accounts are recorded in the security fixture. Live SOL/USDC aggregate PDAs,
mint fields and bumps matched derivation using ['ag_feed', mint]; their configured
Lazer, CL and Redstone feed keys were also observed read-only. Official Pyth
account identities were checked against
https://docs.pyth.network/price-feeds/pro/integrate-as-consumer/svm and
https://docs.pyth.network/price-feeds/pro/contract-addresses.

`lib/perps-close-oracle-context.js` fetches those aggregate accounts from a bank
no older than the exact close inspection, verifies native ownership/PDA/mint/
bump/layout, then fetches the configured PriceFeeds and pinned Pyth storage and
treasury in a no-older bank. It checks mainnet around these reads and binds a
private non-copyable context to the exact inspection and its original lease.
DOVES update roles must then match that context and the official fixed Pyth
identities, not builder-supplied extra addresses. The Borsh message length,
raise boolean, prior Ed25519 instruction index and signature-table index are
bounded; the aggregate update's CL/Redstone/PriceFeed roles must match config.
Simulation now supports an explicit minimum bank slot and the coordinator uses
the oracle-context bank when updates are present.

Thirty focused synthetic tests passed locally, bundled locally, and under VPS
Node in the isolated DynamicUser/PrivateNetwork test unit
jamddmaj-close-policy-check-20261020 (30/30, exit 0). The full local test glob
also exited zero. Fixture bundle:
`/opt/jamddmaj-perps/checks/close-policy-20261020/tests/test.mjs`, SHA-256
`b3268ec64e6c1da27ffb8c740fc5e96fe1d6523e5ca20f083a2fbe7914d3da56`.
The oracle-capability fixture uses a synthetic signed Ed25519 payload and
configured fake accounts: it is NOT a trusted Pyth price message or proof of a
successful native oracle update. All existing unsigned close/funding tests
still pass. No permanent key or execution-enabled runtime was loaded.

The existing VPS Node architecture was retained; no new Vercel platform product
or framework was introduced. No worker/HTTPS restart, secret change, activation,
APK build/release or financial request was made. After isolated tests, both
production services remained active and health returned controls-only,
tradingEnabled=false, executionAvailable=false. Pool/vault and complete oracle
payload/price/post-state validation, independent minimum-return risk, durable
close/finalization, native confirmation, pending-fee budgeting, actual funded
unsigned compatibility and final publication/audit remain incomplete. No
financial signer consumes this capability-only result.

### Close custody/vault conservation and native-SOL compatibility (2026-10-20)

`lib/perps-server-close-vaults.js` is now called by the unsigned close
coordinator after instruction policy, simulation and wallet funding. Its inputs
must be private proofs of the same exact inspection; a policy from a different
transaction cannot be mixed in. It binds pre/post vault token owners to the
derived transfer authority, exact mints and legacy SPL account metadata. USDC
vault debit must exactly equal the owner's simulated USDC increase. A LONG
collateral withdrawal/post-swap must leave the collateral vault's final token
and lamport balances intact; its incremental collateral has returned through
the bound swap, not consumed pre-existing wallet tokens. SHORT's collateral
is USDC, so its net collateral-vault debit is the USDC payout, not zero.

Native before/after custody snapshots must decode to the same exposed custody
configuration/identities as the independently inspected accounts, with stable
length and rent. Pool owner, Anchor discriminator, size and rent are checked.
This does NOT decode all mutable pool/economic counters or every custody field;
the result remains FULL_CLOSE_VAULT_CONSERVATION_ONLY and explicitly requires
pool accounting/oracle effects, independent minimum return and durable closing.

A read-only mainnet SOL/USDC vault observation at slot 459308487 showed that a
strict equality between recorded WSOL amount plus native reserve and account
lamports is not a valid universal invariant. Solana's official SyncNative
documentation explains unsynchronized native deposits:
https://solana.com/docs/tokens/basics/sync-native. The close token decoder now
requires lamports >= recorded amount + reserve, never invents token amount
from excess, and still requires exact before/after metadata/lamport preservation
or an observed zero-token closure/refund. New native ATAs must store the exact
independently queried rent reserve. This changes an incorrect account-model
assumption, not the wallet SOL debit/conservation boundary.

A subsequent bounded read-only native vault-format check at slot 459309934
decoded the real BTC, ETH, SOL and USDC vaults successfully with that decoder
and the derived transfer authority. This is not an owned-wallet close or
proof of funded builder/simulation compatibility.

Thirty-four focused tests passed locally, bundled locally and under VPS Node
in jamddmaj-close-vaults-check-20261020 (34/34, exit 0) with DynamicUser,
PrivateNetwork, ProtectHome, ProtectSystem=strict, NoNewPrivileges and a 384 MiB
limit, without private custody state access. The full local Node test glob
also exited zero. Bundle:
`/opt/jamddmaj-perps/checks/close-vaults-20261020/tests/test.mjs`, SHA-256
`42277b02fec7ddf17e294c710941fa3ec71e81907ea529b24ff3865a3857f142`.
Tests cover six market/direction combinations, vault/custody/pool substitutions,
wrong mint/authority/delegation/program, one-unit unexplained vault changes,
native underfunding, legitimate WSOL excess/refunds and mixed transaction proofs.
The protocol snapshots remain synthetic and do not establish full pool-economic
or trusted oracle-price correctness.

After isolated tests the production worker/HTTPS remained active; health was
controls-only, tradingEnabled=false, executionAvailable=false. No worker
deployment/restart, secret change, financial signature/submission, activation,
Android build or app publication occurred. Pool-economic/oracle-price effects,
independent minimum-return risk, durable close/finalization, native confirmation,
pending-fee budget, actual funded unsigned compatibility and final publication/
audit still require completion. No signer consumes this conservation-only result.

### Reserve release, same-bank snapshots and an unsuccessful public unsigned probe (2026-10-20)

A fresh confirmed program-owned Perps IDL read at slot 459311182 retained the
recorded raw IDL hash. Position decoding now preserves realisedPnlUsd (signed
i64), cumulativeInterestSnapshot (full u128) and lockedAmount (u64), without
floating-point rounding. The native layout offsets and the custody Assets /
FundingRateState offsets are in the security fixture. Official account
semantics were reviewed at:
https://developers.jup.ag/docs/perps/position-account and
https://developers.jup.ag/docs/perps/custody-account. A retained closed position
must clear its size, collateral, locked reserve and realized-PNL record.

`lib/perps-server-close-reserves.js` consumes the private vault/simulation proof
of the same close. The collateral custody must release exactly the selected
position's locked token amount. Other custodies' locked reserves cannot change.
A SHORT removes precisely its size from the market custody's aggregate short
size; unrelated short exposure cannot change. Unrelated short-average values
are preserved, interest counters/timestamps cannot regress, and the selected
position's interest snapshot cannot be ahead of its collateral custody. This
does not reconstruct guaranteedUsd, complete ownership/fees/PnL accounting or
the SHORT weighted-average formula. Those remaining economics/oracle effects
are explicitly not marked complete, and no financial authority is produced.

Review also exposed a consistency flaw in the earlier close simulator: merely
nondecreasing context slots did not make pre-state and simulated post-state
the same bank. Other traders' activity between those banks could contaminate
vault/exposure deltas. The previous synthetic successes were not proof of
live same-bank conservation. The close simulator now gets the exact-message
fee first, then requests pre-state and exact-wire simulation concurrently at
confirmed commitment. It accepts a pair only when both context slots match.
Mismatched pairs are discarded; at most three read-only pairs are attempted,
with the same original wire/blockhash and the existing freshness/compute/fee
limits. Simulation errors are not retried. Failure to pair yields
PERPS_CLOSE_SNAPSHOT_BANK_CHANGED, not a signing-ready result. Private evidence
records both slots, and the vault gate independently requires their equality.
This is RPC confirmed-bank consistency, not a new cryptographic account-state
proof. RPC interfaces reviewed:
https://solana.com/docs/rpc/http/getmultipleaccounts and
https://solana.com/docs/rpc/http/simulatetransaction.

For a bounded compatibility diagnostic, public finalized history was queried
read-only. The primary shared RPC failed during transaction discovery; an
officially documented PublicNode mainnet endpoint was used only for secondary
history lookup after checking genesis. Native account state still came from
the primary RPC; production RPC configuration was not changed. The public
source transaction was
`4qsuChmK8N6NirL8CXTZoYxoQdzNrKCJ4rm2sDXj1dBQ4Q3gbXiFT8mPk4vuzyS4YMzwBA5TeWZG3P1fyNe26v2X`.
It is not an owned account or evidence of a completed trade.

Exactly one unsigned /v1/positions/decrease preparation was requested for a
public example, not the owner's wallet or bot wallet. Its Perps tags were
setTokenLedger / instantDecreasePosition / swapWithTokenLedger. The local
core-intent validator rejected it with PERPS_CLOSE_INTENT_MISMATCH before any
simulateTransaction call: unsigned builds=1, live simulations=0, owner signatures
created=0, transactions submitted=0. The response/unsigned wire was not persisted.
Thus funded unsigned compatibility remains unproven. The precise failing field
was not captured; no price/size/time conclusion is inferred. A local-vs-chain
Clock observation showed one second of skew at that sample, not a broad clock
accuracy guarantee. Core errors now distinguish encoding, whole-position,
size, price and time, without changing any acceptance limit. The next diagnostic
must identify the actual mismatch, not weaken a guard to pass this example.

Forty-five focused tests (close and position suites) passed locally and as a
bundle under the isolated VPS unit jamddmaj-close-reserves-check-20261020
(45/45, exit 0; DynamicUser, PrivateNetwork, ProtectHome, ProtectSystem=strict,
NoNewPrivileges, 384 MiB limit; no private custody state access). The full local
test glob after runtime changes also exited zero; the final layout assertions
were included in the bundled run. Bundle:
`/opt/jamddmaj-perps/checks/close-reserves-20261020/tests/test.mjs`, SHA-256
`68d26b5bccb61a7ae491ec40c41eff120e149051603da6719c53f7fe94f523ed`.
Tests cover six market/direction paths, one-unit reserve/exposure errors,
interest regression, retained reserve/PNL, u128 precision, distinct core error
reasons, same-bank pairing, bounded retries of reads only and no retry of a
simulation error. These fixtures do not prove a successful live close.

Production worker/HTTPS remained active and health controls-only,
tradingEnabled=false, executionAvailable=false. No worker deployment/restart,
secret change, account activation, owner/keeper financial signature, execution
submission, Android build or publication occurred. The unsuccessful unsigned
public probe, remaining economics/oracle validation, independent return risk,
durable closing/finalization, native confirmation, fee budgeting and final
publication/audit still need completion. The goal is not achieved.

### Public unsigned close compatibility and conservative quote headroom (2026-10-20)

A fresh public-example diagnostic now identified the former generic rejection
as PERPS_CLOSE_CORE_PRICE, not a clock, size or whole-position mismatch.
The independently read SOL reference was 106.349904 USD, its 50 bp sell floor
105818155 microUSD, and the provider encoded 105817864 microUSD. The original
wire remains rejected: there is no exception for a small mismatch.

The official decrease endpoint supports maxSlippageBps but has no absolute
price-limit request field (https://perps-api.jup.ag/v2/docs). Its price can
change between the caller's reference read and preparation. The planner now
requests one basis point less than the caller permits, floored at 1 bp. This
provides conservative quote headroom; it does not rebase or widen the caller's
independently calculated absolute limit. For an input of 1 bp there is no
headroom. Larger movement still rejects and there is no automatic builder
retry. A regression covers both directions and 1/2/50/100 bp limits, one-unit
boundary rejection, and the actual observed mismatch above.

Three separate public unsigned preparations were made during this diagnostic
turn: the original mismatch, a post-change response rejected by the strict
envelope gate (the diagnostic's extra decoder also threw; no precise signature
failure was retained), and a final bounded independent preparation. The
envelope guard was not relaxed. No raw response/wire was persisted.

The final public reference read was at confirmed slot 459325579 with SOL
106.287604 USD, position 5vupiyvpiPdTUiDR98zfxA3sLHZvmpBUcB51WuQWbkLs.
The complete prepareSimulatedServerPerpsFullClose path returned
FULL_CLOSE_SIMULATED_WALLET_ONLY: one builder response (1111 bytes), exactly
three signature slots, owner and keeper empty, API cosignature present and
structurally verified. Two same-wire read-only simulations returned no error;
the same-bank retry mechanism was used, not another build or broadcast. The
coordinator's account bindings, oracle capabilities, wallet funding, vault
conservation and exact reserve-release gates all passed. Owner signatures
created=0, transactions submitted=0, readyForSigning=false. This is public
compatibility evidence, NOT an owned-wallet trade, confirmed payout, complete
economic/oracle validation, native close confirmation or production readiness.

Forty-six close/position tests passed locally (exit 0). The complete local
`node --test --test-reporter=dot tests/*.test.mjs` also exited zero after the
change. Source tracing confirms the close coordinator is still not imported
by the production runtime or connected to native UI; the first end-to-end
boundary remains incomplete. Do not interpret the public simulation as app
readiness. Production was not
changed. A separate read-only backup-registry check confirmed the approved bot
wallet's ACCEPTED restore record; health still reports controls-only,
tradingEnabled=false and executionAvailable=false. Remaining close accounting,
native authorization, complete final audit and publication are still required.

### Durable unsigned close preparation and recovery (2026-10-20)

The existing execution journal now records an independently simulated close
preparation in perps_position_closes, in the SAME SQLite database and BEGIN
IMMEDIATE transaction domain as entries/cancellations. The preparation consumes
the private reserves -> vaults -> funding -> same-wire simulation -> inspection
proof chain, not JSON flags or a caller's quote. It binds the exact unsigned
wire SHA-256, wallet, position, observed bank, independently read network fee,
and every OPEN journal entry sharing that position (including original entry
signatures, hashes, confirmed slots and exit plans). Absent/foreign/legacy or
later-than-simulation parents and competing entry/cancellation attempts reject.

This is intentionally only PREPARED/CANCELLED persistence. No close signing,
broadcast or finalization transition exists yet; recording a preparation does
not grant authority to sign. OPEN parent collateral, loss and daily accounting
are NOT released. A wallet-unique PREPARED index and atomic guards prevent new
reservations, entry signing/revalidation, exit cancellation and position release
while a close is prepared. Other connections/restarts observe the same record.
Only a provably unsigned prepared close can be cancelled. Future financial
transitions require a separate reviewed state-machine extension, minimum-return
and full policy proof, one-use custody/native authority and finalized receipt
accounting; none is implied by this preparation record.

Recovery inventory checks close entries against their bound parent wallet,
position and recorded identities. Encrypted backup/restore preserves prepared
and cancelled attempts and continues to force a fresh pause; it never treats
restoration as closure or releases parent collateral. The target journal schema
is now 8200534af55b955bb73f2dd8bd207eeac04b248381885f415e19584e5cebeddd.
The former cancellation-aware cba66ff21abc8f2dd3db1bbebbbc3908a9d8cda2fa24b41a2191e184c5477e54
is accepted as recoverable LEGACY, not silently admitted by new worker startup.
The explicit paused EMPTY operator migration and disposable rehearsal now cover
both that schema and the older f4c79e66 source, verify exact rollback copies and
recheck restore proof before atomic DDL. Historical/active stores still refuse
this bounded empty-only migration. No production migration was performed.

The directed local run passed 66 tests before adding the encrypted-close
recovery case; the full local test glob then exited zero with that case included.
The final bundled 67-test selection ran on the VPS under
jamddmaj-close-journal-check-20261020: 66 passed, zero failed, one Windows-only
ACL case skipped on Linux, exit 0. Its eight-process synthetic entry contention
test used a separately bundled journal module; no private custody state was
accessible. DynamicUser, PrivateNetwork, PrivateTmp, ProtectSystem=strict,
ProtectHome, NoNewPrivileges, UMask=0077 and MemoryMax=384M were applied.
Bundle /opt/jamddmaj-perps/checks/close-journal-20261020/tests/test.mjs SHA-256:
f871194f78fbe1e97dc9b4ffc9c2d70ddbb5c0321a35ca23e6f1d317fc599b56.

The actual production health was rechecked: controls-only, tradingEnabled=false,
executionAvailable=false. Production worker/state, encrypted operator archives,
wallets and activation settings were unchanged; no financial signatures, send,
new Android package or publication occurred. Full close authorization/send/
finalization, native UI integration, complete remaining policy/risk budget,
end-to-end audit and publication remain unfinished. The goal stays active.
