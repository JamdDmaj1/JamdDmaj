p='/opt/jamddmaj-perps/worker/perps-server-worker.mjs'
s=open(p).read()
old='if (summary || !packetSeen) fail87("SUMMARY");\n        summary = decodeSummary(b);\n        if (summary.trader !== expected.traderAddress) fail87("IDENTITY");'
new='if (summary || !packetSeen) fail87("SUMMARY");\n        summary = decodeSummary(b);'
if old not in s: raise SystemExit('PATTERN_NOT_FOUND')
open(p,'w').write(s.replace(old,new,1));print('patched summary')
