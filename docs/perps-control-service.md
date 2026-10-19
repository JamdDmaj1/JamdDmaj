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
