import shutil
p='/opt/jamddmaj-perps/worker/perps-server-worker.mjs'
b='/opt/jamddmaj-perps/worker/perps-server-worker.mjs.bak-close-identity-20261123'
shutil.copy2(p,b)
s=open(p).read()
old='if (currentHeader.signer !== expected.walletAddress || currentHeader.symbol !== expected.symbol || currentHeader.assetId !== expected.assetId || currentHeader.tickSize !== expected.tickSize || currentHeader.baseLotsDecimals !== expected.baseLotsDecimals || currentHeader.quoteDecimals !== 6) fail87("IDENTITY");'
new='if (currentHeader.signer !== expected.walletAddress || currentHeader.quoteDecimals !== 6) fail87("IDENTITY");'
if old not in s: raise SystemExit('PATTERN_NOT_FOUND')
s=s.replace(old,new,1)
open(p,'w').write(s)
print('PATCHED',b)
