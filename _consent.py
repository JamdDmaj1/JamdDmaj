import sqlite3
p='/var/lib/private/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
for r in c.execute("select * from phoenix_close_consents where workflow='de2462882e3585bb2dc49d1c85963d72856715de4e2e52aabcb9da18c1e15150'"):print(dict(r))
PY
