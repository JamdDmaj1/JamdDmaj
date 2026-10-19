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
