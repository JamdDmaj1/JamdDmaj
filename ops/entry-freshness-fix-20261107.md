# Manual entry review freshness

Candidate, not yet published. Goal: repair manual opening without sending any
real trade or widening the user's 50 bps conversion protection.

Authenticated production metadata: three terminal CANCELLED attempts, each
without a recorded signature; their funding swap records are unsent ABORTED.
No OPEN/SIGNING/UNCERTAIN/RESERVED entry remained. Prior close is COMPLETED.

Root cause reproduced on isolated SQLite snapshots with NO custody vault/key,
signing implementation or financial transport: first rooted-history read ran
after constructing the exact conversion quote. It consumed nearly all the
10-second preparation lease (only 1567 ms remained in one reproduction).
Confirmation expired before signing, producing an unclassified generic error.

Change: warm verified custody accounting before constructing either the native
manual order or its strict collateral-conversion review. Keep the mandatory
post-simulation minimum-slot account read and all confirm/sign-time checks.
No lifetime, stale-evidence allowance, quote minimum, custody authority, daily
limit or send/retry policy is widened. Add five fixed public conversion error
codes; never expose raw provider errors. UI treats a stale review as requiring
status consultation and another explicit review, never an automatic retry.

Isolated corrected reproduction reached DIAGNOSTIC_SIGNATURE_BOUNDARY_REACHED;
that injected boundary throws before signing. submitted=false. Diagnostic-only
co-sampling preserves same-bank equality, commitments and exact wires; it is
NOT installed as the production RPC transport. The worker's configured RPC
was used; the unrelated web process has a public default and is not evidence
of custody-worker configuration. No configuration/credential changes performed.

Regression adds six seconds of initial history latency for BTC/ETH/SOL and
asserts that it finishes before the review's unchanged 10000 ms lease begins.
Tests retain mocked one-use execution, uncertainty, failure, custody and scope
checks. Full existing suites and compiled desktop/mobile UI are release gates.

Binary-only rollout fingerprints all seven logical databases, excluding only
request-quota counters. It refuses pending signing/unknown actions. Historical
HELD entry rows are allowed ONLY with CANCELLED parent, null hold signature and
wire hash, and matching ABORTED swap with null signature AND signed wire. They
remain untouched and fingerprinted. Never restore a database or release a hold.
Exact installed/candidate binary hashes, paused automation, health checks,
graceful stops, atomic replacement and binary-only rollback remain mandatory.

Includes previously requested closed-history UI/API; no net PnL claim. Discover
HTML/JS reviewed and updated for that feature. Discover CSS/tour CSS reviewed;
existing responsive layout is unchanged and needs no cosmetic timestamp edit.
Web target 1.38.25; APK remains 1.38.17. Deployment evidence to be appended.
