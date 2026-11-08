# Account equity and sharing open positions — candidate 1.38.27

Web-only display and local image export. No API, VPS binary, database, strategy,
funding, signing, order permission, fee or slippage changes. No real trade,
financial transaction or social post is used for verification.

## Display scope

New primary estimate = observed wallet USDC (explicit approximation 1 USDC =
1 USD) + observed position USD collateral + summed indicative price PnL.
Realized history is NOT added: its proceeds are already reflected in the
wallet. Margin is not subtracted from wallet cash a second time. Excludes SOL,
other tokens, funds in transit and pending fees/funding/closing costs. Existing
collateral may already reflect previously charged costs; no fee is subtracted
again by this display. It is not liquidation equity or guaranteed withdrawal.

Requires a fresh validated public snapshot (30 s) and a fresh price reference
(15 s) for every position. Missing prices withhold the entire PnL sum/total,
not an invented zero or incomplete subtotal. Zero positions need no quote.
Wallet cash and collateral remain separately labelled. The pending/reservation
gates in currentWalletTradingState and all order-sizing sources remain intact;
in particular watch-wallet availableUsdcUnits remains null. The new total is
NEVER published as available trading funds or passed to a signing/risk path.

## Open-position PNG

Uses the existing share-card canvas renderer with a distinct OPEN_POSITION
model. Price PnL in USD and percentage on observed collateral are explicitly
estimated/unrealized, before fees/funding/closing costs; they are NOT the closed
trade's USDC cash result. Image always includes snapshot time + unrealized
warning, even if the optional full date is hidden. Amount/margin/date default
off and percentage defaults on. Same light/dark and landscape/square choices.
No wallet, position address, account name, balance or account equity is copied
into the share model/image. The preview is a frozen snapshot, not a live quote.

The shared dialog implementation is now used by both closed and open cards.
Open export rechecks account object identity, fresh snapshot, continued position
presence, unchanged asset/side/entry/size/collateral and maximum 60 s since
capture. Account switch or changed/closed position removes the preview and
invalidates pending PNG encoding. Expired state blocks export and explains
refresh/reopen; it never opens/closes/retries a financial operation. Local PNG
download and explicit OS share only; unsupported sharing falls back to download.

## Verification plan/evidence

Pure tests cover positive/negative/zero positions, missing/stale/future quote,
partial-price rejection, duplicate position, exact basis sum, frozen open model,
unrealized/USD labels and absence of wallet/position identifiers. Existing
wallet-state sizing/pending/ABA tests remain gates.
Compiled actual public UI at 1280/390 px verifies equity, retained unknown
available funds, no horizontal overflow, local PNG, native share mock and
delayed encoder after position removal. Existing closed share tests verify
privacy toggles, cancellation, fallback and wallet-race behavior after refactor.
Images use synthetic unfunded fixture data; no active user position is touched.

Discover HTML/JS updated for equity scope and open sharing; Discover CSS/tour CSS
reviewed and unchanged because responsive product layout is unchanged. Finance
CSS cache version bumped. Build copies the four pure UI imports needed by the
existing raw public trading-panel module as well as bundling them in assets UI.
APK stays unchanged. Previous handoff ZIP is an older dated snapshot.
Staged/public comparison and publication evidence will be appended.
