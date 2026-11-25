import sqlite3,json
p='/var/lib/private/jamddmaj-perps-runtime/phoenix.sqlite';c=sqlite3.connect(p);c.row_factory=sqlite3.Row
print('workflows')
for r in c.execute('select id,symbol,child,state,margin,fee_terms from phoenix_workflows'):print(dict(r))
print('attempts')
for r in c.execute('select id,workflow,kind,state,signature,substr(receipt,1,100) from phoenix_order_attempts order by workflow,sequence'):print(dict(r))
print('consents')
for r in c.execute('select * from phoenix_close_consents'):print(dict(r))
print('orphans',c.execute('select count(*) from phoenix_order_attempts a left join phoenix_workflows f on a.workflow=f.id where f.id is null').fetchone())
PY
