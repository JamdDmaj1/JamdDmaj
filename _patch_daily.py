import sys
p=sys.argv[1]
s=open(p).read()
s=s.replace('export {\n  inspectPerpsDailyAccount\n};','export {\n  inspectPerpsDailyAccount, readServerPerpsDailyAccount, createServerPerpsReadOnlyRpc\n};')
open('/tmp/daily-raw.mjs','w').write(s)
