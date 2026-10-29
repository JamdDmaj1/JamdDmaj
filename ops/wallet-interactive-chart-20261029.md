# Wallet historical chart interaction — implementation verified, not published

Replaces the static SVG with local, read-only zoom (wheel, pinch, buttons),
horizontal pan, candle selection with timestamp/OHLC, keyboard exploration,
price/time axes and reset. Mobile chart height has a 240px minimum. Vertical
page scrolling remains allowed. No new requests, funds movement, wallet
authorization or live-price claims. Uses only the fetched 1h candle snapshot.

Three tests passed covering market identity, panel behavior and chart gestures.
Browser at 390px with 51 holdings verified visible panel, zoom, wheel, keyboard
inspection, reset, focus restoration, visible network error, no overflow/errors.
Web build passed. Synthetic data used for interaction tests, not user funds.

Discover HTML/JS now explains historical interactions. Reviewed Discover CSS
and tour CSS: existing responsive styles need no change for this feature.
Publication/versioned Android packaging remains pending; not available in the
already published 1.38.10 APK.

Additional token statistics: DEX Screener exact-mint selected pair now exposes
separate marketCap/FDV, 1h/6h/24h changes, pair liquidity/volume/buy/sell counts,
DEX, quote symbol and pair creation time. Nonnegative metrics reject invalid,
empty, negative and boolean values. No FDV fallback for absent market cap.
UI uses labeled responsive tiles, missing values explicitly Unavailable.
DEX Screener official API reference schema reviewed 2026-10-29.
Six focused tests pass; browser verifies 10 metrics, distinct cap/FDV and missing
labels alongside chart interactions. No changes to authorization or trading.
