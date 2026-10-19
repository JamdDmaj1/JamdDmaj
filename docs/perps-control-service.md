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
