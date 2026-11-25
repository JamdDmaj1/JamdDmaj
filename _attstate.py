import sqlite3
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
w='36bd40199f55447d0e9837475515f93a1f4cd22c5d644dc39ca447633ba46c12'
print(c.execute("select state,count(*) from phoenix_order_attempts where workflow=? group by state",(w,)).fetchall())
for r in c.execute("select id,kind,state,created from phoenix_order_attempts where workflow=? order by sequence desc limit 5",(w,)):print(dict(r))
print('pending',c.execute("select count(*) from phoenix_order_attempts where workflow=? and state in('PREPARED','SIGNED','UNKNOWN')",(w,)).fetchone())
PY
