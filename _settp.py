import sqlite3
p='/var/lib/private/jamddmaj-perps-runtime/phoenix-auto.sqlite'
c=sqlite3.connect(p);c.execute("update phoenix_auto_signals set tp1='70620000' where signal='test-auto-SOL-6'");c.commit();print('tp updated')
PY
