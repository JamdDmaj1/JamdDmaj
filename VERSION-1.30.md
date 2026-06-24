# JamdDmaj AI v1.30.0

- Automatic server-side paper trading follows new Pro calls without using real funds or exchange credentials.
- Paper positions include margin, notional, leverage, estimated round-trip fees, realized/unrealized PnL, ROE, equity, win rate, and maximum drawdown.
- A private resettable paper account starts at a configurable balance.
- Historical walk-forward testing uses recent Bitget 1h candles, 4h confirmation, volume, EMA, RSI, MACD and ADX without future-data leakage.
- Backtest results show TP1 hit rate, estimated 10x expectancy after fees, ambiguous candles, and per-token performance.
- A separate GitHub watchdog checks scanner freshness every 15 minutes, attempts automatic recovery, and alerts Telegram on failure or recovery.
- Live exchange order execution remains disabled until paper and backtest evidence justify further testing.
