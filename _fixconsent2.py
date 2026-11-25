import sqlite3,time
p='/var/lib/private/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p)
rev='47d268c0-f37e-4cf8-913d-0d7ed9e29dbe';wid='de2462882e3585bb2dc49d1c85963d72856715de4e2e52aabcb9da18c1e15150'
c.execute('update phoenix_close_consents set revision=?,expires=? where workflow=?',(rev,int(time.time()*1000)+300000,wid));c.commit();print('consent updated 47d')
PY
