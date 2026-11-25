import sqlite3
p='/var/lib/private/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p)
rev='47d268c0-f37e-4cf8-913d-0d7ed9e29dbe';wid='de2462882e3585bb2dc49d1c85963d72856715de4e2e52aabcb9da18c1e15150';aid='2583bee4bb49d02141a7945b6d74b54a48fe5ae2f64f71dbf0255519bc7543f8'
c.execute('update phoenix_order_attempts set revision=? where id=?',(rev,aid))
c.execute('update phoenix_close_consents set revision=? where attempt=?',(rev,aid))
c.execute('update phoenix_workflows set revision=? where id=?',(rev,wid))
c.commit();print('aligned')
PY
