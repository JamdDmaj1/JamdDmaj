import sqlite3, shutil
p='/var/lib/private/jamddmaj-perps-runtime/phoenix.sqlite'
shutil.copy2(p,p+'.bak-ghosts-20261124')
c=sqlite3.connect(p);c.row_factory=sqlite3.Row
rows=c.execute("select id,symbol,child,state from phoenix_workflows where state not in ('COMPLETE','ABORTED')").fetchall()
print([dict(r) for r in rows])
delete=[r['id'] for r in rows]
for wid in delete:
 c.execute('delete from phoenix_close_consents where workflow=?',(wid,))
 c.execute('delete from phoenix_fee_consents where workflow=?',(wid,))
 c.execute('delete from phoenix_order_attempts where workflow=?',(wid,))
 c.execute('delete from phoenix_workflows where id=?',(wid,))
c.commit();print('deleted',len(delete))
PY
