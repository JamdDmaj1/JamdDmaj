import sqlite3,json
p='_phx-orig.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
for wid in ['64b521e1','711d1c7e']:
 row=c.execute("select id,symbol,state,child from phoenix_workflows where id like ?",(wid+'%',)).fetchone()
 print('FLOW',dict(row) if row else None)
 if not row: continue
 for a in c.execute('select kind,state,signature,receipt,archive from phoenix_order_attempts where workflow=? order by sequence',(row['id'],)):
  print(a['kind'],a['state'],a['signature'],'receipt', (a['receipt'] or '')[:180], 'archive', (a['archive'] or '')[:120])
