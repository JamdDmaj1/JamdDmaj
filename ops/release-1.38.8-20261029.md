# 1.38.8 — publication verified

## Scope and limits

- Wallet token details by exact Solana mint: inline historical OHLC candles,
  indexed price/liquidity/volume, Jupiter verification state with source and
  explicit distinction from a safety audit. Missing sources remain unavailable.
- Read-only paper diagnostics group partial exits and exclude still-open trades;
  net expectancy, estimated fees, average win/loss and per-symbol results refer
  only to retained history, which may be truncated. No live strategy change.
- Fixed volume/ADX/candlestick candidate measured on a chronological holdout
  with additional slippage stress. Never automatically promoted to live use.
- Chat catch-path diagnostics log only fixed stage/status, not prompts or access
  credentials. Provider transport/invalid-response errors refund credits and
  return a provider-specific 503 instead of an undifferentiated 500.
- Android session persistence was already shipped in 1.38.7. Its multi-device
  and cold-start unit checks pass; actual phone cold-start confirmation remains
  user-side. No new claim of a reproduced/fixed production CHAT_SERVICE_500.

## Historical experiment

Public Bitget candles, 12 highest-volume current contracts (including noncrypto
contracts), read-only audit at 2026-10-29T11:22Z. Retained locally at
`.perps-build/signal-audit-20261029.json`. Only 16 decided holdout samples,
8 wins/8 losses; insufficient evidence. BTC baseline holdout -0.11 ROE, -1.11
with extra slippage; SOL -10.88 baseline, MU -11.03. Tiny per-symbol samples
(1–2 trades) are not evidence for excluding pairs or trading others. This is
not the actual paper/real execution ledger and does not explain all prior losses.

## Verification so far

- Focused market/holdout/server tests: 77 passed.
- Token research/UI routing tests: 6 passed.
- Chat/session integration tests: 7 passed, including provider timeout/empty
  replies with credit refund and no sensitive upstream text returned.
- Browser: desktop and 390px mobile inline candles, source/safety copy, close,
  no horizontal overflow or console errors. Synthetic dataset; no wallet access.
- Live read-only SOL lookup returned Jupiter verified and 100 GeckoTerminal
  candles with DEX Screener market metrics.
- Discover HTML/JS updated to explain token research and simulated diagnostics;
  existing discover.css/discover-tour.css reviewed; no layout changes necessary.
- Full local regression: 1199 tests, 1180 passed, 19 skipped, zero failures.
  Subsequent focused final checks: 75 passed. Build succeeded.
- Web source commit `2db2347`, production deployment
  `dpl_Deb4yARWtDFWpqpDwJhrBEQi8sVm`:
  https://jamd-dmaj-nf09lpk50-jamd-dmaj-s-projects.vercel.app
  Candidate bytes for index, Discover HTML/JS, funding and trial bundles matched
  local built output before promotion. Candidate real token lookup succeeded.
- Promoted to https://www.jamddmaj.com. Public browser verified current Discover
  through old `?version=1.37.69` URL, updated text, desktop/mobile layout, and
  main welcome/check control. No browser JavaScript errors. Anonymous write
  requests were blocked by the test harness, not executed.
- Bounded post-deploy runtime scan: zero error records in 10 minutes. This
  does not prove an authenticated chat request or actual phone restart works.
- Android workflow 40866261877 completed successfully. Non-draft/non-prerelease
  https://github.com/JamdDmaj1/JamdDmaj/releases/tag/v1.38.8 contains APK and
  checksum. Downloaded public APK SHA256 matches published checksum:
  `907cfb9d820e6d258d5a03b5ac79fa40a52695e12cd70f365a4f1cb422c8c50b`.
  apksigner verified the unchanged permanent certificate SHA256:
  `d4799319516f9b243b12ef4678823baed39d9203e42fa70f8de0ba0f7c0080d6`.
  aapt confirmed `com.jamddmaj.ai`, code 164, name 1.38.8.
  Public `/api/status` reports webVersion/latestVersion both 1.38.8 and the
  exact published APK URL. No device install, reset or wallet transaction.

## Remaining evidence gaps

The production paper ledger cannot be read using the current local connection:
Vercel correctly withholds production Secret values. No secret file created,
requested or printed. The owner can supply the aggregate diagnostics now visible
in the paper panel; actual failed trade attribution needs this retained ledger,
not only the independent historical-candle experiment. Real chat reproduction
was requested from the user after publication; no response received yet.

## X

Heartbeat `novedades-jamddmaj-en-x` active for verified shipped changes only.
Metricool brand 7731453 returns no connected social networks. No post sent and
no account identity verified. User must link @JamdDmajGroup in that brand.
