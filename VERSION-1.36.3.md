# JamdDmaj AI 1.36.3

Recent-open executor update.

## What changed

- `/api/pro-cron` now returns open Pro calls to the VPS.
- The VPS executor can use recent open calls from the last 20 minutes, not only brand-new signals from the current cycle.
- Rejection reasons are printed directly in `scanner.log`.
- `JAMDDMAJ_RECENT_OPEN_MINUTES` controls the lookback window.

## VPS env

```env
JAMDDMAJ_RECENT_OPEN_MINUTES=20
```

For a one-time live test, lower filters only temporarily. Restore safer filters after confirming Bitget receives orders.
