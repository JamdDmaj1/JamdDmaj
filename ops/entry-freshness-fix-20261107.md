# Manual entry review freshness

Published and verified as described below. Goal: repair manual opening without sending any
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
Web 1.38.25; APK remains 1.38.17.

## Deployment evidence

Financial source c156bbc488fad1bac2a9238a260c7bd3e37bdb71; independently tested
operator guard source 0dd1f6af3fc271f695cdde5ca2ae8250f9322b4c.
Preflight and binary-only installation succeeded. Worker/web/HTTPS active;
all seven logical financial database fingerprints unchanged, policies
unchanged, all automation paused, zero financial sends.
Worker SHA256 420f69a0294f12f442371755fbd89b94b149e1c9159d674083a7c87c06af748c;
web SHA256 dc4d88e75f0b846ca743c0d1d1a4a95035ab9cb8483a50f1e65b3a6e47b71152.

Opening/recovery/API/client suite: 117 passed, zero failures. Separate native
close/old fingerprint suite: 88 passed, one optional browser case skipped.
Updated terminal-unsent operator guard: two passed. Compiled desktop/mobile
manual UI passed with financial transports mocked.

Vercel production deployment dpl_84rRJti8eVm1YsxFAQBjMpWsiLtV, READY, source
c156bbc; framework Other; remote build approx. 16 seconds. Stage URL:
https://jamd-dmaj-8rj2nxrlb-jamd-dmaj-s-projects.vercel.app
The CLI reported a late authorization error, but authenticated deployment
inspection showed READY; authenticated asset comparisons passed. Promoted
that SAME production build without rebuilding. Canonical public site and
Discover subsequently matched all seven tested assets, including both manual
position/entry bundles and Discover JS/CSS/tour CSS. Bundle path normalization
only removes build-directory prefixes before node_modules comments.

Post-deploy bounded Vercel error-log query found no matching errors. This is
not proof that every dynamic user path was invoked. No real trade was opened
or signed for verification: on-chain preparation plus isolated signature-boundary
reproduction and mocked complete flows are the available execution evidence.
The real existing completed close separately passed the history snapshot
validator on an isolated SQLite copy. No live journal writes for that check.
