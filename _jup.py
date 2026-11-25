import sqlite3, json, sys
p='/var/lib/jamddmaj-perps-runtime/journal.sqlite'
c=sqlite3.connect(p); c.row_factory=sqlite3.Row
print([r[0] for r in c.execute("select name from sqlite_master where type='table'")])
for t in [r[0] for r in c.execute("select name from sqlite_master where type='table'")]:
 print(t,[d[1] for d in c.execute("pragma table_info("+t+")")])
 try:
  for row in c.execute("select * from "+t+" order by rowid desc limit 8"):
   d=dict(row)
   for k,v in d.items():
    if isinstance(v,str) and len(v)>100:d[k]=v[:100]+'...'
   print('ROW',t,json.dumps(d,default=str))
 except Exception as e: print('ERR',e)
