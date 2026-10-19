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
6. Finish partial-position/individual-exit reconciliation: currently logical
   entry risk remains held until the aggregate position is fully closed.
7. Verify all requested controls and manual execution through the actual app,
   including balances, limits, SL/TP inheritance, pausing, daily loss responses,
   restart recovery and unknown-transaction reconciliation.
8. Complete release and production verification. Do not equate controls-only
   health, a passing suite, a preview, or an APK artifact with trading readiness.

No production custody master key or exclusive wallet was created by this
control-service deployment, and no funds were moved.
