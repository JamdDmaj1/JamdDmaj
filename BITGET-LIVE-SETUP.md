# Bitget live executor, safe mode first

This is the VPS-side runner for JamdDmaj Pro Signals. It keeps Bitget secrets out of the app, out of Vercel, and out of GitHub.

Default mode is `off`. Real market entries are blocked unless you explicitly set all three:

- `JAMDDMAJ_BITGET_MODE=live`
- `JAMDDMAJ_LIVE_CONFIRM=I_ACCEPT_REAL_RISK`
- `JAMDDMAJ_LIVE_ENTRY_ONLY=true`

Keep `JAMDDMAJ_LIVE_ENTRY_ONLY=false` until the exit manager is tested. The safe first step is `dry-run`.

## 1. Copy the executor to the VPS

From the project after uploading the new version, copy this file to the droplet:

```bash
mkdir -p /opt/jamddmaj-scanner
nano /opt/jamddmaj-scanner/bitget-executor.mjs
chmod +x /opt/jamddmaj-scanner/bitget-executor.mjs
```

Paste the contents of `scripts/bitget-executor.mjs`.

## 2. Add VPS-only variables

Edit the VPS file:

```bash
nano /opt/jamddmaj-scanner/.env
```

Keep your existing `JAMDDMAJ_URL` and `JAMDDMAJ_CRON_SECRET`, then add:

```bash
JAMDDMAJ_BITGET_MODE=dry-run
JAMDDMAJ_LIVE_ENTRY_ONLY=false
BITGET_API_KEY=your_bitget_api_key
BITGET_API_SECRET=your_bitget_secret_key
BITGET_PASSPHRASE=your_bitget_passphrase
BITGET_PRODUCT_TYPE=USDT-FUTURES
BITGET_MARGIN_COIN=USDT
BITGET_MARGIN_MODE=isolated
JAMDDMAJ_MAX_LIVE_OPEN=1
JAMDDMAJ_MAX_LIVE_MARGIN_USD=5
JAMDDMAJ_MAX_NEW_ORDERS_PER_RUN=1
JAMDDMAJ_MIN_LIVE_SCORE=10
JAMDDMAJ_MIN_LIVE_LIQUIDITY_USD=3000000
JAMDDMAJ_ALLOW_MEME_LIVE=false
JAMDDMAJ_MAX_DAILY_LOSS_USD=25
JAMDDMAJ_MAX_DAILY_LOSS_PERCENT=3
JAMDDMAJ_MAX_CONSECUTIVE_LOSSES=2
JAMDDMAJ_MAX_TRADES_PER_DAY=3
JAMDDMAJ_LIVE_RISK_BALANCE_USD=1000
```

Do not paste these values into Vercel, GitHub, screenshots, chat, or the app.

## 3. Test without real orders

Run:

```bash
node /opt/jamddmaj-scanner/bitget-executor.mjs
cat /opt/jamddmaj-scanner/executor-state.json
```

In `dry-run`, it will scan and log order candidates, but it will not send any Bitget order.
It also reports a heartbeat to `/api/pro-executor` so the owner panel can show the VPS mode and last run.
The heartbeat includes rejection reasons, recent dry-run orders, Bitget sync status, and exit-plan readiness. Vercel may send throttled Telegram summaries for useful dry-run cycles.

## 4. Replace the cron command

When dry-run looks correct:

```bash
crontab -e
```

Use:

```bash
*/2 * * * * node /opt/jamddmaj-scanner/bitget-executor.mjs >> /opt/jamddmaj-scanner/scanner.log 2>&1
```

## 5. Live mode, only after testing

To allow real market entries after testing, edit `/opt/jamddmaj-scanner/.env`:

```bash
JAMDDMAJ_BITGET_MODE=live
JAMDDMAJ_LIVE_CONFIRM=I_ACCEPT_REAL_RISK
JAMDDMAJ_LIVE_ENTRY_ONLY=true
```

Keep these safeguards first:

- `JAMDDMAJ_MAX_LIVE_OPEN=1`
- `JAMDDMAJ_MAX_LIVE_MARGIN_USD=5`
- `JAMDDMAJ_MAX_NEW_ORDERS_PER_RUN=1`
- `JAMDDMAJ_ALLOW_MEME_LIVE=false`

Watch the first order from Bitget manually. Do not raise size until dry-run and paper results are consistent.

The owner panel can pause new live entries remotely. This does not close existing Bitget positions; it stops the VPS from opening new entries on future cycles.
Before live, confirm the owner panel shows `Executor: DRY-RUN`, no recent executor errors, and rejection reasons that make sense for the current market.

## Emergency stop

Set:

```bash
JAMDDMAJ_BITGET_MODE=off
```

or disable cron with:

```bash
crontab -e
```

Then remove or comment the JamdDmaj line.
