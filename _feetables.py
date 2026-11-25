import sqlite3, os, json
for p in ['/var/lib/jamddmaj-perps-runtime/journal.sqlite','/var/lib/jamddmaj-perps-runtime/fees.sqlite','/var/lib/private/jamddmaj-perps-runtime/fees.sqlite']:
 if not os.path.exists(p): continue
 c=sqlite3.connect(p); c.row_factory=sqlite3.Row
 print('DB',p)
 tabs=[r[0] for r in c.execute("select name from sqlite_master where type='table'")]
 print(tabs)
 for t in tabs:
  if 'fee' in t or 'fee' in t:
   try:
    rows=c.execute(f'select * from {t} order by rowid desc limit 5').fetchall()
    print(t, [dict(r) for r in rows])
   except Exception as e: print(t,e)
