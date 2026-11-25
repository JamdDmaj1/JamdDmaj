import sqlite3,json,time
p='/var/lib/jamddmaj-perps-runtime/phoenix-auto.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
print('auto states', [dict(r) for r in c.execute('select state,count(*) n from phoenix_auto_signals group by state')])
print('open rows', [dict(r) for r in c.execute("select signal,symbol,state from phoenix_auto_signals where state not in ('CLOSED','FAILED','ABORTED')")])
p2='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite';j=sqlite3.connect(p2);j.row_factory=sqlite3.Row
print('held', [dict(r) for r in j.execute("select id,symbol,state from phoenix_workflows where state not in ('COMPLETE','ABORTED')")])
print('pending_att', [dict(r) for r in j.execute("select id,kind,state,workflow from phoenix_order_attempts where state in ('PREPARED','SIGNED','UNKNOWN')")])
s=json.load(open('/var/lib/private/jamddmaj-perps-runtime/worker-status.json'));print('status_age_s', round(time.time()-s['observedAt']/1000,1), s['results'])
PY
