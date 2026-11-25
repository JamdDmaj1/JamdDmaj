import sqlite3
p='/var/lib/private/jamddmaj-perps-runtime/phoenix-auto.sqlite';c=sqlite3.connect(p)
c.execute("update phoenix_auto_signals set state='CLOSED' where signal='test-auto-SOL-6'");c.commit();print('auto row closed')
PY
