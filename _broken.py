import sqlite3
p='/var/lib/private/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
for r in c.execute("select f.id,f.symbol,f.state,count(a.id) n from phoenix_workflows f left join phoenix_order_attempts a on a.workflow=f.id group by f.id having n=0"):print(dict(r))
print('test attempts')
for r in c.execute("select id,kind,state,signature from phoenix_order_attempts where workflow='de2462882e3585bb2dc49d1c85963d72856715de4e2e52aabcb9da18c1e15150'"):print(dict(r))
PY
