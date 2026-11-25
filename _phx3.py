import sqlite3, sys, json
p=sys.argv[1]
c=sqlite3.connect(p); c.row_factory=sqlite3.Row
print("WALLETS")
for r in c.execute("select wallet,count(*) n from phoenix_workflows group by wallet order by n desc limit 20"):
    print(r['wallet'], r['n'])
print("PENDING")
for r in c.execute("select wallet,state,count(*) n,sum(cast(margin as integer)) total from phoenix_workflows where state!='COMPLETE' group by wallet,state"):
    print(dict(r))
