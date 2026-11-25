import sqlite3, sys, json
p=sys.argv[1]
c=sqlite3.connect(p)
c.row_factory=sqlite3.Row
print("COLUMNS", [r[1] for r in c.execute("PRAGMA table_info(phoenix_workflows)")])
for r in c.execute("select * from phoenix_workflows where state!='COMPLETE' order by updated desc limit 30"):
    d=dict(r)
    keep={k:d.get(k) for k in ['id','wallet','child','symbol','state','margin','created','updated'] if k in d}
    print(json.dumps(keep))
