import sqlite3
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
wid='9627ca37af11c86ee971df7372f8a68913fe83f56f53234da06f0bc22d8df34e'
for r in c.execute('select id,kind,state,signature from phoenix_order_attempts where workflow=? order by sequence',(wid,)):print(dict(r))
print('consent attempts')
for r in c.execute('select attempt,workflow from phoenix_close_consents where workflow=?',(wid,)):print(dict(r))
