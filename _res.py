import sqlite3
p='/var/lib/jamddmaj-perps-runtime/journal.sqlite'
c=sqlite3.connect(p);c.row_factory=sqlite3.Row
cols=[r[1] for r in c.execute('pragma table_info(perps_reservations)')]
print('columns',cols)
rows=c.execute("select * from perps_reservations order by created desc limit 5").fetchall()
for r in rows:print(dict(r))
