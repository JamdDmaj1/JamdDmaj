#!/bin/sh
set -eu
umask 077
target=/opt/jamddmaj-perps/worker/perps-server-worker.mjs
candidate=/opt/jamddmaj-perps/checks/manual-13820-worker-d6ac9de.mjs
web_target=/opt/jamddmaj-perps/web/perps-web-service.mjs
web_candidate=/opt/jamddmaj-perps/checks/manual-13820-web-service-d6ac9de.mjs
operator=/opt/jamddmaj-perps/checks/manual-13820-apply-r2.mjs
admission=/opt/jamddmaj-perps/checks/manual-13820-admission-r2.mjs
backup=/opt/jamddmaj-perps/backups/manual-13820-6f4d037-r2
stopped=0
finished=0
schema_hash() {
 /usr/bin/node -e 'const {DatabaseSync}=require("node:sqlite");const {createHash}=require("node:crypto");const d=new DatabaseSync("/var/lib/private/jamddmaj-perps-runtime/journal.sqlite",{readOnly:true});try{const rows=d.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all().filter(r=>!r.name.startsWith("sqlite_")).map(r=>({...r,sql:r.sql?.replace(/\s+/g," ").trim()}));console.log(createHash("sha256").update(JSON.stringify(rows)).digest("hex"));}finally{d.close();}'
}
on_exit() {
 code=$?
 if [ "$finished" = 0 ] && [ "$stopped" = 1 ]; then
  # A committed/unknown migration must never restore a stale financial DB.
  current=$(schema_hash) || current=unknown
  if [ "$current" = 505c96362bd65d613ca90ddd17f846c3bfca04d5f0ee69c732b9f3ebf05d91b9 ]; then
   systemctl start jamddmaj-perps-worker jamddmaj-perps-web jamddmaj-perps-https || true
  else
   systemctl stop jamddmaj-perps-https jamddmaj-perps-web jamddmaj-perps-worker || true
   echo 'UPGRADE_REQUIRES_OPERATOR_REVIEW; stores preserved; services stopped' >&2
  fi
 fi
 exit "$code"
}
trap on_exit EXIT
trap 'exit 1' HUP INT TERM
test ! -e "$backup"
test -f "$candidate"
test -f "$web_candidate"
test -f "$operator"
test -f "$admission"
test ! -e /opt/jamddmaj-perps/checks/manual-13820-stopped-r2.json
test "$(sha256sum "$target" | cut -d ' ' -f 1)" = 17ab1fd592dadd7bc5ca7110da644dbbea3b31f9ed1ecc4226c2cc497258bda5
test "$(sha256sum "$candidate" | cut -d ' ' -f 1)" = d5e4825e56bc8623f3fca65c9510e06d988f07d9281d3d8f7ead5e3e1c3ec469
test "$(sha256sum "$web_candidate" | cut -d ' ' -f 1)" = e1421ef4b6215cfcdfb57110a68968744d6d55a47d38b1f65d7dd7609e646bb6
test "$(sha256sum "$operator" | cut -d ' ' -f 1)" = b460f77be91cd8dc7fe0e0a1a1c240487eb8fdd62380f865b1ff9a9e96b40857
test "$(sha256sum "$admission" | cut -d ' ' -f 1)" = c463cba70fac351e555bf56e68e394c7bc0e78f6b12cbbb0aa9051984c05b8f1
/usr/bin/node --check "$candidate"
/usr/bin/node --check "$web_candidate"
/usr/bin/node --check "$operator"
/usr/bin/node --check "$admission"
/usr/bin/node /opt/jamddmaj-perps/checks/bot-manual-readiness-20261101.mjs
test "$(schema_hash)" = 505c96362bd65d613ca90ddd17f846c3bfca04d5f0ee69c732b9f3ebf05d91b9
mkdir -m 700 "$backup" "$backup/runtime" "$backup/controls"
cp --preserve=mode,timestamps "$target" "$backup/worker.mjs"
cp --preserve=mode,timestamps "$web_target" "$backup/web-service.mjs"
cp -a /etc/systemd/system/jamddmaj-perps-worker.service.d "$backup/service.d"
stopped=1
systemctl stop jamddmaj-perps-https jamddmaj-perps-web jamddmaj-perps-worker
/usr/bin/node /opt/jamddmaj-perps/checks/bot-manual-readiness-20261101.mjs
cp --preserve=mode,timestamps /var/lib/private/jamddmaj-perps-runtime/*.sqlite* "$backup/runtime/"
cp --preserve=mode,timestamps /var/lib/private/jamddmaj-perps-controls/*.sqlite* "$backup/controls/"
/usr/bin/node "$admission" --after-stopping-services
systemd-run --unit=jamddmaj-perps-upgrade-13820-r2 --wait --pipe --collect \
 --property=User=jamddmaj-perps-controls --property=DynamicUser=yes \
 --property="StateDirectory=jamddmaj-perps-controls jamddmaj-perps-runtime" --property=StateDirectoryMode=0700 \
 --property=RuntimeDirectory=jamddmaj-perps-runtime --property=RuntimeDirectoryMode=0700 --property=RuntimeDirectoryPreserve=no \
 --property=NoNewPrivileges=yes --property=PrivateTmp=yes \
 /usr/bin/node "$operator" --apply-reviewed-empty-upgrade
test "$(schema_hash)" = f098dd3ae6e6568cc004ac775a7a14f0cef56277f3a0ff3107e4c53868e42c16
install -m 644 "$candidate" "$target"
install -m 644 "$web_candidate" "$web_target"
systemctl start jamddmaj-perps-worker
systemctl start jamddmaj-perps-web jamddmaj-perps-https
curl --retry 5 --retry-connrefused --retry-delay 1 --fail --silent --max-time 10 http://127.0.0.1:8788/health
curl --retry 5 --retry-connrefused --retry-delay 1 --fail --silent --max-time 10 http://127.0.0.1:8789/health
for unit in jamddmaj-perps-worker jamddmaj-perps-web jamddmaj-perps-https; do
 test "$(systemctl is-active "$unit")" = active
done
/usr/bin/node /opt/jamddmaj-perps/checks/bot-manual-readiness-20261101.mjs
sha256sum "$target"
finished=1
echo 'MANUAL_13820_SERVER_INSTALLED; automation remains paused'
