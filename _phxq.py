import sqlite3,json
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
wid='9627ca37af11c86ee971df7372f8a68913fe83f56f53234da06f0bc22d8df34e'
print('flow')
for r in c.execute('select * from phoenix_workflows where id=?',(wid,)):print(dict(r))
print('attempts')
for r in c.execute('select kind,state,signature,receipt,archive from phoenix_order_attempts where workflow=? order by sequence',(wid,)):
 d=dict(r);d['receipt']=(d['receipt'] or '')[:300];d['archive']=(d['archive'] or '')[:200];print(d)
print('consents')
for r in c.execute('select * from phoenix_close_consents where workflow=?',(wid,)):print(dict(r))
