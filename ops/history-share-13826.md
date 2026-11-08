# Closed trade results and local PNG sharing — candidate 1.38.26

User requested colored percentages and a configurable share image. This adds
read-only cash performance plus a responsive trade journal and browser canvas
export. It changes no financial method, risk limit, signing path, strategy,
slippage, fee rate, schema or live journal entry.

## Result scope

Only validated COMPLETED native close snapshots can carry `performance`.
Require all original entries CLOSED, same wallet/position, unique reservation,
manual reservation identity, positive safe-integer contributed USDC and
nonnegative recorded opening platform fee. The sum of signed entry-plan sizes
must exactly equal the completed generation's native size. Unmatched partial
exits/additions or missing basis return null, never zero or fabricated profit.

Result = finalized received USDC minus registered contributed USDC margin
minus recorded opening platform fees (accrued obligation, not a paid-status
claim). Return percentage uses contributed margin as denominator, integer
arithmetic and half-away-from-zero rounding to two decimals. Funding/protocol
costs reflected in actual settlement are thereby reflected in the cash return;
no separate estimated fee is double-subtracted. SOL network fees/rents are NOT
converted to USD or silently counted as zero. All UI/images disclose this.
`netPnlUsdcUnits` remains null: this is not total net USD PnL. Daily account loss
is never used as per-order profit. The client independently checks totals,
arithmetic, sign, denominator and scope before displaying a performance object.
Older servers without the optional field safely show unavailable.

The existing real completed close passed the new basis calculation on a
private, isolated SQLite copy: performanceAvailable=1. No real financial action
or live state write was needed for that test. Amounts are not logged here.

## Presentation and privacy

Profit/positive green, loss/negative red, unavailable/zero neutral with explicit
text (not color alone). Expandable breakdown separates capital, opening fee,
proceeds and close time. USDC is labelled USDC, not converted into USD by fiat.
Images use an explicit allowlist, never raw wallet, position, signature, balance
or receipt JSON. Percent is on by default; cash amount, margin and date off.
Two themes and landscape/square formats. Every chosen field is previewed.
No external image, upload, telemetry event or social post is generated. PNG is
local; native sharing requires the user's click and OS menu. Missing/unsupported
file sharing falls back to download. Cancellation is not reported as success.
Wallet change/disposal cancels a pending encoder and removes old previews.

Focused math/client/API tests and compiled desktop/mobile canvas checks are
release gates, including download dimensions, toggle privacy, native share,
cancel/fallback and delayed encoder after a wallet change. Existing native
close and update-guard suites also run. Example QA images use synthetic data.

Discover HTML/JS updated; CSS/tour CSS reviewed and left unchanged because its
existing responsive product layout needs no visual adjustment. Finance CSS
cache URL is bumped. No Android APK is built or newly announced. The previous
handoff ZIP remains a dated 1.38.25 snapshot, not this newer release.

Binary rollout must use current exact 1.38.25 hashes and the existing pure
financial-state fingerprint guards. New candidate/backups use distinct names.
Refuse live pending actions or active automation; no automatic pause, release
of holds, migration, database restore or financial test is authorized.
Publication evidence will be appended after verification.
