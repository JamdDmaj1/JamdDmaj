# Product follow-ups — 2026-10-29

Original implementation notes; publication status is superseded by
`release-1.38.8-20261029.md`. Web and Android 1.38.8 are now verified published.
X connection and actual paper-ledger attribution remain incomplete.

## X

Daily heartbeat `novedades-jamddmaj-en-x` created for verified shipped updates
only, maximum one daily summary. No post sent. Metricool connection to
@JamdDmajGroup remains required; the connector was suggested in the conversation.
No private balances, user activity, credentials or profit promises may be posted.

## Signal diagnostics

New pure read-only diagnostic groups partial exits by signal ID and excludes
still-open positions. It reports mean win/loss, net expectancy, estimated fees,
profit factor and per-symbol net outcomes. Retained history may be truncated;
this is not a full historical audit or proof of improved predictive accuracy.
No real strategy, risk settings, live activation or account balances changed.
Further work: inspect actual historical losses, capture missing entry features,
and validate candidate changes out of sample with fees and slippage before any
claim of improved precision or change to production signal generation.

## Wallet tokens

Wallet overview now offers a per-token information panel using exact Solana
mint identity. DEX Screener supplies indexed market metrics; the most liquid
matching base-token pair links to its external chart. No fabricated historical
chart, trade-history chart, verified badge or safety rating is generated.
Verification is explicitly unknown. Remaining: inline historical charts and
independently sourced verification metadata, including unavailable-data states.

Discover files reviewed for this work. No feature announcement is made yet:
these local changes are not published. Discover must be updated and both sites
verified before publication. Existing unrelated working-tree changes preserved.

Focused tests: 6 passed (diagnostics, exact-mint selection, existing wallet swap
dispatch). Full build/regression and publication still pending.
