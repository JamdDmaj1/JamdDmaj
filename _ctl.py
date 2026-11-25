import sqlite3, sys, json
p='/var/lib/jamddmaj-perps-controls/controls.sqlite'
c=sqlite3.connect(p); c.row_factory=sqlite3.Row
print("TABLES")
for r in c.execute("select name from sqlite_master where type='table'"):
 print(r[0])
for t in [r[0] for r in c.execute("select name from sqlite_master where type='table'")]:
 print("COL",t,[d[1] for d in c.execute("pragma table_info("+t+")")])
 try:
  for row in c.execute("select * from "+t+" limit 5"):
   d=dict(row)
   for k,v in d.items():
    if isinstance(v,str) and len(v)>120: d[k]=v[:120]+'...'
   print("ROW",t,json.dumps(d,default=str))
 except Exception as e: print("ERR",t,e)
