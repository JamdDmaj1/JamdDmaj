# Manual Futures read-provider investigation

User reports repeated rpc-rate-limit after recipient ATA preparation. Installed
worker has no custom read RPC configured. Public shared Solana transport can
pass an unsigned review in isolation but is not reliably available for the user.
No claim that the user flow is complete is warranted.

Checked the official Solana public-endpoint limits and PublicNode's published
Solana endpoint. Added an explicit diagnostic-only PublicNode selection to the
existing no-signer/no-submit probe, with bounded method counts and timing on
success. No secrets or financial payloads are logged. Argument validation rejects
any other selector; the installed runtime defaults and configuration are unchanged.

Actual server BTC SHORT and SOL SHORT unsigned alternative-provider probes both
returned UNVERIFIED_SERVER_PERPS_SIMULATION after getBlockHeight (HTTP 200,
no JSON-RPC error). The precise underlying consistency/expiry mismatch has not
been established; these failures are not evidence that the provider is generally
unusable. Do not bypass the simulation/freshness checks or deploy this endpoint
as an unverified fix. No signer, transfer, send, activation or service restart was
performed. No paid provider was provisioned and no credentials were acquired.

Next required input is an operator-owned free-tier RPC account/connection, then
the same unsigned validation before any runtime configuration change. Never ask
for credentials in chat, expose them in browser code or repository, or enable
automatic billing. Free tier is not a dedicated validator or availability SLA.

Discover HTML/JS/CSS/tour reviewed for relevance: no user-facing release or
availability change was made, so no content/version edits are appropriate.

## Operator-owned Helius connection installed

User created a Free account and supplied the Mainnet HTTPS connection in the
agreed local Documents file. Validation and transfer never printed the URL or
key. The input remains private under /root; installed environment file is
/etc/jamddmaj-perps/helius-read-rpc.env, root-owned 0600. The worker-only
80-read-rpc.conf references that file, not its contents. Nothing was inserted in
browser assets, Vercel, repository, shell arguments, or logs. No billing was
enabled. Free-tier access is still quota-limited, not an availability guarantee.

Before applying: unsigned BTC Short review passed (1066ms) and protected BTC
Long conversion preparation passed (577ms), using the private staged connection.
Installer verified all controls disabled/paused, no journal reservations and no
pending swaps, then stopped the worker, rechecked, exclusively created new
configuration and started it. No custody key, signer or send API was used.
Installed process environment was checked for exact equality without printing it.

Stopping the worker also stopped its bound web/HTTPS dependents. Immediately
started those two services explicitly; all three independently active with
NRestarts=0. Both local health ports and trusted public HTTPS health succeeded;
tradingEnabled=false. Installer source now includes restarting both dependents
on apply and rollback. Preserve the already-run remote installer artifact; do
not rerun an exclusive installer against existing configuration.

Post-install diagnostic using actual worker environment passed BTC Short
review (977ms, 25 read/simulation requests) and protected BTC Long conversion
preparation (593ms, 13 read/simulation requests). All replies submitted=false,
readyForSigning=false. Transport tests 6/6 passed; no financial runtime source,
50-bps limit, database, platform commission or send transport was changed.
These are backend unsigned proofs, not proof that the user's authenticated UI
review has now succeeded or that a real-money position has executed. Next step
is a user review-only check; never instruct confirmation as a diagnostic test.
