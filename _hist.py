import sqlite3
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite'
c=sqlite3.connect(p);c.row_factory=sqlite3.Row
rows=c.execute("select id,symbol,state,margin,created,updated from phoenix_workflows where state='COMPLETE' order by created desc").fetchall()
print('complete',len(rows))
for r in rows:print(dict(r))
PY
