# Closed trade results and local PNG sharing — published 1.38.26

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
## Publication evidence

Source 73c6f2e8a82232862d88c853b66f8cbf7acd1011.
Focused performance, privacy, client/API and panel tests: 23 passed, zero failed.
Native close/update-guard suite: 89 passed, one optional browser case skipped,
zero failed. Real compiled browser/canvas tests passed at 1280 and 390 pixels:
gain/loss colors, hidden-by-default cash/margin/date, toggle changes, 1200x675
PNG download, 1080x1080 format, mocked native share/cancel, unsupported-share
download fallback, and delayed encoder refusal after wallet change. Previous
manual close/entry desktop/mobile UI check also passed. QA images are synthetic.

Read-only-source isolated real-history validation confirmed one recorded
COMPLETED item qualifies for cash performance; no values/private addresses
were logged. This is not an independent total-net-PnL audit.

VPS binary-only preflight/install succeeded; all services healthy; all seven
logical financial database fingerprints unchanged. Policies unchanged; zero
financial sends/signatures, no automatic activation, no schema migration.
Worker SHA256 7f681c890f8306a69f399bf09ba0a480a38b8556c1db29e5bb036d68dd57b4d5;
web SHA256 dc4d88e75f0b846ca743c0d1d1a4a95035ab9cb8483a50f1e65b3a6e47b71152.
The web-service binary is unchanged; the worker adds read-only projection.

Vercel production deployment dpl_723MmsQGyUEbmcoF7qWuwiw99aoF, READY, framework
Other, remote build approx. 18 seconds. Staged URL:
https://jamd-dmaj-dt5s8cd5f-jamd-dmaj-s-projects.vercel.app
Nine artifacts matched tested local outputs before promoting that SAME build.
Canonical public domain subsequently matched all nine artifacts (main HTML,
Discover HTML/JS/CSS/tour CSS, Finance CSS, assets bundle and two bot UI bundles).
An initial immediate post-promotion Discover comparison was temporarily stale;
its version then resolved to 1.38.26 and the full canonical comparison passed.
Bounded post-deploy Vercel error-log query found no matching errors, not proof
of exercising every authenticated live account path. No real social post or
financial operation was used to verify this release. APK remains unchanged.
