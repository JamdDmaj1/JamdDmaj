import sqlite3,json
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
wid='9627ca37af11c86ee971df7372f8a68913fe83f56f53234da06f0bc22d8df34e'
for r in c.execute("select kind,state,archive from phoenix_order_attempts where workflow=? and kind='CLOSE'",(wid,)):
 a=json.loads(r['archive']);print(a.keys());print(json.dumps(a,default=str)[:1000])
