# Position metrics and existing full-close access

User asked for live profit/loss, percentages, taking profit and partial closes.
This release is a PARTIAL delivery of that request, not completion of partial
execution or post-opening TP/SL. Those actions are absent from the existing
server orchestration and must not be invented as working buttons.

Frontend-only additions: bounded public Jupiter market-reference reads, entry
price from the already validated chain snapshot, indicative price-only PnL in
USD and percent of observed collateral. Exact BigInt display math:
sizeUsd * (reference - entry) / entry, reversed for Short; return uses observed
collateral. Not net settlement: explicit exclusion of fees, funding and close
costs. No new liquidation estimate or realized-profit claim. Missing/stale (>15s)
quotes and stale wallet snapshots cannot show a fresh zero-profit claim.
Price refresh starts at most once/asset/panel per five seconds while visible;
in-flight calls deduplicated and disposed panels do not rerender. Display values
are never signing, risk, simulation or settlement evidence.

Manage/close dispatches a wallet-bound UI intent only. Existing bot positions
panel reads authenticated positions, selects only a server-tracked match and
prefills a still-recent reference. It navigates to Futures and exposes the
existing full-close flow. Does NOT invoke prepare, confirm, a signer or send.
Changed/foreign identity, untracked row or stale reference cannot authorize a
close. Existing separate review, unchecked consent, native price checks and
one-send/pending recovery remain unchanged. UI explicitly states that partial
closes and existing-position TP/SL updates remain unavailable in JamdDmaj.

Tests: 21 focused display/state/navigation/consent/Discover/APK tests passed.
Compiled browser desktop/mobile checks verify +0.40 USD/+4% Short fixture,
price/fee disclosures, unknown/stale data, read-only management intent, foreign
intent refusal, matching tracked position, prefilled reference, unchecked
consent, zero prepare/confirm calls and no external financial calls. Existing
compiled opening/close consent diagnostic passed separately. An isolated clean
browser with the public app origin successfully read the actual public Jupiter
BTC reference (no wallet supplied, no signature or send).

Discover HTML + English/Spanish copy, CSS/tour reviewed; copy distinguishes
indicative metrics, existing full close and pending partial/TP/SL functionality.
No VPS commands, schema/policy/balance writes, restarts, live-wallet actions or
backend execution changes are required. Web/source 1.38.23; no new APK claimed.

Partial delivery awaiting staged/public verification. Do not report the whole
user request complete or say partial closes / post-open TP are implemented.
