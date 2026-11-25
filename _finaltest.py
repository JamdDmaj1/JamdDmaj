import sqlite3
p='/var/lib/private/jamddmaj-perps-runtime/phoenix-auto.sqlite';c=sqlite3.connect(p);print('auto',c.execute("select signal,state,workflow from phoenix_auto_signals where signal='test-auto-SOL-6'").fetchall())
p2='/var/lib/private/jamddmaj-perps-runtime/phoenix.sqlite';d=sqlite3.connect(p2);print('workflow',d.execute("select id,state from phoenix_workflows where id='de2462882e3585bb2dc49d1c85963d72856715de4e2e52aabcb9da18c1e15150'").fetchall())
PY
