import sqlite3,json
p='_phx-orig.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
# successful unwrap receipt sample
r=c.execute("select receipt,archive from phoenix_order_attempts where kind='UNWRAP' and state='FINALIZED' limit 1").fetchone()
print('SAMPLE_RECEIPT',r['receipt'][:1200] if r else None)
print('SAMPLE_ARCHIVE',r['archive'][:800] if r else None)
wid='9627ca37af11c86ee971df7372f8a68913fe83f56f53234da06f0bc22d8df34e'
for a in c.execute("select id,kind,state,signature,archive from phoenix_order_attempts where workflow=? order by sequence",(wid,)):
 print('SOL_ATT',a['kind'],a['state'],a['id'],a['signature'],(a['archive'] or '')[:400])
