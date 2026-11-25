import sqlite3,time,json,shutil
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite'
shutil.copy2(p,p+'.bak-sol7-20261123')
wid='9627ca37af11c86ee971df7372f8a68913fe83f56f53234da06f0bc22d8df34e'
aid='ee5ab1cea34e1002ad23514583f94e5f5f53b864b603f10b11af050e1e14ad71'
now=int(time.time()*1000)
c=sqlite3.connect(p);c.row_factory=sqlite3.Row
a=c.execute('select signature,created from phoenix_order_attempts where id=?',(aid,)).fetchone()
assert a, 'attempt missing'
receipt=json.dumps({'stage':'PHOENIX_FINALIZED_ORDER','signature':a['signature'],'state':'POSITION_CLOSED','slot':472779641,'networkFeeLamports':'5600','platformFeeDueUnits':'0','walletCredited':False,'mayRetry':False})
c.execute("update phoenix_order_attempts set state='FINALIZED',receipt=?,updated=? where id=?",(receipt,now,aid))
c.execute("update phoenix_workflows set state='SETTLING',updated=? where id=?",(now,wid))
acc=max(now,int(a['created'] or 0));exp=acc+600000
c.execute('update phoenix_close_consents set accepted=?,expires=? where attempt=?',(acc,exp,aid))
c.commit();print('patched',a['signature'],'consent',acc,exp)
