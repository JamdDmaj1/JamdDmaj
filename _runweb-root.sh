#!/bin/bash
set -a
. /etc/jamddmaj-perps/helius-read-rpc.env
set +a
mkdir -p /run/jamddmaj-perps-web
chown jamddmaj-perps-controls:jamddmaj-perps-controls /run/jamddmaj-perps-web
chmod 700 /run/jamddmaj-perps-web
runuser -u jamddmaj-perps-controls -- env JAMDDMAJ_PERPS_RPC_URL="" JAMDDMAJ_PERPS_RUNTIME_DIRECTORY=/var/lib/private/jamddmaj-perps-runtime JAMDDMAJ_PERPS_CONTROLS_DIRECTORY=/var/lib/private/jamddmaj-perps-controls RUNTIME_DIRECTORY=/run/jamddmaj-perps-web JAMDDMAJ_PERPS_WEB_EXECUTION_APPROVED=true JAMDDMAJ_PERPS_TRUST_LOOPBACK_PROXY=true timeout 15 node /tmp/perps-web-debug.mjs
