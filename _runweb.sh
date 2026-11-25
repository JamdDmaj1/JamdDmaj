#!/bin/sh
set -a
. /etc/jamddmaj-perps/helius-read-rpc.env
set +a
export JAMDDMAJ_PERPS_RUNTIME_DIRECTORY=/var/lib/private/jamddmaj-perps-runtime
export JAMDDMAJ_PERPS_CONTROLS_DIRECTORY=/var/lib/private/jamddmaj-perps-controls
export RUNTIME_DIRECTORY=/run/jamddmaj-perps-web
export JAMDDMAJ_PERPS_WEB_EXECUTION_APPROVED=true
export JAMDDMAJ_PERPS_TRUST_LOOPBACK_PROXY=true
cd /opt/jamddmaj-perps/web
timeout 15 node /tmp/perps-web-debug.mjs
