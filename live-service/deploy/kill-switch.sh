#!/bin/sh
# Emergency stop: keep the read-only API and position dashboard available, but
# stop the automatic execution engine. Run as root.
set -eu
ENV_FILE=/etc/jamddmaj-live/live.env
if [ ! -f "$ENV_FILE" ]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi
if grep -q '^JAMDDMAJ_LIVE_ENGINE_ENABLED=' "$ENV_FILE"; then
  sed -i 's/^JAMDDMAJ_LIVE_ENGINE_ENABLED=.*/JAMDDMAJ_LIVE_ENGINE_ENABLED=false/' "$ENV_FILE"
else
  echo 'JAMDDMAJ_LIVE_ENGINE_ENABLED=false' >> "$ENV_FILE"
fi
systemctl restart jamddmaj-live
sleep 2
systemctl is-active jamddmaj-live
echo "JamdDmaj Live engine disabled; read-only API remains online."
