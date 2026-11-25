import sqlite3, sys
p=sys.argv[1]
c=sqlite3.connect(p)
print("TABLES")
for r in c.execute("select name from sqlite_master where type='table'"):
    print(r[0])
