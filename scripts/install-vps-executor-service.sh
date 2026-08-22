#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${JAMDDMAJ_EXECUTOR_DIR:-/opt/jamddmaj-scanner}"
ENV_FILE="${JAMDDMAJ_EXECUTOR_ENV:-$APP_DIR/.env}"
EXECUTOR_FILE="$APP_DIR/bitget-executor.mjs"
LOOP_FILE="$APP_DIR/executor-loop.sh"
LOG_FILE="$APP_DIR/scanner.log"
SERVICE_FILE="/etc/systemd/system/jamddmaj-bitget-executor.service"
INTERVAL_SECONDS="${JAMDDMAJ_EXECUTOR_INTERVAL_SECONDS:-30}"
RAW_EXECUTOR_URL="${JAMDDMAJ_EXECUTOR_URL:-https://raw.githubusercontent.com/JamdDmaj1/JamdDmaj/main/scripts/bitget-executor.mjs}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root on the VPS."
  exit 1
fi

mkdir -p "$APP_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 20+ first, then rerun this installer."
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<'ENV'
JAMDDMAJ_URL=https://www.jamddmaj.com
JAMDDMAJ_BITGET_MODE=dry-run
JAMDDMAJ_LIVE_ENTRY_ONLY=true
JAMDDMAJ_LIVE_CONFIRM=

BITGET_API_KEY=
BITGET_API_SECRET=
BITGET_PASSPHRASE=
BITGET_PRODUCT_TYPE=USDT-FUTURES
BITGET_MARGIN_COIN=USDT
BITGET_MARGIN_MODE=isolated

JAMDDMAJ_MAX_LIVE_OPEN=1
JAMDDMAJ_MAX_NEW_ORDERS_PER_RUN=1
JAMDDMAJ_MAX_LIVE_MARGIN_USD=5
JAMDDMAJ_FIXED_MARGIN_USD=0
JAMDDMAJ_AUTO_RISK=true
JAMDDMAJ_AUTO_RISK_PER_TRADE_PERCENT=3
JAMDDMAJ_AUTO_RISK_MIN_MARGIN_USD=5
JAMDDMAJ_AUTO_RISK_RESERVE_PERCENT=20
JAMDDMAJ_MIN_LIVE_SCORE=14
JAMDDMAJ_STRICT_REGIME_MIN_SCORE=16
JAMDDMAJ_MIN_LIVE_LIQUIDITY_USD=3000000
JAMDDMAJ_ALLOW_MEME_LIVE=false
JAMDDMAJ_EXIT_MANAGER=true
JAMDDMAJ_EXIT_PROTECTION_TRIGGER_ROE=10
JAMDDMAJ_EXIT_PROTECTION_LOCK_ROE=2
JAMDDMAJ_EXIT_CLOSE_ON_REVERSAL=true
JAMDDMAJ_MAX_DAILY_LOSS_USD=25
JAMDDMAJ_MAX_DAILY_LOSS_PERCENT=3
JAMDDMAJ_MAX_CONSECUTIVE_LOSSES=2
JAMDDMAJ_MAX_TRADES_PER_DAY=3
JAMDDMAJ_HARD_MAX_LIVE_TRADES_PER_DAY=3
JAMDDMAJ_LIVE_RISK_BALANCE_USD=1000
JAMDDMAJ_RECENT_OPEN_MINUTES=20
JAMDDMAJ_MAX_EXECUTION_SIGNAL_AGE_MINUTES=5
ENV
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE. Add your secrets before switching live mode on."
fi

curl -fsSL "$RAW_EXECUTOR_URL" -o "$EXECUTOR_FILE"
chmod +x "$EXECUTOR_FILE"

cat > "$LOOP_FILE" <<EOF
#!/usr/bin/env bash
set -u
cd "$APP_DIR"
while true; do
  /usr/bin/env node "$EXECUTOR_FILE" >> "$LOG_FILE" 2>&1
  sleep "$INTERVAL_SECONDS"
done
EOF
chmod +x "$LOOP_FILE"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=JamdDmaj Bitget executor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$LOOP_FILE
Restart=always
RestartSec=5
Environment=JAMDDMAJ_EXECUTOR_ENV=$ENV_FILE
Environment=JAMDDMAJ_EXECUTOR_STATE=$APP_DIR/executor-state.json

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable jamddmaj-bitget-executor.service
systemctl restart jamddmaj-bitget-executor.service

echo "JamdDmaj Bitget executor service installed."
echo "Status: systemctl status jamddmaj-bitget-executor --no-pager"
echo "Logs:   tail -n 60 $LOG_FILE"
