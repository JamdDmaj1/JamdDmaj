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
