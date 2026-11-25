import sqlite3
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
w='36bd40199f55447d0e9837475515f93a1f4cd22c5d644dc39ca447633ba46c12'
print('flow',dict(c.execute('select id,state,revision from phoenix_workflows where id=?',(w,)).fetchone()))
print('consent',dict(c.execute('select * from phoenix_close_consents where workflow=?',(w,)).fetchone()))
for r in c.execute("select id,kind,state,revision,created,expires from phoenix_order_attempts where workflow=? order by sequence",(w,)):print('att',dict(r))
PY
