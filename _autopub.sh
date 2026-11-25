#!/bin/bash
set -a
. /etc/jamddmaj-perps/reconcile.env
set +a
curl -sS -m 10 -o /tmp/autopub.json -w 'code=%{http_code}\\n' https://157.230.54.133/v1/automation -H "Authorization: Bearer $JAMDDMAJ_SERVICE_TOKEN" -H 'Origin: https://www.jamddmaj.com'
head -c 400 /tmp/autopub.json; echo
