#!/bin/sh
PID=$(systemctl show -p MainPID --value jamddmaj-perps-worker)
echo "PID=$PID"
exec timeout 40 nsenter -t "$PID" -m -- setpriv --reuid=64438 --regid=64438 --clear-groups env JAMDDMAJ_PERPS_RPC_URL='https://mainnet.helius-rpc.com/?api-key=33ccacc0-79e9-485f-941d-d13449865618' node /opt/jamddmaj-perps/checks/phoenix-activation-20261108/perps-health.mjs /var/lib/jamddmaj-perps-runtime /var/lib/jamddmaj-perps-controls '' 0d2f7571988ff6c71beeedc9ed2210f9a403e5433105f5f162cbb17b86a68810 3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T DOGE
