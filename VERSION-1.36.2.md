# JamdDmaj AI 1.36.2

Fast TP monitor update.

## What changed

- Added `/api/pro-monitor`, a lightweight monitor for open Pro calls.
- Open calls are now checked with 1-minute candles plus live ticker price.
- Telegram TP/SL/protection updates can be triggered without running the full scanner.
- The heavy scanner can stay slower while the fast monitor runs from the VPS.

## VPS fast monitor

Keep the normal executor cron, then add a fast monitor loop or cron.

Simple 1-minute cron:

```bash
* * * * * SECRET=$(grep '^JAMDDMAJ_CRON_SECRET=' /opt/jamddmaj-scanner/.env | tail -n1 | cut -d= -f2-) && curl -sS -H "Authorization: Bearer $SECRET" https://jamd-dmaj.vercel.app/api/pro-monitor >> /opt/jamddmaj-scanner/monitor.log 2>&1
```

For 30-second checks, run the loop under systemd:

```bash
while true; do
  SECRET=$(grep '^JAMDDMAJ_CRON_SECRET=' /opt/jamddmaj-scanner/.env | tail -n1 | cut -d= -f2-)
  curl -sS -H "Authorization: Bearer $SECRET" https://jamd-dmaj.vercel.app/api/pro-monitor >> /opt/jamddmaj-scanner/monitor.log 2>&1
  sleep 30
done
```
