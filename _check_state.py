import sqlite3
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
for r in c.execute("select symbol,state from phoenix_workflows where id=?",('9627ca37af11c86ee971df7372f8a68913fe83f56f53234da06f0bc22d8df34e',)):print(dict(r))
