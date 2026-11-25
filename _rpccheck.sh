#!/bin/bash
set -a
. /etc/jamddmaj-perps/helius-read-rpc.env
set +a
echo len=${#JAMDDMAJ_PERPS_RPC_URL}
case "$JAMDDMAJ_PERPS_RPC_URL" in https://*) echo protocol=ok;; *) echo protocol=bad;; esac
