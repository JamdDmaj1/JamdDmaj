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

### Exact-bank close oracle price effects (2026-10-20)

The DOVES program-owned IDL was re-read at confirmed slot 459329135. Its
AgPriceFeed and PriceFeed field order agrees with the recorded price/exponent/
timestamp prefixes. Separate public account reads observed aggregate maxAge=10
and maxFeedAge=60, with second-based timestamps close to local UTC, for SOL and
USDC; they are observations, not assumed universal constants. The recorded
layout now includes maxFeedAge's u32 offset 189. Jupiter's primary account
references remain https://developers.jup.ag/docs/perps/custody-account and
https://developers.jup.ag/docs/perps/position-account.

prepareSimulatedServerPerpsFullClose now always obtains privately derived
oracle configuration, including when no update instruction is present. The
same-wire simulator captures both aggregate and configured Lazer accounts in
its paired before/after bank, including read-only accounts. An earlier context
read is not substituted for exact-bank price evidence.

lib/perps-server-close-oracle-effects.js consumes the private reserve/vault/
funding/simulation/policy/context chain for that exact inspection. It preserves
owner, lamports, allocation and ALL serialized oracle configuration/tail bytes;
only the 17-byte price/exponent/timestamp region may differ. Timestamps cannot
regress from context to before-state or before to simulated state; aggregate
age is capped by both native maxAge and 30 seconds, feed age by native
maxFeedAge and 60 seconds, with at most two seconds of future clock tolerance.
Zero raw prices and unsupported exponents reject. Integer lower/upper microUSD
bounds avoid rounding a sub-microUSD price violation into acceptance: a LONG
price must cover the compiled sell floor, and a SHORT price fit the buy ceiling.
The proof remains ORACLE_PRICE_EFFECTS_ONLY: it is not full payload provenance,
all pool economics, minimum-return protection or a financial signing grant.

preparePositionClose now requires this private oracle-effects proof before
durable preparation; an older reserves-only proof cannot bypass price checking.
The journal DDL/hash is unchanged from the previous preparation-only version.
No signing, broadcast or finalized-close state transition was added in this
step; no claimed finalization or payout is inferred from a simulation.

Two independent public unsigned preparations were tested, without owner keys.
The first, source bank 459330304 / reference SOL 105.955670 USD, rejected at the
existing PERPS_CLOSE_CORE_PRICE gate before simulation; no limit was relaxed.
The second, source bank 459330615 / reference 105.824343 USD, passed the complete
current coordinator and oracle-effects check with one build and two same-wire
read-only simulations (bank pairing), owner signatures created=0, broadcasts=0.
The caller sell floor was 105295222 microUSD and compiled floor 105308197.
Simulated oracle intervals were SOL [105817884,105817885] microUSD and USDC
[999821,999822] microUSD, both timestamp 1792521177. Public example position:
5vupiyvpiPdTUiDR98zfxA3sLHZvmpBUcB51WuQWbkLs. It is not an owned-wallet trade.
The same response's swapWithTokenLedger minimumOut was ZERO: do not claim
protected minimum proceeds or clear the remaining minimum-return requirement
merely because a favorable simulation passed. No raw response/wire was saved.

The final full local test glob exited zero. The final bundled close/position/
journal selection passed 61/61 on the VPS under the isolated unit
jamddmaj-close-oracles-check-20261020, exit 0, with DynamicUser, PrivateNetwork,
PrivateTmp, ProtectHome, ProtectSystem=strict, NoNewPrivileges, UMask=0077 and
MemoryMax=384M. No private custody directory was mounted. Bundle:
/opt/jamddmaj-perps/checks/close-oracles-20261020/tests/test.mjs, SHA-256
da3a6d7712bd3fdf36ee01ecfaa924505fd64a82d560cea1b3d19d63e4aebae6.
Tests cover six asset/direction paths, stale/future/regressed/zero oracle data,
configuration/rent mutation, both inward price bounds, missing or foreign
context, old banks, and mandatory price evidence before journal preparation.

Production code/stores and Android release were not changed or published.
The controls-only server remains the installed configuration. Full close
authorization, minimum-return handling/review, remaining protocol policy,
durable financial state/finalization, native integration, fee budgets and final
end-to-end release verification remain outstanding. The goal is not achieved.

### Minimum-return API and native-request feasibility research (2026-10-20)

Primary sources were rechecked: https://perps-api.jup.ag/v2/docs describes
maxSlippageBps for decrease but no request parameter fixing the final USDC
minimum. https://github.com/jup-ag/cli/blob/main/docs/perps.md documents closing
into USDC or the position's collateral token, and defaults to collateral.
Neither source proves a guaranteed minimum payout for our instant USDC route.

The program-owned mainnet IDL was fetched at confirmed slot 459332711. Both
CreateDecreasePositionMarketRequestParams and CreateDecreasePositionRequest2Params
contain an optional jupiterMinimumOut u64. That field's existence is NOT proof
that the live program accepts or enforces it for this route. A temporary local
constructor encoded a positive one-microUSDC minimum, entirePosition Some(true),
USDC destination, native position/market/collateral PDAs, no referral, a fresh
counter and the existing independent absolute close-price limit. Legacy request
and Request2/Market variants were researched with exact native IDL field order.

All probes were unsigned read-only simulations using a public third-party
position, never an owned wallet or bot wallet. No transaction or request was
actually created on-chain. Results:

- Legacy MarketRequest, zero size: source slot 459333961 / simulation 459333964,
  InvalidArgument 6015 at create_decrease_position_market_request.rs:175.
- Legacy MarketRequest, full native size: source 459334171 / simulation
  459334173, same rejection.
- Request2/Market, full native size and positive minimum: source 459334649 /
  simulation 459334652, InvalidArgument 6015 at
  create_decrease_position_request2.rs:188.
- Diagnostic CONTROL ONLY removing the optional minimum: source 459334851 /
  simulation 459334853, successful request creation in simulated state only;
  this is not a position close or payout and is not an authorized fallback.
- A concurrent candidate/control comparison again returned 6015 versus success,
  but its banks were DIFFERENT (459335207 and 459335208). Failed simulations did
  not supply comparable position state. Therefore do not call that comparison
  same-bank proof or claim a universal causal/protocol incompatibility verdict.

