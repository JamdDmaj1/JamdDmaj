import sqlite3
p='/var/lib/private/jamddmaj-perps-runtime/phoenix-auto.sqlite'
c=sqlite3.connect(p);print(c.execute("select signal,state,tp1,sl from phoenix_auto_signals where signal='test-auto-SOL-6'").fetchall())
