import sqlite3
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite'
c=sqlite3.connect(p)
ids=['64b521e15e67a4e0cb9d476d321a3e1814184f797bf5ec074ef1bdf73b169501','711d1c7ef020407112fe9cdcb04f9b34d68f4752cf9b72811aab873bbcf5c692']
for wid in ids:
 c.execute('delete from phoenix_close_consents where workflow=?',(wid,))
 c.execute('delete from phoenix_fee_consents where workflow=?',(wid,))
 c.execute('delete from phoenix_order_attempts where workflow=?',(wid,))
 c.execute('delete from phoenix_workflows where id=?',(wid,))
c.commit();print('removed',len(ids))
