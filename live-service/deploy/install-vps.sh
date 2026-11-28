#!/bin/sh
# Install the JamdDmaj Live service on a Debian/Ubuntu VPS.
# Run as root from a checkout. Secrets are read from the existing scanner env
# and are never echoed. The Caddy route is configured separately.
set -eu
ROOT=$(pwd)
if ! id jamddmaj-live >/dev/null 2>&1; then
  useradd --system --home /var/lib/jamddmaj-live --shell /usr/sbin/nologin jamddmaj-live
fi
install -d -o jamddmaj-live -g jamddmaj-live -m 700 /var/lib/jamddmaj-live
install -d -o root -g jamddmaj-live -m 750 /etc/jamddmaj-live
install -d -o jamddmaj-live -g jamddmaj-live -m 700 /opt/jamddmaj-live

if [ ! -s /etc/jamddmaj-live/master.key ]; then
  umask 077
  openssl rand -base64 32 > /etc/jamddmaj-live/master.key
fi
chown jamddmaj-live:jamddmaj-live /etc/jamddmaj-live/master.key
chmod 600 /etc/jamddmaj-live/master.key

install -m 644 "$ROOT/live-service/package.json" /opt/jamddmaj-live/package.json
rm -rf /opt/jamddmaj-live/src
cp -R "$ROOT/live-service/src" /opt/jamddmaj-live/src
cp "$ROOT/live-service/README.md" /opt/jamddmaj-live/README.md
chown -R jamddmaj-live:jamddmaj-live /opt/jamddmaj-live

if [ ! -s /etc/jamddmaj-live/live.env ]; then
  CRON_SECRET=$(grep '^JAMDDMAJ_CRON_SECRET=' /opt/jamddmaj-scanner/.env | cut -d= -f2-)
  {
    echo "PORT=8790"
    echo "JAMDDMAJ_LIVE_DATA_DIR=/var/lib/jamddmaj-live"
    echo "JAMDDMAJ_LIVE_MASTER_KEY_FILE=/etc/jamddmaj-live/master.key"
    echo "JAMDDMAJ_LIVE_ALLOWED_ORIGINS=https://www.jamddmaj.com,https://jamddmaj.com,https://localhost,capacitor://localhost"
    echo "JAMDDMAJ_LIVE_IDENTITY_URL=https://www.jamddmaj.com/api/perps-identity"
    echo "JAMDDMAJ_LIVE_SIGNAL_URL=https://www.jamddmaj.com/api/pro-cron"
    echo "JAMDDMAJ_CRON_SECRET=$CRON_SECRET"
    echo "JAMDDMAJ_LIVE_ENGINE_ENABLED=false"
    echo "JAMDDMAJ_LIVE_BETA=true"
    echo "JAMDDMAJ_LIVE_PUBLIC_URL=https://www.jamddmaj.com"
  } > /etc/jamddmaj-live/live.env
  chown root:jamddmaj-live /etc/jamddmaj-live/live.env
  chmod 640 /etc/jamddmaj-live/live.env
fi

cd /opt/jamddmaj-live
npm install --omit=dev --no-audit --no-fund

install -m 644 "$ROOT/live-service/deploy/jamddmaj-live.service" /etc/systemd/system/jamddmaj-live.service
systemctl daemon-reload
systemctl enable jamddmaj-live
systemctl restart jamddmaj-live
sleep 2
systemctl is-active jamddmaj-live
curl -fsS --max-time 5 http://127.0.0.1:8790/live/health
