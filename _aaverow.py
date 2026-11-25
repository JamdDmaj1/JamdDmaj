import sqlite3
p='/var/lib/jamddmaj-perps-runtime/phoenix-auto.sqlite'
c=sqlite3.connect(p);c.row_factory=sqlite3.Row
for r in c.execute("select * from phoenix_auto_signals where symbol='AAVE'"):print(dict(r))
PY
