#!/bin/sh
set -eu
backup=/opt/jamddmaj-perps/backups/manual-futures-20261101
candidate=/opt/jamddmaj-perps/checks/bot-manual-worker-candidate-20261101.mjs
target=/opt/jamddmaj-perps/worker/perps-server-worker.mjs
flag=/etc/systemd/system/jamddmaj-perps-worker.service.d/70-bot-manual.conf
test ! -e "$backup"
test ! -e "$flag"
test -f "$candidate"
node --check "$candidate"
node /opt/jamddmaj-perps/checks/bot-manual-readiness-20261101.mjs
mkdir -m 700 "$backup"
cp -p "$target" "$backup/worker.mjs"
cp -a /etc/systemd/system/jamddmaj-perps-worker.service.d "$backup/service.d"
rollback() {
 cp -p "$backup/worker.mjs" "$target"
 if test -f "$flag"; then rm -- "$flag"; fi
 systemctl daemon-reload
 systemctl start jamddmaj-perps-worker jamddmaj-perps-web jamddmaj-perps-https
}
trap 'rollback' EXIT
trap 'exit 1' HUP INT TERM
systemctl stop jamddmaj-perps-worker jamddmaj-perps-web
if ! node /opt/jamddmaj-perps/checks/bot-manual-readiness-20261101.mjs; then rollback; exit 1; fi
mkdir -m 700 "$backup/runtime" "$backup/controls"
cp -p /var/lib/private/jamddmaj-perps-runtime/*.sqlite* "$backup/runtime/"
cp -p /var/lib/private/jamddmaj-perps-controls/*.sqlite* "$backup/controls/"
install -m 644 "$candidate" "$target"
printf '%s\n' '[Service]' 'ExecStart=' 'ExecStart=/usr/bin/node /opt/jamddmaj-perps/worker/perps-server-worker.mjs --controls --custody-setup --bot-swaps --platform-fees --bot-manual' > "$flag"
systemctl daemon-reload
if ! systemctl start jamddmaj-perps-worker jamddmaj-perps-web jamddmaj-perps-https; then rollback; exit 1; fi
if ! curl --retry 5 --retry-connrefused --retry-delay 1 --fail --silent http://127.0.0.1:8788/health; then rollback; exit 1; fi
systemctl is-active jamddmaj-perps-worker jamddmaj-perps-web jamddmaj-perps-https
node /opt/jamddmaj-perps/checks/bot-manual-readiness-20261101.mjs
sha256sum "$target"
trap - EXIT HUP INT TERM
