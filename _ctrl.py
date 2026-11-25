import sqlite3,glob
for p in glob.glob('/var/lib/jamddmaj-perps-controls/*.sqlite')+glob.glob('/var/lib/private/jamddmaj-perps-controls/*.sqlite'):
 print('db',p)
 try:
  c=sqlite3.connect(p)
  for r in c.execute('select wallet,revision,enabled,paused from perps_automation_controls'):print(r)
 except Exception as e:print(e)
PY
