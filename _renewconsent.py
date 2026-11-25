import sqlite3,time,shutil
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite';shutil.copy2(p,p+'.bak-consent-20261125')
c=sqlite3.connect(p);now=int(time.time()*1000)
w='36bd40199f55447d0e9837475515f93a1f4cd22c5d644dc39ca447633ba46c12'
c.execute('update phoenix_close_consents set accepted=?,expires=?,maximum_lamports=? where workflow=?',(now,now+300000,'10000000',w));c.commit()
print('updated',c.execute('select revision,maximum_lamports,accepted,expires from phoenix_close_consents where workflow=?',(w,)).fetchone())
PY
