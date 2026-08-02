# Candlestick research used by JamdDmaj

JamdDmaj treats Japanese candlesticks as contextual confirmation, not as a standalone promise of direction. Pattern definitions are converted into numerical OHLC rules and evaluated only on completed candles. Trend, volume, liquidity, volatility, spread, momentum and higher-timeframe alignment remain the primary controls.

## Sources and evidence

- Wiley legal sample chapter, *Candlestick Basics and Testing Requirements*: https://catalogimages.wiley.com/images/db/pdf/9781118545218.excerpt.pdf
- Caginalp and Laurent, *The Predictive Power of Price Patterns*: https://papers.ssrn.com/sol3/Delivery.cfm/SSRN_ID932984_code328612.pdf?abstractid=932984
- Marshall, Young and Rose, *Candlestick technical trading strategies: Can they create value for investors?*: https://doi.org/10.1016/j.jbankfin.2005.10.001
- Ho, Chan, Pan and Li, *Do candlestick patterns work in cryptocurrency trading?*: https://doi.org/10.1109/BigData52589.2021.9671826
- Moser and Brauneis, *Intraday price forecasts using candlestick patterns in cryptocurrency markets*: https://ideas.repec.org/a/eee/reveco/v108y2026ics1059056026002716.html
- Official Bitget candle-data specification: https://www.bitget.com/api-doc/contract/market/Get-Candle-Data

The literature is mixed. That is why JamdDmaj does not open a trade solely because it sees a named candle pattern and does not assume that evidence from one market transfers unchanged to another.

## Implemented patterns

- Bullish and bearish engulfing
- Hammer and hanging man
- Inverted hammer and shooting star
- Morning star and evening star
- Doji as neutral indecision, never as a directional entry by itself

## Safety rules

1. Use only completed candles so an unfinished bar cannot change the pattern after a decision.
2. Require prior-trend context for reversal patterns.
3. Keep a pattern neutral when the OHLC shape is malformed or history is insufficient.
4. Reject a Bitget-ready candidate only when a strong candle pattern directly opposes its direction.
5. Allow aligned and neutral patterns to pass through the existing trend, volume, liquidity and risk gates.
6. Apply the same OHLC engine to large cryptocurrencies and stock analysis, but evaluate results separately by market and timeframe.

## Initial walk-forward result

On 1,000 recent hourly candles for each of 12 liquid Bitget futures markets, the existing strategy produced 49 decided outcomes with a 48.98% TP1 hit rate and -0.71% estimated ROE expectancy. Rejecting only seven setups with strong opposing candlestick patterns left 42 decided outcomes, raised the TP1 hit rate to 52.38%, and raised estimated expectancy to +1.15% ROE. This is promising but still a limited sample, so the result must continue to be monitored and must not be interpreted as guaranteed performance.
