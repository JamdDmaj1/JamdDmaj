# JamdDmaj AI v1.29.0

- Telegram sends an hourly 24/7 heartbeat when no new setup or event was produced.
- Scheduled scans use an offset five-minute schedule to reduce GitHub congestion.
- Profit protection defaults to trigger at +4% estimated ROE and protect approximately +2% before fees.
- Reaching TP1 also activates the +2% suggested protected level.
- Position planning now supports configurable hypothetical USD amount, leverage, trigger ROE, and protected ROE.
- ADX trend strength is required in addition to the existing 1h/4h, volume, liquidity, spread, funding, RSI, MACD, momentum, structure, and volatility checks.
- Live Bitget order execution is intentionally not enabled; the app keeps API trading permissions and funds outside JamdDmaj.
