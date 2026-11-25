import sqlite3
p='_phx-test.sqlite';c=sqlite3.connect(p)
wid='9627ca37af11c86ee971df7372f8a68913fe83f56f53234da06f0bc22d8df34e'
c.execute("delete from phoenix_close_consents where workflow=?",(wid,))
c.execute("delete from phoenix_order_attempts where workflow=? and kind='CLOSE'",(wid,))
c.commit();print('deleted')
