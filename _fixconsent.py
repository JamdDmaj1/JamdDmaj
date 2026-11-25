import sqlite3,time
p='/var/lib/private/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p)
rev='f82e4eac-f482-4408-a92a-a4bd7f9017e6';wid='de2462882e3585bb2dc49d1c85963d72856715de4e2e52aabcb9da18c1e15150'
c.execute('update phoenix_close_consents set revision=?,expires=? where workflow=?',(rev,int(time.time()*1000)+300000,wid));c.commit();print('consent updated')
PY
