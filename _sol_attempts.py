import sqlite3,json
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
wid='9627ca37af11c86ee971df7372f8a68913fe83f56f53234da06f0bc22d8df34e'
for a in c.execute("select id,kind,state,signature,receipt,archive from phoenix_order_attempts where workflow=? order by sequence",(wid,)):
 print(a['kind'],a['state'],a['id'],a['signature'])
 print('  arch', (a['archive'] or '')[:300])
 print('  rec', (a['receipt'] or '')[:300])
