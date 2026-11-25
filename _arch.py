import sqlite3,json
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
for wid in ['9627ca37af11c86ee971df7372f8a68913fe83f56f53234da06f0bc22d8df34e','68f9c3833e0dc92d521cfe03cc482edf68cf0fc60bf8acbbfb37b0bfcd9a5e03','b4e83f5df780ec6d96ef2fa508dc03e6dad33405db84a732f749177601810f3c']:
 print('FLOW',wid[:8])
 for r in c.execute('select kind,state,archive from phoenix_order_attempts where workflow=? order by sequence',(wid,)):
  a=json.loads(r['archive']) if r['archive'] else {}
  plan=a.get('plan') or a.get('review',{}).get('plan') or {}
  print(r['kind'],r['state'],plan.get('symbol'),plan.get('isolatedSubaccountIndex'),plan.get('market',{}).get('assetId'))
