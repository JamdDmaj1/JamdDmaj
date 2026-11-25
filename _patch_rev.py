import sqlite3,time
cp='/var/lib/jamddmaj-perps-controls/controls.sqlite'
cc=sqlite3.connect(cp);cc.row_factory=sqlite3.Row
r=cc.execute("select revision,enabled,paused from perps_automation_controls where wallet='3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T'").fetchone();print('controls',dict(r))
rev=r['revision']
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
wid='9627ca37af11c86ee971df7372f8a68913fe83f56f53234da06f0bc22d8df34e';aid='ee5ab1cea34e1002ad23514583f94e5f5f53b864b603f10b11af050e1e14ad71'
now=int(time.time()*1000)
c.execute('update phoenix_workflows set revision=?,updated=? where id=?',(rev,now,wid))
c.execute('update phoenix_order_attempts set revision=?,updated=? where id=?',(rev,now,aid))
c.execute('update phoenix_close_consents set revision=?,accepted=?,expires=? where attempt=?',(rev,now,now+600000,aid))
c.commit();print('updated',rev)
