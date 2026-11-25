import sqlite3,shutil
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite';shutil.copy2(p,p+'.bak-ray-20261123')
wid='b4e83f5df780ec6d96ef2fa508dc03e6dad33405db84a732f749177601810f3c'
c=sqlite3.connect(p)
c.execute('delete from phoenix_close_consents where workflow=?',(wid,))
c.execute('delete from phoenix_fee_consents where workflow=?',(wid,))
c.execute('delete from phoenix_order_attempts where workflow=?',(wid,))
c.execute('delete from phoenix_workflows where id=?',(wid,))
c.commit();print('removed RAY')