The evidence is sufficient to reject presenting the positive-minimum candidate
as a verified working path, not to bypass its failed native validation. The
temporary constructor and its layout-only tests were REMOVED instead of leaving
a known-rejected speculative path in production lib/. No signing or execution
capability was added. Read-only RPC now permits getLatestBlockhash (official
reference https://solana.com/docs/rpc/http/getlatestblockhash), with the existing
bounded transport and a regression; signing, airdrop and send methods remain
blocked before networking.

The owner was asked to choose between implementing a two-leg close-to-collateral
then protected USDC conversion (two operations, extra fees, possible waiting and
intermediate token exposure), or the supported direct-USDC API close with an
explicit disclosure of price-limit protection but no guaranteed minimum USDC.
Neither choice activates the bot or authorizes sending a test transaction. No
choice has been assumed, no live settings/state changed, and no publication
occurred. Other native closing, durable financial finalization, full integration
and release requirements still remain; the goal is not achieved.

### Owner-selected collateral settlement, 2026-10-20 (implementation in progress)

The owner subsequently explicitly chose the two-operation route: close into the
collateral token, then convert only those proceeds to USDC with a protected
minimum. This supersedes the undecided choice above. It does not authorize bot
activation or a funded signing/broadcast test. The existing VPS/SQLite executor
architecture is retained; no new server, account, deployment or custody key was
created for this change.

An explicit `COLLATERAL_THEN_USDC` planning mode now requests the native market
token for a LONG and USDC for a SHORT. The LONG first leg rejects a token ledger
or an internal post-swap rather than inheriting its unprotected USDC minimum.
SHORT collateral is already USDC and needs no conversion. The old direct-USDC
mode remains isolated for existing tests, not selected as an automatic fallback.

Public read-only discovery found the prior example closed. A bounded recent
history lookup found another public owner and its position, independently
verified on the primary RPC. An unsigned SOL preparation at source slot
459387407 returned oracle updates, the bound full-close instruction and an SPL
CloseAccount to unwrap the owner's SOL ATA; no internal swap or ledger. Neither
owner nor keeper slots were signed; no transaction was sent.

The collateral path now measures the exact collateral-vault debit separately
from USDC. Wallet checks bind that debit to the token increment, or, for an
unwrapped SOL return, to the owner's SOL increment after exact fee/rent effects.
It preserves pre-existing balances and unsynchronized WSOL excess, rejects
unwrapping a pre-existing nonzero WSOL token amount, and checks the native vault
lamport decrease against its token decrease. Read-only USDC/custody/vault
snapshots remain sampled in the same bank, even if absent from the first-leg
message. The LONG oracle context requires only the market/collateral price;
there is no USDC price-consuming instruction in that wire. SHORT/direct-USDC
retain their two-feed requirements.

First public combined probes passed wallet, vault and reserve gates, but did
NOT pass the final oracle gate. Diagnostic simulations at slots 459389043 and
459389135 rejected `UNVERIFIED_PERPS_CLOSE_ORACLE_EFFECTS_CONFIGURATION`.
At 459389135 the Lazer PriceFeed changed bytes 96, 97 and 98 in addition to the
documented price/timestamp fields. The program-owned DOVES IDL was independently
read at 459389258: owner DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e,
JSON hash 1ae8e5e335beec1646d5484671d8f07902fb5ac55581c3028701893b998025f5.
Its PriceFeed description ends at byte 96 (PythLazerConfig feed_id u32 and
channel_id u8). It does not explain these changing extension bytes. They remain
rejected; no arbitrary padding allowance or freshness/price-limit relaxation
was introduced to make the live probe pass. More specific oracle failure codes
now distinguish configuration, stale/future time, regression and price limit.

The current durable close table represents unsigned direct-USDC preparation
only. It explicitly rejects a collateral-only LONG with
`TWO_STEP_CLOSE_JOURNAL_REQUIRED`, leaving parents/risk unchanged, rather than
losing the second leg on restart. A finalized first-leg receipt, durable
conversion-pending state, independently protected conversion wire, fee budget,
unknown-signature recovery and native owner review are still required. A
simulated collateral return is not finalized proceeds or usable USDC capital.
The public oracle-extension discrepancy also remains unresolved. Thus this is
not live trading readiness and has not been published or deployed to the worker.

Verification: the full local `tests/*.test.mjs` suite exited zero. The focused
collateral/close/position/journal bundle passed 66/66 on VPS Node 22 in unit
`jamddmaj-close-collateral-check-20261020-r2`, PrivateNetwork/PrivateTmp,
DynamicUser, ProtectHome/ProtectSystem, no state directory or custody access.
Artifact `/opt/jamddmaj-perps/checks/close-collateral-20261020/tests/test.mjs`,
SHA-256 1776b8c244f5fb94567e20ad7837757fdf7be23168091e83d6010761dfe614a1.
The first isolated invocation could not traverse SCP-created root-only fixture
directories; only the new public test directories were made traversable and the
second invocation passed. No production permissions, database or service were
changed. Fixture success does not override the live oracle rejection above.

### Durable unsigned settlement description, 2026-10-20

The earlier `TWO_STEP_CLOSE_JOURNAL_REQUIRED` rejection is now superseded for
unsigned preparation only. The close journal requires a `settlement` column
containing canonical versioned JSON derived from the original private oracle /
reserve / vault / wallet simulation proof. It records the selected mode,
wallet/position, market/side, receive asset/mint/account, collateral ATA, actual
simulated delivery type (native SOL or token), estimated collateral/USDC units,
conversion-required flag and the checked close price bound. Native SOL delivery
comes from the observed wallet effects, not merely the presence of a cleanup
instruction. No finalized output amount is fabricated from the estimate.

Both close modes can now persist PREPARED/CANCELLED records across independent
connections/restart while retaining all OPEN parent reservations and capital /
daily-loss exclusion. This adds no signing, broadcast, finalized-close or
conversion-complete setter. A prepared two-leg LONG cannot be represented as
already received USDC. SHORT collateral is USDC, so its descriptor correctly
requires no separate conversion. Copied/expired proofs and incompatible metadata
remain rejected before recording.

Runtime encrypted backup/restore validates canonical metadata against the
recorded wallet/position and retains the route, delivery and pending-conversion
distinction. It rejects missing fields, foreign wallet binding, false estimated
USDC for a collateral return, added finalized claims and noncanonical encoding.
Restoration still forces pause, retains parent risk and grants no signing. The
previous 8200534a... direct-close schema remains readable in an old recovery
archive, but strict startup rejects it; it is not silently upgraded or given a
fabricated settlement descriptor.

New local expected journal schema SHA-256:
1657eaa7e4eb82efe0e045597e1ec06dd736b9bdc9f2b6a88125c987dc6ea563.
The explicit EMPTY paused migration/rehearsal from f4c79e... or the actual
cba66ff2... production source now targets that schema. No automatic migration of
prepared/historical close records was added. The actual VPS production journal,
worker and verified recovery archive have not been upgraded/replaced. Deployment
will still require a coordinated paused migration and a matching newly verified
backup; do not start the new worker against the old production schema.

Verification: full local test glob exited zero. The focused close / position /
journal / encrypted recovery / empty upgrade / rehearsal bundle exited zero on
VPS Node 22: 84 tests, 83 passed and the Windows-only ACL test skipped on Linux.
The Windows ACL test passed locally in the earlier focused run. Artifact
`/opt/jamddmaj-perps/checks/close-settlement-20261020/tests/test.mjs`, SHA-256
0281bed97eec648be5ea25f2462850aee2a859b767765b692ec0c40769e35be8;
unit `jamddmaj-close-settlement-check-20261020`, DynamicUser, PrivateNetwork,
PrivateTmp, ProtectHome, ProtectSystem=strict, no production state directories.
These tests use temporary unfunded fixture wallets and cannot move funds.

Still missing: a finalized first-leg payout receipt bound to the recorded signed
wire, durable financial close/conversion phase transitions, protected second-leg
quote/wire validation, actual receipt reconciliation, fees and uncertain-signature
recovery, native review/confirmation and final end-to-end publication. The public
oracle extension discrepancy remains unresolved; this turn did not repeat that
network probe or relax the guard. Trading has not been activated or declared
ready. Goal completion remains unproven.

### Finalized first-leg payout reader, 2026-10-20

`perps-close-payout-receipt.js` adds a read-only reader for the selected
COLLATERAL_THEN_USDC mode, not an execution or journal-transition API. It binds a
captured prepared/uncertain record, its owner-signed wire identity and original
unsigned-wire hash to finalized status and a fully signature-verified native
transaction. Missing/unfinalized status returns no receipt. Failed execution,
changed wire/record/position generation, partial closure or additional Perps
roots cannot provide a payout proof.

New simulated settlement descriptions use version 2, retaining native position
size, collateral and opening time. Version 1 remains canonical/recoverable for
old unsigned records but cannot provide this new finalized receipt; the reader
does not invent the missing generation. The SQL schema hash remains 1657eaa7...
(no new schema change). The transaction reader's private evidence now includes
its already signature-verified decoded instruction list, still returned by copy.

The payout reader requires one matching InstantDecreasePositionEvent from the
native event-authority self-CPI in the bound close root. It checks the event's
full size, original collateral, generation and actual transferToken value against
the native vault debit, token Transfer/TransferChecked CPI and owner balance
effects. Current finalized native account evidence must show that position
absent/zero, not merely missing from an API. Reopened native positions fail.
It separates SOL payout from network fee, position/WSOL rent refunds, new owner
ATA rent and retained empty v2 request-ATA rent. Existing wallet tokens are not
counted as proceeds; unrelated USDC cannot change in a collateral LONG receipt.
Zero returned tokens is represented as a complete loss, not permission to spend
pre-existing capital on a conversion. Results carry a private short-lived proof
and explicitly still require signed-close journal binding, protected conversion
and complete daily accounting. They cannot release journal risk or sign funds.

Verification: full local test glob exited zero. VPS isolated Node 22 bundle
passed 98 of 99 tests (one Windows-only ACL test skipped), including eight new
receipt tests, all six market/direction paths, both core variants, legacy/v0
transactions, fresh/retained rent, valid reopened positions, partial/multi-root
rejection, actual returns differing from quotes, total loss and adversarial
metadata. All signatures are public deterministic unfunded fixtures; no real
financial transaction was signed or submitted. Artifact
`/opt/jamddmaj-perps/checks/close-payout-20261020/tests/test.mjs`, SHA-256
52e946436b7784ce6c9607325f9a07af4c2527d8c24d4d0fe1da56ad44fb2a87,
unit `jamddmaj-close-payout-check-20261020` (private network/tmp, dynamic user,
strict filesystem/home protection, no production state-directory access).

A bounded read-only public-history search checked four signatures of the old
public example and six recent SOL-custody signatures. It found no matching
single-root whole close into SOL in those samples. Therefore no public-historical
reader success or owned-wallet end-to-end result is claimed. No builder,
signature, transaction, live journal transition, deployment or activation was
performed by this research.

For the still-missing protected conversion, the program-owned mainnet Perps IDL
was read at slot 459402097 and again matched JSON hash
1d90a653a1cc88bddb7c5876acee52d3f26c6b1e3306e0833234020dc6f7d653.
It defines `swap2` with amountIn u64 and minAmountOut u64, a single owner signer,
and 17 roles: owner, fundingAccount, receivingAccount, transferAuthority,
perpetuals, pool, receivingCustody, receivingCustodyDovesPriceAccount,
receivingCustodyPythnetPriceAccount, receivingCustodyTokenAccount,
dispensingCustody, dispensingCustodyDovesPriceAccount,
dispensingCustodyPythnetPriceAccount, dispensingCustodyTokenAccount, tokenProgram,
eventAuthority, program. Anchor's global:swap2 discriminator is
414b3f4ceb5b5b88 (24 bytes with the two u64 arguments). This is a concrete
candidate for an independently minimum-protected second leg, not proof of live
acceptance, oracle compatibility or safe execution. It has not been constructed,
simulated, authorized or integrated yet. A bounded unsigned read-only probe and
full funding/oracle/account effects validation are required before selecting it.

Primary RPC references: https://solana.com/docs/rpc/http/gettransaction and
https://solana.com/docs/rpc/json-structures. The existing public close oracle
extension discrepancy, signed close lifecycle/journal transitions, protected
conversion, complete fees/recovery/native integration and publication still
remain. The goal is not complete; live production code/state is unchanged.

### Minimum-protected standalone conversion, 2026-10-20

The proposed Swap2 second-leg route was constructed and simulated unsigned
against a public third-party wallet. No owner/keeper/API key was requested,
loaded or used, and no transaction was sent. The initial prototype succeeded
with a positive minimum, while a separate high-minimum diagnostic was rejected
by the native program at swap2.rs:248, code 6020 InsufficientAmountReturned.
Its initial before/simulation banks differed, so that first observation was not
accepted as wallet-conservation proof. The high-minimum controls also ran in
different banks from their base cases; do not describe them as same-bank causal
comparisons.

`perps-close-conversion-wire.js` now constructs this fixed route with one EMPTY
owner signature, independent decoded source/USDC custodies and derived owner
ATAs / pool authorities. It encodes exact u64 amountIn and mandatory positive
minAmountOut. Native SOL input uses explicit ATA creation, exact SOL transfer,
SyncNative and optional owner-only cleanup; token input never spends native SOL
except fees/rent. It has no arbitrary router, lookup tables, ledger, API signer,
tip, signer service or submission call. A frozen private construction proof
prevents a copied/altered result from being used by its simulator. A separate
integer-only rounding helper computes an inward minimum using sold-token lower
USD and USDC upper USD oracle bounds; it never assumes a fixed one-dollar USDC.
Caller-supplied prices to this pure helper are not authenticated evidence.

`perps-close-conversion-simulation.js` now validates the exact constructed wire
using bounded read-only mainnet transport. It requires native blockhash/height
liveness, exact-message fee, bounded compute and up to three paired before /
simulation attempts of the SAME unsigned wire. A failed simulation is never
retried or given a replacement blockhash. A bank mismatch discards both sides.
In a shared bank it checks:

- derived, mint-bound DOVES aggregate ownership/configuration, unchanged oracle
  state, fresh prices and an independently enforced minimum (maximum 100 bps);
- unchanged native custody configuration, reserve/guaranteed/short exposure
  totals, stable pool rent/identity and legacy token authority/metadata;
- exact source-vault credit, USDC-vault debit and owner USDC increment;
- only the requested source-token decrease / native SOL wrapping, preservation
  of existing WSOL and unsynchronized excess, explicit cleanup and exact ATA rent;
- exact owner SOL conservation after input, message fee, locked/refunded rent.

Successful effects still explicitly require finalized-proceeds and durable
close-journal binding, fresh signing revalidation and explicit authorization.
No signing or durable financial transition was introduced by these modules.
In particular, this does NOT authorize converting a wallet's entire balance or
substituting the close quote estimate for its independently finalized return.

Observed public probes of the real library code:

- Native constructor: source 459406745 / oracle 459406747 / paired bank
  459406750 (two read-only attempts). Input 100000 lamports, compiled minimum
  10543 microUSDC, simulated USDC delta 10601, message fee 5400 lamports.
- Extended manual conservation diagnostic: source/oracle 459407916 / paired bank
  459407917. Input 100000, minimum 10531, USDC return/debit 10591, source-vault
  credit 100000, zero locked/refunded rent, owner SOL delta -105400; all checked.
- Real production simulator module: source 459410989 / oracle 459410990 / paired
  bank 459410993 (one attempt). Compiled minimum 10532, independent bank-price
  minimum 10531, USDC return 10590, fee 5400, zero rent, owner SOL delta -105400.
  Result PROTECTED_CONVERSION_EFFECTS_SIMULATED, readyForSigning false. A
  high-minimum control of 1053200 at 459410995 was rejected as
  PERPS_CONVERSION_MINIMUM_NOT_MET (native 6020), not retried.

The final simulator run uses 99 bps when constructing the quote bound and checks
against 100 bps in the simulation bank, leaving a 1 bp unsigned-read headroom
without widening the independently enforced limit. A larger market move still
fails. No oracle-update instruction is included in this swap wire: it consumes
fresh cached native aggregate feeds read-only, so it does not rely on ignoring
the unresolved first-leg Lazer extension mutations. That first-leg guard has
not been relaxed or removed.

Remaining integration includes binding the exact finalized first-leg receipt
and current signed journal record to this second-leg amount, durable close /
conversion signing and uncertain-receipt states, custody authorizations, final
USDC receipt accounting, daily risk/fees, native review and end-to-end release.
The first-leg oracle issue also remains. These successful unsigned public
simulations are not an owned-wallet or bot execution test and do not establish
that the app can yet execute the full workflow. No deployment or activation
has occurred; production state and the active goal remain unchanged.

Verification for these conversion modules: the full local test glob exited zero.
The VPS Node 22 isolated expanded bundle completed 108 tests: 107 passed, one
Windows-only ACL test skipped, zero failures. The nine new constructor/effects
tests cover all supported asset inputs, native/token SOL, native IDL roles,
exact u64 amounts, mandatory minimum, no extra signer/router, depeg-aware inward
rounding, same-bank pairing, no retry of native errors, old balances, newly
created ATAs, rent, WSOL excess and adversarial fee/oracle/custody effects.
Artifact `/opt/jamddmaj-perps/checks/close-conversion-20261020/tests/test.mjs`,
SHA-256 b790325e28731bf3c321c4d8c2b9d2866bb893e1bb325ae6846fffc48ba50ab3;
unit `jamddmaj-close-conversion-check-20261020`, PrivateNetwork/PrivateTmp,
DynamicUser, ProtectHome/ProtectSystem=strict, no production state directories.
This is neither a worker deployment nor permission to trade. No active process
from these checks remains after the successful test unit exited.

### Finalized payout to protected conversion preparation (2026-10-20)

`perps-close-conversion-preparation.js` now joins the privately verified first-leg
receipt to the unsigned second leg. Its input amount is the actual finalized
return, never the quote estimate or the wallet's full balance. It binds the
captured close record, rejects stale/copied receipts, requires fresh mainnet
custody/oracle/source snapshots, and preserves pre-existing WSOL/native excess.
The independently enforced oracle minimum can be strengthened by an absolute
USDC floor. Native block-height metadata must be a safe, positive integer.
USDC returns and zero-payout total losses prepare no conversion and perform no
RPC calls. A live-record digest and both private proof leases are checked again
when reading the preparation; copied results are not authority.

This is an unsigned preparation bridge, NOT a signed close-journal lifecycle.
The result still explicitly requires durable signed-close binding, fresh signing
revalidation and authorization. No signer, send transport, journal mutation,
worker deployment, bot activation or owned-wallet execution was introduced.
The first-leg oracle extension validation issue remains unresolved. Automatic
SL/TP settlement, final conversion receipts, daily accounting, crash recovery,
custody permissions and the complete app flow still need integration.

The VPS isolated joined-flow bundle completed 114 tests: 113 passed, one
Windows-only ACL test skipped, zero failures. It predates the final safe-integer
block-height guard and its additional local regression test. Artifact:
`/opt/jamddmaj-perps/checks/close-join-20261020/tests/test.mjs`, SHA-256
73f3d0e2f6330d00bc5c8479177d8f28726474d283a6c9fb1a03a432644e7e27;
unit `jamddmaj-close-join-check-20261020` used DynamicUser, PrivateNetwork,
PrivateTmp, ProtectHome, ProtectSystem=strict and no production state directories.
The final local constructor, simulator and joined-receipt suite passed all 24
tests, including malformed block heights, depleted proceeds, strong minimums,
record changes, proof expiry, pre-existing funds and all collateral paths.
The final full local test glob completed 734 tests: 728 passed, six skipped,
zero failed. Production remains unchanged and paused.

### Exact oracle signature checks in close policy (2026-10-20)

`perps-oracle-ed25519.js` adds a server-only, bounded check of every top-level
Ed25519 instruction accepted by close policy. It resolves the actual compiled
instruction offsets (including same-instruction references), verifies every
signature, and binds DOVES' selected signature to its exact SolanaMessage vector:
magic, length, payload length, signature/key/payload offsets, instruction indices
and signature index. Valid signatures over unrelated embedded bytes are rejected.
There are no RPC, custody-key, signing or send capabilities in this checker.

OpenSSL alone was observed accepting an identity-point public key and signature
for arbitrary bytes. Therefore the gate additionally requires strict RFC8032
verification with directly pinned `@noble/curves` 2.4.0 (`zip215: false`), rather
than relying on OpenSSL alone. This dependency was already installed transitively;
the lockfile now declares its exact direct version. Tests reject identity keys,
noncanonical encoded points/scalars, altered payload/key/signature, malformed
offsets/counts, invalid second signatures and unrelated correctly signed messages.
The native precompile must STILL execute successfully: this is not a claim of
complete runtime equivalence or trusted-signer/price authentication.

Primary format references consulted:
- https://raw.githubusercontent.com/anza-xyz/agave/master/precompiles/src/ed25519.rs
- https://raw.githubusercontent.com/pyth-network/pyth-lazer-public/main/contracts/solana/programs/pyth-lazer-solana-contract/src/signature.rs
- https://raw.githubusercontent.com/pyth-network/pyth-lazer-public/main/sdk/rust/protocol/src/message.rs
- https://github.com/paulmillr/noble-curves/tree/2.4.0

The final strict checker also passed a read-only observation of public finalized
transaction `5Qw7A5qYcCV8k2fNEyoE9t19kFiAMFQGTXzKPb5UqvrkCiqmaSwCoxHLp6CCa5shtkQGgN9GVZpSVAP5b97Rd4js`,
slot 459332261: one Ed25519 signature and one exact DOVES message binding. The
existing full-transaction reader first verified the transaction signatures and
message. This is historical public evidence, not an owned-wallet execution test
or proof that a current close passes all validation. Current Pyth signer trust,
payload price/feed contents, same-bank state and the unresolved DOVES extension
mutation still require validation; their existing gates were not relaxed.

Final full local suite: 739 tests, 733 passed, six skipped, zero failed. VPS Node
22 isolated expanded suite: 120 tests, 119 passed, one Windows-only ACL skip,
zero failed. Artifact `/opt/jamddmaj-perps/checks/close-crypto-20261020/tests/test.mjs`,
SHA-256 db3ecf02554cee7c6e01c4791429cc2112ca9538ceb0cff931338c7fd335e762;
unit `jamddmaj-close-crypto-check-20261020` exited successfully. It had
PrivateNetwork, PrivateTmp, DynamicUser, ProtectHome, ProtectSystem=strict and no
production state access. An interrupted copy was verified incomplete before a
successful replacement and hash check; no incomplete bundle was executed.
Production worker/HTTPS/observer remained active, without deployment or activation.
The financial journal, custody authorization, final accounting, recovery and app
integration requirements above remain incomplete; the full goal is not achieved.

### Native Pyth signer membership and same-bank configuration (2026-10-20)

`perps-pyth-storage.js` independently decodes the fixed Pyth mainnet Storage
account. It requires its program owner, non-executable flag, canonical encoding,
381-byte length, discriminator and official treasury. The initialized signer
count, signer keys and signed i64 expiry values are decoded from the native
layout; unused capacity cannot authorize a signer. Duplicate/zero keys,
negative expiry and unsupported counts are rejected. The decoded result is a
private-branded, immutable configuration, not financial signing authority.

Primary definition consulted:
https://raw.githubusercontent.com/pyth-network/pyth-lazer-public/main/contracts/solana/programs/pyth-lazer-solana-contract/src/lib.rs
Native observation at slot 459442196: account
`3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL`, owner
`pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt`, non-executable,
length 381, discriminator d175ffb9c4af4409, data SHA-256
9317148d8a36da529f5eec39d325cd6ae2c15eb2c3e00f5d020dcf41e8544d21.
Offsets including the discriminator: treasury 40, update fee 72, signer count
80, five 40-byte signer slots beginning at 81 (expiry offset +32), ECDSA count
281. Counts are limited to the published configuration's supported bounds.

Close policy now requires the exact signed-message key to be an initialized,
unexpired authorized signer. Close simulation samples Storage even though it
is read-only. The later oracle-effects gate requires its bytes to match the
captured configuration, before/after lamports to be unchanged, and rechecks
selected signer membership/expiry after simulation. A rotation during reads
requires a new preparation; it cannot silently substitute a different policy.
The preparation coordinator supplies its own server clock to both checks.

At current slot 459445611, the strict checker matched the previously recorded
public historical transaction's oracle signer to the currently authorized key.
This does NOT establish the historical Storage contents, nor a current complete
close simulation. No real wallet signatures or submissions were made.

New tests cover native layout/identity, initialized versus unused signer slots,
expiry equality (not accepted), noncanonical inputs, duplicate keys, copied
proofs, config rotation, missing accounts and rent changes. An unfunded synthetic
close with a real ephemeral oracle signature passes initially but fails if that
signer's expiry is reached after same-bank simulation. This is a model test, not
a native-program execution. Final full local suite: 745 tests, 739 passed,
six skipped, zero failed.

VPS Node 22 isolated expanded verification: 126 tests, 125 passed, one
Windows-only ACL skip, zero failed. Artifact
`/opt/jamddmaj-perps/checks/close-pyth-trust-20261020/tests/test.mjs`, SHA-256
1246328b43947be393cc4c6ecffc0bc48891d278b4bd6ec6cf622f3d78d46973;
unit `jamddmaj-close-pyth-trust-check-20261020` exited successfully. It used
DynamicUser, PrivateNetwork, PrivateTmp, ProtectHome, ProtectSystem=strict and
no production state directories. The bundle hash was checked before execution.

These changes do not remove the existing unresolved DOVES extension guard,
authenticate signed price/feed payload contents, complete financial journal
transitions or add custody signing rights. No worker/app deployment or bot
activation was performed. The complete trading/automation objective remains open.

### Signed standard payload and selected feed binding (2026-10-21)

`perps-pyth-payload.js` decodes the bounded standard little-endian format,
including all 13 published property variants. It rejects truncation, duplicate
feeds/properties, unsupported tags, noncanonical bytes, malformed optional flags,
trailing data and oversized counts. The authenticated reader checks the exact
Ed25519/DOVES message and native Pyth signer trust, then limits envelope age to
30 seconds and future time to two seconds. Parsing alone is not authentication.
No financial signer or send transport is accepted.

Primary format source:
https://raw.githubusercontent.com/pyth-network/pyth-lazer-public/main/sdk/rust/protocol/src/payload/standard.rs
Its published test vector matches across all 13 properties. Close policy binds
each writable Lazer feed's independently read native feed ID and channel to the
signed payload, requiring a positive spot price and supported exponent. The
same-bank effects gate rereads authenticated payloads: changed native price,
exponent and second timestamp must exactly match the selected signed feed. A
cached feed without a signed update cannot change price. Unknown extension bytes
still use the original strict configuration comparison.

The synthetic unsigned wire serializer now uses canonical shortvec for data
lengths above 127, allowing real-format test payloads instead of the old one-byte
placeholder. An initial positive-effect test exposed an incorrectly ordered
fixture timestamp; the fixture was corrected before its context read. The
production timestamp-regression guard was not relaxed.

Read-only public evidence:
- Previously recorded historical transaction at 459332261: signed feed ID 6,
  channel 3, price 10586789167, exponent -8, timestamp_us 1792521525800000.
  Current feed configuration matched at 459573310 and signer trust at 459573309.
  Current reads are NOT historical account-state proof.
- Current public collateral-close preparation passed the new instruction policy,
  simulation, funding, vault and reserve gates, then failed the unchanged oracle
  CONFIGURATION gate at same-bank 459574383. Changed feed offsets included 97,
  98 and 104, beyond the recorded 96-byte serialized IDL prefix.
- Program-owned DOVES IDL reread at 459571297 retained JSON hash
  1ae8e5e335beec1646d5484671d8f07902fb5ac55581c3028701893b998025f5.
  At 459449134, bytes 96..104 numerically matched the stored timestamp expressed
  in microseconds; byte 104 also changes. This is NOT sufficient evidence to
  declare the remaining tail harmless or remove the guard.
- A second diagnostic at 459574577 authenticated a current SOL payload containing
  price, exponent, confidence and per-feed update timestamp. Its before/simulated
  feed was already newer and unchanged; the earlier context-to-bank comparison
  still rejected unexplained tail changes.

No live close/conversion was signed or sent. Per-feed update-time semantics,
confidence/extended-state binding and aggregate economics still require
verification; `requiresOraclePayloadProvenance` intentionally remains true.
These are not complete close or owned-wallet execution tests.

Final local suite: 752 tests, 746 passed, six skipped, zero failed. Expanded VPS
Node 22 suite: 133 tests, 132 passed, one Windows-only ACL skip, zero failed.
Artifact `/opt/jamddmaj-perps/checks/close-pyth-payload-20261021/tests/test.mjs`,
SHA-256 9d63962ed6f3144164b10f090439f54490e5795e349b5d2b29132e84f651fa40;
unit `jamddmaj-close-pyth-payload-check-20261021` exited successfully with
DynamicUser, PrivateNetwork, PrivateTmp, ProtectHome, ProtectSystem=strict and
no production state directories. Hash checked before execution. No worker/app
deployment, financial journal migration or bot activation occurred. The complete
trading, custody, crash recovery, Telegram controls and app-flow goal remains open.

### Per-feed observation freshness (2026-10-21)

The authenticated payload reader now privately captures the exact verification
clock and maximum age. Selected-feed validation checks explicit per-feed update
timestamps against that original clock: a fresh envelope cannot launder an old
observation, extend the allowed age by another 30 seconds, or substitute an
unavailable/zero/future per-feed timestamp. Microsecond boundary comparisons are
exact. Copied objects carrying signed-message metadata are not allowed to fall
back to clockless parsing. Generic payload decoding still does not authenticate.

Selected details retain signed confidence and per-feed timestamps as exact
strings. Negative confidence is rejected; absent/None confidence stays null,
not an invented zero. When the simulated native feed changes, its second
timestamp must also agree with an explicit signed per-feed observation time.
Cases with different publication/observation seconds remain conservatively
rejected rather than guessing undocumented DOVES time-selection semantics.
Existing wire leases and native program execution are still required.

Unfunded tests cover correct signatures with stale or unavailable observations,
one-microsecond age boundaries, custom age limits, copied metadata, exact/null
confidence, and policy/effects integration. Public historical decoding still
passes for the recorded transaction at 459332261: observation timestamp
1792521525800000, confidence 4651744. Current configuration/trust checks at
459577803 / 459577801 are not historical state proof or trade authorization.

Further read-only investigation did not justify relaxing extension checks:
- OtterSec's documented status endpoint returned is_verified false and no source
  repository/hash for DOVES. That is absence of a verified-build record, not proof
  that no public source exists anywhere. References:
  https://github.com/otter-sec/solana-verified-programs-api and
  https://verify.osec.io/status/DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e
- A public unsigned close at 459576487 still failed oracle CONFIGURATION. Its
  signed SOL envelope was older than the already-cached native feed, so unchanged
  before/after bytes cannot establish the meaning of mutable extension fields.
  The confidence-floor arithmetic happened to equal the native value at offset
  104, but this is not causal/schema proof. No production comparison was relaxed.
- Jupiter's public CLI PerpsClient was inspected without installing/running it.
  Its builder interface provides no oracle-skip parameter; no speculative skip
  or execute endpoint was added. Public app asset inspection likewise did not
  establish the DOVES extension layout in this investigation.

Final local suite: 757 tests, 751 passed, six skipped, zero failed. VPS Node 22
isolated expanded bundle: 138 tests, 137 passed, one Windows-only ACL skip,
zero failed. Artifact
`/opt/jamddmaj-perps/checks/close-feed-time-20261021/tests/test.mjs`, SHA-256
d62bea8309e748e317945ac763132c286003e2b3cf9f1be3f91cecb5ec6e2c80;
unit `jamddmaj-close-feed-time-check-20261021` completed successfully with
DynamicUser, PrivateNetwork, PrivateTmp, ProtectHome, ProtectSystem=strict and
no production state directories. Bundle hash verified before execution.
No deployment, schema migration, financial signing/submission or bot activation
occurred. Native extension/payload-economic validation, durable financial close /
conversion lifecycle, custody authorization, accounting, recovery and app/24-7
integration still prevent claiming the full trading goal complete.

### Finalized protected conversion receipt (2026-10-21)

`perps-close-conversion-receipt.js` now reads an already-recorded second-leg
transaction without any signing or send capability. It requires the original
private-branded constructed wire, its exact recorded owner signature/signed hash,
mainnet genesis, rooted status, matching finalized transaction/slot and creation
window. The complete unsigned message must match byte-for-byte after clearing
the ONE owner slot. Strict Ed25519 verification supplements the existing full
transaction reader; the three-signer entry/close receipt gate was not weakened.
Processed/confirmed/missing history returns no finalized payout. A failed or
unverified transaction produces no success proof or capital-release authority.

The receipt independently checks the fixed Swap2 instruction, native PoolSwap
self-CPI origin and event authority, exactly two token transfers, owner/mint /
decimal metadata, vault credit/debit, actual USDC increment and protected minimum.
It preserves existing token balances, accounts for SOL wrapping/cleanup, and
checks owner SOL, message fee and newly locked/refunded token-account rent.
Historical rent is derived from finalized balances, not today's RPC rent quote
or a hardcoded 2039280 lamports. New tests also pass with 1488440-lamport ATAs.
The event's gross output is not mistaken for the actual after-fee USDC return.
Unrelated lamport/token movements, malformed metadata, unknown/extra events and
incorrect transfers fail. Proofs are private-branded and expire after ten seconds.

Native evidence used to pin this reader:
- Program-owned Perps Anchor IDL reread at 459579951 retained hash
  1d90a653a1cc88bddb7c5876acee52d3f26c6b1e3306e0833234020dc6f7d653.
  PoolSwapEvent has a 208-byte payload, discriminator 286bd41adf8827dc, with
  receiving/dispensing custody, pool, five u64 values, owner and receiving account.
- The actual public unsigned Swap2 simulation at paired bank 459581590 emitted
  its 216-byte Anchor self-CPI (prefix e445a52e51cb9a1d). Input 100000 lamports,
  gross output 10682 microUSDC, actual output 10634, event fee 45 bps, network
  fee 5400 lamports; the receiving account was the expected owner USDC ATA.
  The event bytes are captured in an independent decoding regression test.
- Earlier scratch diagnostics incorrectly looked for compiled indices in the
  simulation's parsed inner-instruction objects and therefore reported no event.
  The diagnostic was corrected; no production gate was relaxed. Finalized
  getTransaction/base64 metadata uses the compiled format already validated by
  the existing transaction reader. RPC structure reference:
  https://solana.com/docs/rpc/json-structures
- The high-minimum unsigned control at 459581592 failed native 6020. It was not
  the same bank as the successful probe; this is not a same-bank causal control.

All finalized receipt tests are unfunded in-memory models with ephemeral owner
keys and a fixed invalid blockhash, not real transactions. Public probes were
unsigned simulations, not finalized owned-wallet/bot execution. The standalone
receipt intentionally still requires binding to actual finalized first-leg
proceeds and a signed durable journal record, plus complete daily accounting.
It does not mutate the journal, credit bot capital, release risk, reconcile exit
siblings, authorize custody or activate execution. Crash-safe financial close /
conversion states, signer grants, daily fees/loss and app/coordinator integration
remain required. The unresolved first-leg DOVES guard also remains unchanged.

Final local test glob: 765 tests, 759 passed, six skipped, zero failed.
VPS Node 22 isolated expanded verification: 146 tests, 145 passed, one
Windows-only ACL skip, zero failed. Artifact
`/opt/jamddmaj-perps/checks/conversion-receipt-20261021/tests/test.mjs`, SHA-256
1e784f3c0e6882746e2fc6233061ba66fd2086e38b85956874a5e7ad53b03b6b;
unit `jamddmaj-conversion-receipt-check-20261021` exited successfully with
DynamicUser, PrivateNetwork, PrivateTmp, ProtectHome, ProtectSystem=strict and no
production state directories. Hash checked before execution. No worker/app
deployment, financial schema migration or activation occurred. The goal remains
active and incomplete.

## Durable first-leg close execution journal — 2026-10-21

The selected two-step route now has a separate durable first-leg execution
record. Its parent stays PREPARED, preserving the existing settlement digest
and wallet-wide pending-close exclusion. The child progresses from SIGNING to
UNCERTAIN to FIRST_LEG_FINALIZED. These are bookkeeping states, not custody
grants. There is still no close signer, broadcaster or conversion execution
coordinator exposed by this implementation.

An immediate SQLite transaction claims a prepared v2 COLLATERAL_THEN_USDC close
only once, after checking that its exact original entries remain OPEN and no
other entry/cancellation is pending. Before any future transport attempt, the
journal stores the exact owner/API-signed, keeper-empty packet and its signature
and pre-keeper wire hash. Strict Ed25519 verification, the original unsigned
wire hash and the existing API envelope verifier bind these bytes to the parent.
A plain object copy is not accepted as the private owner-signature fact.

Only a fresh private finalized payout proof matching that recorded signature,
hash and unchanged parent can record the first-leg payout. Stored facts include
the actual token return, network fee, finalized slot, block time and UTC day.
Repeated identical reconciliation is idempotent; a contradictory observation
cannot overwrite the financial record. No state here releases collateral,
marks the original reservations CLOSED, credits USDC or starts a conversion.
Even an interrupted SIGNING claim cannot be discarded as an unsigned preparation.

Recovery inventory validates these child records against their parent and
still-OPEN original reservations. An encrypted archive/restore test preserves
an interrupted claim while restoring paused, quarantined custody. Changed
parent digests, cancelled parent preparations and released collateral are
rejected. Journal tests also verify exact signed-wire persistence across reopen,
four collateral/direction cases, expired/foreign/changed proof rejection and
two actual processes competing for one close claim.

The fresh target journal schema hash is
`d48b3b21a0aaa1addfa5735406f90e634f99f3b344cb418237de24938a9672e7`.
The previous 1657eaa7 schema remains recognized for quarantined recovery and an
explicit paused **empty** upgrade; populated-close migration is not provided.
Empty upgrade admission now also explicitly rejects any existing close rows.
The production cba66ff2 journal was not migrated and the new worker must not be
installed over it without the separately approved migration/backup procedure.

Final local test glob: 774 tests, 768 passed, six skipped, zero failed.
VPS Node 22 isolated verification: 155 tests, 154 passed, one Windows-only ACL
skip, zero failed. Artifact
`/opt/jamddmaj-perps/checks/close-execution-20261021/tests/test.mjs`, SHA-256
`b60bf40db54d11a1dbf97439cdb01411333daca502860a2bb246144e4d7040b4`;
its child-process journal bundle SHA-256 is
`1b4aef8c8869cae729ca8e47bb01c875157626c4f4f3d2f7fa78373d6d0c7cb1`.
Both hashes matched before execution. Unit
`jamddmaj-close-execution-check-20261021` exited successfully with DynamicUser,
PrivateNetwork, PrivateTmp, ProtectHome, ProtectSystem=strict, NoNewPrivileges
and a 384M memory cap, without production state access.

The shared payout fixture was mechanically extracted into a helper; it still
uses ephemeral unfunded keys, mocked chain replies and an invalid fixed blockhash.
No real transaction was signed or sent. The existing VPS/SQLite architecture
was retained. No app publication, production worker replacement, schema migration
or bot activation occurred. Conversion journal phases, fresh signing grants,
complete fees/loss accounting, sibling exits, native app coordination and the
unresolved first-leg DOVES guard remain required. The goal remains incomplete.

## Journal-bound conversion recovery preparation — 2026-10-21

`preparePositionCloseConversion` now connects the durable first-leg journal to
the existing protected conversion preparation. It takes an atomic validated
snapshot of the parent, exact original OPEN entries and FIRST_LEG_FINALIZED
execution. It re-reads rooted chain evidence using the recorded signature and
pre-keeper signed-wire hash, then compares the complete fresh canonical payout
with the stored payout. A stored JSON record is never promoted into a fresh
chain proof. Unavailable/unrooted history returns an explicit non-ready stage;
a conflicting fresh payout fails rather than rewriting the financial record.

The coordinator checks the same durable snapshot before and after every
asynchronous RPC read and once more before returning. It then prepares the
protected conversion for exactly the actual returned token amount, using the
existing current bank, oracle bounds, balances and exact-wire simulation.
Its private result is bound to that exact journal instance and both short-lived
proofs. Copies, another connection's handle, expired evidence or changed
parent/entries/payout fail. No transaction is signed, claimed or broadcast.
There is no automatic transport retry and no release/USDC credit here.

Reopening a real test SQLite journal reconstructs preparation across SOL native,
SOL token, ETH and BTC collateral cases. USDC collateral and zero proceeds
produce no second transaction and retain parent accounting risk. Tests also
change records both during history reads and during conversion simulation,
reject a previously altered stored payout, and keep all original risk held.
Fixtures remain unfunded with invalid fixed blockhashes and RPC stubs that
reject write methods. The integrated pipeline intentionally uses one monotonic
lease clock; an initial test advanced a different fixture clock and was corrected
to advance the actual clock supplied to both proof readers.

Final local glob: 779 tests, 773 passed, six skipped, zero failed. The isolated
VPS expanded corpus passed 159 of 160 tests with one Windows-only ACL skip and
zero failures. Artifact
`/opt/jamddmaj-perps/checks/journal-conversion-20261021/tests/test.mjs`, SHA-256
`421d6d7ac701642630cd9a76e9f5027d54257f8ba379aa8e144289f346c20bb5`;
its child-process journal bundle hash is
`03a4bde3eb253c042eb66d627bdca2a12ceec5b57b3392d0fff6ae508a76eb5f`.
Hashes matched before execution. Unit
`jamddmaj-journal-conversion-check-20261021` exited successfully with
DynamicUser, PrivateNetwork, PrivateTmp, ProtectHome, ProtectSystem=strict,
NoNewPrivileges and MemoryMax=384M, without production state access.

No SQL schema changed in this step; target remains d48b3b21... and production
was not migrated. No worker/app deployment or activation occurred. This is
fresh read-only recovery preparation, not a durable second-leg attempt.
Conversion signing/uncertain/finalized records, signer grants, complete daily
fees/loss, sibling exit reconciliation and app/coordinator execution wiring
remain required, as does resolution of the native first-leg DOVES guard.
The full requested trading/automation goal remains active and incomplete.

## Durable conversion execution and read-only restart reconciliation — 2026-10-21

The second leg now has its own `perps_close_conversions` record, keyed to the
first-leg execution, exact canonical finalized payout digest and parent digest.
Its states are PREPARED, SIGNING, UNCERTAIN and FINALIZED. The parent remains
PREPARED and the original reservations remain OPEN throughout: confirmed USDC
return is not yet permission to free capital or skip daily/exit accounting.

Preparation accepts only the private journal-bound fresh preparation for this
exact journal connection. After checking that proof outside the SQLite write
transaction, the transaction atomically compares the same parent/execution
snapshot again, checks simulation time/slot/fee and inserts the exact descriptor
and unsigned hash. Claiming SIGNING also requires the fresh proof and identical
wire. A second claim cannot pass the existing-state gate. The descriptor stores
the original blockhash, height, amount, protected minimum, native wrap/cleanup,
owner, source/destination and complete unsigned bytes, rather than a replaceable
quote. Its canonical decoder checks the full fixed instruction sequence, compute
budget, account order/writability, token movement setup, cleanup and encoded
Swap2 minimum/amount. Static archive decoding is not native PDA provenance or a
private construction proof; it never grants signing or sending authority.

Before any future transport, UNCERTAIN records the exact sole-owner signed
packet, signature and full signed-wire hash. Strict Ed25519 verification and
equality with the prepared message reject altered packets. Copies of private
proofs fail. Identities cannot collide with entries, exit cancellations, first
closes or other conversions. There is no send method, custody grant or transport
in this implementation. SIGNING cannot be dropped as an unsigned preparation;
UNCERTAIN and FINALIZED cannot initiate a fresh conversion preparation.

Only the fresh private finalized conversion receipt matching recorded identity,
unsigned hash, owner, asset, exact input/minimum, prepared bank and message fee
can transition to FINALIZED. Durable receipt facts retain actual USDC, native
fee, locked/refunded rent, wallet SOL delta, swap fee, block time and UTC day.
Repeated identical polls are idempotent; conflicting results cannot overwrite
the financial record. Fees are facts here, not yet a complete daily loss ledger.

The read-only recovery method rebuilds the exact wire through the existing native
constructor and fresh mainnet custody reads, checking every recorded byte before
querying the original signature. It never gets a replacement blockhash, simulates
a new conversion, signs or sends. Changed native roles/configuration or changed
durable facts abort rather than substitute a message. Current configuration must
still support reconstructing the original instruction; configuration changes can
therefore conservatively retain uncertainty for operator review. Missing/confirmed
history stays UNCERTAIN. Finalized failure currently fails closed and retains
uncertainty; failure-cost recording and an independently reviewed retry path are
still required. This is not an automatic retry implementation.

The native constructor and receipt retain their private provenance; JSON records
are not cast into proof handles. The existing VPS/SQLite architecture is retained.
New tests exercise all four SOL/token-SOL/ETH/BTC receipt paths, reopen each phase,
reject copied/expired/altered proofs and conflicting records, and recover the
recorded rooted signature without re-preparation. Encrypted archive/restore tests
also preserve all four conversion phases, signed bytes and finalized financial
facts while custody stays quarantined and capital held; altered payout binding
is rejected. The fresh temporary test vault uses only the public fixture seed,
freshly generated wrapping keys and invalid-blockhash in-memory packets; no
production key/record or write RPC is used.

The new target schema hash is
`42653dcbee61271989264b68e8829787afc7d1b2c5e54ae759b100571088fbaf`.
Previous d48b3b21 remains recognized for quarantined recovery and explicit paused
empty upgrade only. Tests cover that upgrade and required new backup proof.
Legacy fixture tables are dropped in FK order to model the actual old schemas.
No production schema was migrated; the installed production cba66ff2 worker and
database remain untouched. Do not deploy the new worker over that database
without the separately gated paused migration and fresh backup verification.

Final local glob: 788 tests, 782 passed, six skipped, zero failed. No production
deployment, app publication, bot activation, real signing or transaction send
occurred. The goal remains incomplete: custody grants/signers/broadcasters,
failure accounting/retries, complete daily costs/loss and sibling exits,
terminal risk settlement, app/worker coordination and the native first-leg
DOVES guard still need completion and end-to-end evidence.

VPS Node 22 isolated expanded corpus: 169 tests, 168 passed, one Windows-only
ACL skip, zero failed. Artifact
`/opt/jamddmaj-perps/checks/conversion-journal-20261021/tests/test.mjs`, SHA-256
`17c03dd604a504898e9e3c696b9b78abf8bfc9f01a72b794c208826147690301`;
its child-process journal bundle hash is
`5035b1d5085e78ab0311609c265695b184d53044786f9a303c5419ebc62e713a`.
Both matched before execution. Unit
`jamddmaj-conversion-journal-check-20261021` exited successfully with DynamicUser,
PrivateNetwork, PrivateTmp, ProtectHome, ProtectSystem=strict, NoNewPrivileges,
UMask=0077 and MemoryMax=384M, without access to production state.

## Native DOVES extension evidence and full unsigned close — 2026-10-21

The first-leg oracle configuration rejection now has a concrete runtime fix.
The gate previously treated all bytes after the old IDL's price/time prefix as
immutable. Independently authenticated current Pyth messages and same-bank native
unsigned execution demonstrate two additional mutable u64 values in the observed
283-byte DOVES PriceFeed allocation: microseconds at 96..104, and
`floor(signedConfidence * 10000 / signedPrice)` at 104..112. This is an observed
native format, **not a claim that the published DOVES IDL declares those fields**.
The official Pyth standard encoding independently identifies price, exponent,
confidence, publication microseconds and explicit per-feed update time:
https://raw.githubusercontent.com/pyth-network/pyth-lazer-public/main/sdk/rust/protocol/src/payload/standard.rs

Evidence collected using the existing read-only RPC wrapper and unsigned builder:

- Paired bank 459603291: SOL signed price 10645337003, exponent -8,
  publication/feed-update microseconds 1792580134200000. Native microseconds
  changed from 1792580132400000 to that exact signed value. Confidence remained 6.
- Paired bank 459603638: signed price 10652448737, confidence 4247163 and
  microseconds 1792580207600000. Native microseconds changed from
  1792580205400000; the confidence field changed from 4 to exactly 3, matching
  the signed integer ratio floor. The native price/time changed accordingly.
  Before/after prefixes are captured in the new independent regression test.
- Paired bank 459605063: an oracle-only prefix succeeded. In the same bank,
  the compute-only no-update control preserved every sampled oracle/storage
  account byte, and corrupting the signed message caused native failure
  `InstructionError [5, Custom 2]`. The diagnostic has no Perps financial
  instruction, signing method, execution endpoint or sending RPC.
- Paired bank 459605654: the production extension checker accepted the native
  before/after bytes. Signed price 10676855468, confidence 2450150, signed
  microseconds 1792580643000000, resulting confidence field 2. Both controls
  passed again. The suffix after offset 112 contained a nonzero byte but stayed
  identical. An initial scratch assumption that the suffix was zero padding
  was rejected by this live observation and removed; its meaning is not guessed.

The new gate does not ignore the tail. It preserves bytes 0..73, 90..96 and
112..end exactly, validates owner/executable/lamports in the caller and admits
only observed 96/283-byte allocations. Changed base price/exponent/time must
still match the original privately authenticated Pyth feed. Changed extended
state must match signed microseconds and exact confidence ratio; absent
confidence is never invented as zero. If an explicit observation time is
present, it must agree exactly, not just within the same second. Both
context-to-bank and before-to-after microseconds must be monotonic. Unknown
suffix/config changes, unsigned extension writes, timestamp inconsistencies,
unsupported allocations, downgrades and regressions fail closed. An old padded
state with zero extension fields retains absent values, not fabricated precision.
Native program execution, trusted-signer/storage checks, signed-message byte
binding, freshness and the absolute close price bound remain mandatory.

The prior public sample wallet's position had genuinely closed; no stale process
was restarted. A bounded read-only public history scan found a different current
position, independently decoded and PDA/owner checked by the normal account
reader. No user, Phantom or bot wallet was used for these probes.

Public unsigned full-close evidence:
wallet `AfaVt79LKpTcNTxiWP2iWPQQgzkfew5JsXhwAbi3RajG`, SOL LONG position
`FdpvymEUv3Pv3yuFEh7SVFdivj6tftRZhTShdUhKtQjg`.
At source slot 459679685 / paired simulation bank 459679695, one builder and two
bounded same-wire snapshot attempts passed bindings, policy, native execution,
wallet funding/conservation, vaults, reserves and the revised oracle-effects gate.
The protected caller limit 107836452 stayed enforced; encoded core limit
107844390 was tighter. A preceding separate diagnostic rejected an out-of-bound
price rather than relaxing the caller limit. That rejection is not a send retry.

A second independent unsigned close at source 459680027 / paired bank 459680036
passed with one builder and one simulation. The wire contained two DOVES
instructions, and native PriceFeed changes included offsets 96, 97 and 98, so
this exercised the extended update rather than only an unchanged cache. The
unknown suffix remained identical. Simulated first-leg return was 9364265824
lamports of native SOL, message fee 20792 lamports, wallet SOL increment
9364245032 lamports, zero alleged USDC proceeds and a required separate conversion.
This is **not** a signed transaction, finalized payout or owned-wallet trade.
The helper still returns readyForSigning/tradingEnabled false and requires the
remaining economic/minimum-return and durable accounting/authorization boundaries.

Local final glob: 792 tests, 786 passed, six skipped, zero failed. The new tests
cover captured native extension bytes, a genuine private signed-payload fixture
through the close pipeline, bad microseconds/confidence, missing confidence,
unknown suffix/config writes, regressions, copies and existing no-update paths.
No schema, production worker, backup acceptance, app publication or activation
changed. The prior native extension blocker is resolved for the verified path;
this does not establish completion of trading/automation, remaining protocol
economics/minimum-return checks, custody grants/signing/send coordination, daily
accounting, failures/retries, sibling exits or end-to-end app publication.

VPS Node 22 isolated expanded corpus: 173 tests, 172 passed, one Windows-only
ACL skip, zero failed. Artifact
`/opt/jamddmaj-perps/checks/doves-extension-20261021/tests/test.mjs`, SHA-256
`cee2249cefaf1a4b82fdcfad44ba58898af3b00a25a45634bf4d203a068cb841`;
child-process journal bundle SHA-256
`5035b1d5085e78ab0311609c265695b184d53044786f9a303c5419ebc62e713a`.
Both hashes matched before execution. Unit
`jamddmaj-doves-extension-check-20261021` exited successfully with DynamicUser,
PrivateNetwork, PrivateTmp, ProtectHome, ProtectSystem=strict, NoNewPrivileges,
UMask=0077 and MemoryMax=384M, without production state access. The task remains
active and incomplete; no funded financial operation was performed.

### Journal-bound conversion and daily USD loss accounting — 2026-10-21

Daily account reconciliation now recognizes an exact recorded collateral-to-USDC
conversion, instead of either rejecting every native PoolSwap event or allowing
arbitrary swaps. Recognition requires the original privately verified finalized
transaction, the unchanged durable close/conversion snapshot, reconstructed
native instruction roles, the actual token/SOL effects and the exact prior
finalized close. First-leg owner/API message hashes, generation, size, collateral,
return mint/amount and network fee are independently matched. Its USD basis comes
from the authenticated native first-leg `transferAmountUsd` event, not the
estimated preparation, a client total or a fabricated one-dollar USDC price.

History reads do not reconcile or mutate the journal. An uncertain conversion
may be observed as finalized while its durable row remains UNCERTAIN; the
original reservation remains OPEN. Copied facts, a foreign journal, changed
stored facts and journal changes during later asynchronous valuation invalidate
the result. Immutable transaction facts may be reused; current balances, daily
totals, leases and signing rights may not. Plain journal-independent finalized
chain accounting remains compatible with the existing authorization flow.

The read-only USD source is the direct public Kraken USDCUSD OHLC market. A live
Coinbase USDC-USD request returned 404; USDT-USD and USDT-USDC cross observations
had unequal populated minutes, so that cross-rate approach was rejected rather
than filling the gaps. Kraken's official OHLC documentation specifies bounded
recent history and an always-present uncommitted last bar:
https://docs.kraken.com/api-reference/market-data/get-ohlc-data
Actual one- and five-minute responses both contained 721 rows, including the
last bar. The reader excludes that last row and any not-yet-closed bucket. Recent
conversions use closed minute observations; older same-day conversions use
closed five-minute observations to cover the full UTC day beyond minute-bar
retention. A missing minute can use an available closed five-minute observation,
but never an open bucket, an assumed peg or a previous synthetic close.

Live minute data also contained zero-trade rows with carried-forward OHLC, VWAP
`0.0000`, volume `0.00000000` and count zero. Such rows are structurally checked
but never used as observed prices or cached for valuation, and do not poison
unrelated active rows. If the required minute and five-minute buckets both lack
actual trades, reconciliation remains unavailable; no zero loss is substituted.

Conservative conversion loss uses exact integer arithmetic: the larger of
the nonnegative difference between native first-leg USD return and actual net
USDC proceeds valued at the closed bucket low, or the swap fee valued at the
bucket high, rounded up. The fee floor avoids erasing fees with conversion
gains without adding the same swap fee twice to net proceeds. This is observed
conservative risk accounting, not an exact execution price or universal market
bound. Native SOL network fees remain separately valued and counted once from
the actual transaction receipts. A conversion is not another trade entry. A
close before UTC midnight and conversion after midnight retain the recorded
first-leg basis but only charge today's network fees to today's account.

Local final suite: 799 tests, 793 passed, six skipped, zero failed. New coverage
includes exact journal bindings, copied/duplicate facts, depegs and profitable
conversion fees, bounded intervals and retention, uncommitted/absent/malformed
observations, native zero-trade rows, fallback gaps, journal changes during
valuation and cross-midnight accounting. Existing custody preparation,
activation, signing and broadcast regression tests also pass (26/26), using
only unfunded deterministic test models and fake transports.

No SQL schema change, production migration, worker deployment, APK publication,
activation, real signing or transaction submission occurred in this change.
This advances conversion risk accounting only. Complete economic/minimum-return
checks, custody execution coordination, failure/retry handling, conversion-aware
terminal settlement and sibling-exit cleanup, and end-to-end app integration
remain required before Futuros or Telegram automation can be declared ready.

The expanded isolated VPS Node 22 corpus also passed: 195 tests, 194 passed,
one Windows-only ACL skip, zero failed. Artifact
`/opt/jamddmaj-perps/checks/conversion-daily-risk-20261021/tests/test.mjs`, SHA-256
`22aef26315f63e8a2c5f9613913ddb5099905a628fc8f570473764baaff4349a`;
child-process journal bundle SHA-256
`b532cf70f6993223574f7937d45b2b46dd14663d62fae71661075fcffe97d743`.
Both transferred hashes matched the local bundles before execution. Unit
`jamddmaj-conversion-daily-risk-check-20261021` completed with success under
DynamicUser, PrivateNetwork, PrivateTmp, ProtectHome, ProtectSystem=strict,
NoNewPrivileges, UMask=0077 and MemoryMax=384M. The production worker checksum
remained `3dfc332b8d4f4a45185fba6e95e306fd7aa501a1b5b08f7e2673ba838d607e19`;
its HTTP/control worker and HTTPS remained running, and the old Bitget executor
remained disabled. These are verification results, not a new trading release.

### Atomic terminal close accounting — 2026-10-21

`readFinalizedPerpsCloseCompletion` now provides original, short-lived,
journal-bound terminal evidence. It re-reads the exact recorded first-leg
signature and payout, requires the exact recorded conversion to be FINALIZED
when collateral must be converted, and independently reads its actual root
receipt. It then requires a fresh complete finalized daily account with native
network fees valued in USD. A missing position is not sufficient: the original
generation must remain closed/zeroed and every recorded sibling SL/TP address
must be absent in a finalized native snapshot. A legitimate retained zero
Position account is decoded rather than treated as live exposure or blindly
accepted. Pending entries/cancellations, unknown observations, incomplete costs,
copied proofs, a foreign journal, elapsed leases and UTC midnight prevent release.

`reconcilePositionCloseCompletion` atomically marks all original OPEN logical
reservations CLOSED, persists canonical actual-proceeds/accounting facts and
advances the parent close to COMPLETED. SQLite rollback preserves every prior
reservation if any terminal write or validation fails. Closing does not reset
the entry's day or daily-trade quota, replay its Telegram signal, erase costs,
delete signed packets or forget exit-request identities. A competing connection
cannot consume stale completion evidence after the first commit. A fresh repeat
is idempotent. The prepared-close uniqueness gate no longer holds a completed
wallet forever; historical signed-intent hashes retain their original PREPARED
identity, while new owner-signature claims still reject completed parents.

The normal executor now performs bounded read-only close recovery before its
ordinary position reconciliation or any new entry. It may inspect only the
previously recorded signatures, reconcile a rooted result and complete this
accounting. It has no close builder, signer, replacement blockhash or financial
submission call. Unresolved signatures, a required second leg or live sibling
requests produce CLOSE_RECONCILIATION_REQUIRED and keep capital held. This is
also available to an already-paused maintenance cycle, without activation.

Historical conversion accounting works after completion: it validates the
canonical terminal row and original CLOSED reservations, rather than requiring
them to remain OPEN forever. Encrypted recovery preserves completed financial
legs, terminal facts and CLOSED parents and remains quarantined/paused. Altered
terminal proceeds or detached parent states fail recovery validation. Terminal
records themselves are persistence facts, not fresh signing authority or a
replacement for the next complete chain/risk read.

The current journal schema is now
`e92bbd338ca88b8a85064ac669f0ae6ffb50641475b1bd62f78df48d06ccf145`.
The prior conversion-aware `42653dcbee61271989264b68e8829787afc7d1b2c5e54ae759b100571088fbaf`
is recognized for recovery but refused by normal startup. The explicitly
approved verified-empty migration retains locked admission, paused controls,
accepted recovery proof, exact private rollback copies, disposable rehearsal
and a post-DDL recovery recheck. Only after verifying the recognized source has
no financial rows may it rebuild the fixed empty close tables for the new
COMPLETED constraint. It never invokes this rebuild in the regular constructor
or automatically migrates populated archives. No production migration was run.

Local final complete suite: 808 tests, 802 passed, six skipped, zero failed. New cases
exercise full terminal release, actual USDC and native fees, zero-return and
direct SHORT payouts for SOL/ETH/BTC, retained zero positions, live siblings,
pending conversion/entries, missing USD fee valuation, in-flight journal changes,
lease/midnight expiry, competing connections, atomic disk-failure rollback,
restart, continued historical valuation, encrypted terminal recovery and the
prior conversion-aware empty schema. The maintenance test recovers only the
recorded conversion; its fake transport observes no builder, simulation, new
blockhash or sending call. All financial test identities are unfunded in-memory
models; no user/bot transaction was signed or sent.

The final paused-maintenance integration also exercises the actual executor and
worker together. A completed recorded conversion reaches RECONCILIATION_ONLY;
a live sibling remains CLOSE_RECONCILIATION_REQUIRED, which the worker preserves
in its aggregated status instead of collapsing it into a generic failure. Both
cases have zero key, activation, new-risk, signal, builder and transport calls.

Expanded isolated VPS Node 22 suite: 229 tests, 228 passed, one Windows-only ACL
skip, zero failed. Artifact
`/opt/jamddmaj-perps/checks/close-completion-20261021/tests/test.mjs`, SHA-256
`966dd1358df1e4a28636c4bac17dd44afe7c1394273ebe4aaf0e3ab85ac9ce56`;
separate child-process journal bundle SHA-256
`a7d9ca0296c91283a0fa3f3dbfdf629663c82ca41e2b01aba830e59a21dbd1e7`.
After the worker status integration, a separate focused VPS run passed its
executor-to-worker test (both maintenance outcomes): artifact
`/opt/jamddmaj-perps/checks/close-completion-worker-20261021/tests/test.mjs`,
SHA-256 `aa7e38b2fe2e5e13e66519b855536a81a988d7d236bac5cd7e8e8c15b6efe075`.
Both units completed successfully with DynamicUser, PrivateNetwork, PrivateTmp,
ProtectHome, ProtectSystem=strict, NoNewPrivileges, UMask=0077 and MemoryMax=384M.
Every transferred artifact hash matched before execution. The installed
production worker remained unchanged at SHA-256
`3dfc332b8d4f4a45185fba6e95e306fd7aa501a1b5b08f7e2673ba838d607e19`;
the control worker/HTTPS remained active, and the old Bitget executor disabled.
No production migration, backup re-acceptance, app publication or activation
was performed. All schema writes and completion transitions were disposable
test models, not financial operations on the user's or bot's account.

Still incomplete: independent first-leg minimum-return/remaining protocol
economics policy, custody close/conversion grants and submission coordination,
reviewed failed/expired-operation handling, the bridge allowing exact sibling
cancellation while a finalized manual close is held, and app/manual/24-hour
Telegram end-to-end integration and publication. Live sibling requests are
currently held for that missing cleanup bridge, not silently abandoned. The
new terminal accounting does not establish that Futuros is ready for activation.

### Held manual-close sibling cleanup bridge — 2026-10-21

The blanket prepared-close cancellation block has been replaced with a narrow
private exception. Orphan discovery still proves the exact original entry and
native pending request. For a held manual close, it additionally re-reads the
recorded finalized first-leg signature and actual payout and matches the stored
canonical receipt. It must be the whole-position closure, the exact held close,
wallet, position, original reservation/entry plan and journal instance. A generic
or copied orphan proof cannot become this exception. Its private identity and
binding are frozen; any changed close/execution/entry/route snapshot invalidates
the original proof, including during authorization, before key use and before
transport. A finalized conversion raises the minimum account bank rather than
allowing cleanup from a bank predating that financial operation.

The journal checks this original binding atomically when claiming cancellation
preparation and signing. The existing custody-only cancellation authorization
also rechecks it together with current controls, verified backup, native request,
SOL funding, runtime approval and short leases. No new generic signer or retry
path was added. A still-prepared/signing/uncertain conversion blocks cleanup;
conversely, any pending cancellation blocks conversion before preparation RPCs
and at each later durable claim. Thus the two financial actions cannot overlap.
USDC-collateral and zero-return closes retain their existing no-conversion path;
an intermediate overly broad conversion guard was caught by the full suite and
fixed before any deployment, rather than changing that legitimate behavior.

Before preparing the second leg, bounded close recovery can discover live sibling
requests from at most 20 original addresses. Only an execute cycle may dispatch
the existing one-request cleanup coordinator. Maintenance remains read-only.
Paused entries do not imply permission to close an open position: this cleanup
requires the recorded whole position already closed and the separately approved
execution runtime. A builder acknowledgement retains UNCERTAIN cancellation,
PREPARED close and all original OPEN reservations; no capital is released and no
second attempt occurs until rooted reconciliation. Completed close accounting
continues to require actual conversion proceeds, complete daily costs and the
absence of every sibling. Other wallets/positions/entries are not eligible.

The reused API contract was checked read-only against Jupiter's current official
CLI client: its v2 client prepares cancellation of an identified TPSL request and
separately submits an owner-signed transaction with the cancel-tpsl action:
https://raw.githubusercontent.com/jup-ag/cli/main/src/clients/PerpsClient.ts
No live cancellation builder or execution endpoint was called in this change.

Directed tests cover private/journal-specific immutable bindings, unprepared or
interrupted first legs, unrooted/mismatched payouts, exact paused cleanup through
the real coordinator, retained original margin, every pending cancellation phase,
concurrent conversion phases, stale banks after finalized conversion, async
changes during risk reads and changes before key use or transport. Only public
deterministic unfunded models are signed, over invalid fixture blockhashes, using
in-memory transports. No user/bot key or real financial transaction was used.

The schema remains
`e92bbd338ca88b8a85064ac669f0ae6ffb50641475b1bd62f78df48d06ccf145`.
No production schema/worker change, backup re-acceptance, activation or app
publication occurred. Remaining work still includes first-leg minimum-return/
remaining economics policy, actual close/conversion custody coordination,
reviewed expired/failed-operation handling and app/Telegram end-to-end integration
and publication. This bridge removes the prior held-close cleanup deadlock; it
does not establish overall Futuros readiness.

Final local suite: 815 tests, 809 passed, six skipped, zero failed. The affected
VPS Node 22 corpus passed 136/136 with no skips/failures: individual-entry and
whole-position cleanup, close execution/conversion/completion, native payout,
daily accounting, custody/signing/submission, worker and executor regression
flows. Artifact
`/opt/jamddmaj-perps/checks/manual-close-cleanup-final-20261021/tests/test.mjs`,
SHA-256 `d27076ba6ac2625c9259b5b8be266913b59e6c37aee125d0adeacbb1d16004df`;
separate child-process journal bundle SHA-256
`938095fb07f72f85ecaaf448aabc0d13f89461c140541878e4b00a8675d83676`.
Both hashes matched the transferred artifacts before execution. Unit
`jamddmaj-manual-close-cleanup-check-20261021` completed successfully with
DynamicUser, PrivateNetwork, PrivateTmp, ProtectHome, ProtectSystem=strict,
NoNewPrivileges, UMask=0077 and MemoryMax=384M. The initial bundle before the
no-conversion regression fix was not executed on the VPS and is not this final
verified artifact.

A separate read-only production metadata check confirmed the unchanged
`cba66ff21abc8f2dd3db1bbebbbc3908a9d8cda2fa24b41a2191e184c5477e54`
live journal schema, zero reservations and one disabled/paused account. Installed
worker SHA-256 remains
`3dfc332b8d4f4a45185fba6e95e306fd7aa501a1b5b08f7e2673ba838d607e19`;
the control worker and HTTPS are running, while the old Bitget executor remains
disabled. No private settings, identifiers, custody keys or signed wires were
read or exposed by that aggregate diagnostic.

### Web Futures review and shared browser-wallet connection — 2026-10-21

The reported `Trading requires a compatible Android build` notice came from
`setupFuturesTicket`: all browser Long/Short controls were disabled because the
only execution navigation was the NativeWallet Android review event. This was
not an RPC balance failure. The user explicitly selected an integrated JamdDmaj
web flow, **without redirects to Jupiter**.

Browser Futures now offers explicitly labelled Review Long/Short and wallet
selection. `POST /api/perps-review` accepts only a bounded public wallet address
and canonical manual form, uses the existing quota, reads actual native wallet
funding, then joins the existing Jupiter preparation, cosignature/envelope,
lookup/custody/PDA, core intent, token/pre-swap, same-wire position/exit simulation
and exact funding/rent gates. Funds are checked again at or after the simulation
bank. The response contains display facts only, **no transaction bytes**, no
signature authority and `tradingEnabled:false`. Insufficient USDC and SOL are
distinguished rather than attributed to Android. Malformed, mismatched, expired
or in-flight responses for a changed account/form are discarded. Editing or
switching accounts aborts the outstanding review and restores the buttons.

This route is a Node Web Standard `fetch` handler, not an Edge function. The
Edge dependency gate still covers every existing Edge route; a separate Node
bundle check verifies that manual review includes native funding/envelope
validators but not custody, execution journals or submission transports.

`perps-web-wallet-session.js` separately binds an explicitly connected Wallet
Standard Solana account/provider in memory. It verifies public-key/address,
mainnet, current accounts, feature version and transaction-version capabilities;
it exposes only public connection status and **no signing API**. Assets and
Futures share the same built module rather than separate bundled stores. A
remembered watch address is not a restored signing session; Assets now lets the
user reconnect in place. Disconnect/account/network changes invalidate the
binding. This does not authenticate ownership through a signature.

The built-page browser check in
`.perps-build/web-futures-review-20261021/browser-check.mjs` connects an unfunded
fake Wallet Standard provider through the actual Assets UI, checks the shared
connection in Futures, traverses the local HTTP review handler using an injected
review fixture, renders the result, and navigates back to wallet selection at
1365px and 390px. Both ran without uncaught page errors or horizontal overflow;
the fake signing method was never invoked. Separate tests exercise the full
native review pipeline with unfunded deterministic wire/RPC models, including
insufficient and changed funding, extra SOL debit and expired preparation.
`npm run build:web` passed. No real provider signing, mainnet transaction send,
bot activation, production deployment or APK publication was performed.

**Still incomplete:** reviewed exact-wire Phantom authorization, durable browser
and server submission/reconciliation and actual web execution; this change must
not be described as enabling web trading. The earlier first-leg minimum-return,
close/conversion custody coordination, expired/failed recovery, full app/bot
integration and publication requirements also remain. No external-market link
or redirect was added as a substitute for the requested integration.

The general local run passed 828 tests (822 passed, six skipped, zero failed),
including the unchanged financial/custody/worker regressions. The initial run
correctly failed the all-Edge assumption for the new Node route; it was fixed
with explicit Node/Edge bundle coverage, not by making Node crypto available to
Edge or removing validation. A subsequent targeted regression also covers a
transport that ignores an abort and returns late, without leaving review status
stuck or showing an expired result. These are local verification results, not
proof of a production deployment or successful web trade.
