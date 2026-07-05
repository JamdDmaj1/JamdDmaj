# JamdDmaj AI v1.36.5

## Executor live score control

- VPS live executor now lets .env control the executable score threshold.
- Remote market policy no longer asks for impossible 15/16 scores while the scanner scale is around 13.
- The executor no longer silently raises live execution to 15 when the VPS is configured lower.
- This keeps testing predictable: JAMDDMAJ_MIN_LIVE_SCORE and JAMDDMAJ_STRICT_REGIME_MIN_SCORE are the active live gates.

Recommended balanced live test:

`env
JAMDDMAJ_MIN_LIVE_SCORE=10
JAMDDMAJ_STRICT_REGIME_MIN_SCORE=11
`

