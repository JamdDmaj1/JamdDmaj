# JamdDmaj AI 1.36.1

Precision update for Pro Signals.

## What changed

- Added a regime gate to the VPS executor.
- Extreme Fear / risk-off markets now require stricter scores before Telegram or Bitget.
- Non-core LONG trades are blocked during extreme fear.
- Risk-off mode lowers effective live leverage and margin caps.
- Executor heartbeat now reports the active market gate.
- Paper trading marks abnormal ROE data as CHECK instead of showing misleading huge percentages.

## Recommended VPS env

```env
JAMDDMAJ_BITGET_MODE=dry-run
JAMDDMAJ_MIN_LIVE_SCORE=14
JAMDDMAJ_STRICT_REGIME_MIN_SCORE=16
JAMDDMAJ_MAX_LIVE_MARGIN_USD=3
JAMDDMAJ_DEFENSIVE_MAX_MARGIN_USD=3
JAMDDMAJ_DEFENSIVE_MAX_LEVERAGE=5
JAMDDMAJ_MAX_TRADES_PER_DAY=1
JAMDDMAJ_MAX_CONSECUTIVE_LOSSES=1
JAMDDMAJ_ALLOW_MEME_LIVE=false
```

Keep dry-run until the recent backtest is positive and the Telegram stream is selective.
