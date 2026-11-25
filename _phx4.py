import sqlite3, sys, json
p=sys.argv[1]
c=sqlite3.connect(p); c.row_factory=sqlite3.Row
for f in c.execute("select * from phoenix_workflows where state in ('OPEN','SETTLING','RECOVERY_REQUIRED') order by updated"):
    print("FLOW",f['symbol'],f['state'],"child",f['child'],"margin",f['margin'],f['id'][:8])
    for a in c.execute("select kind,state,receipt,archive from phoenix_order_attempts where workflow=? order by sequence",(f['id'],)):
        r=None
        try: r=json.loads(a['receipt']) if a['receipt'] else None
        except: pass
        print("  ",a['kind'],a['state'], (r or {}).get('state') if r else '', (r or {}).get('error') if r else '')
