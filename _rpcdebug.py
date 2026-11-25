p='/opt/jamddmaj-perps/web/perps-web-debug.mjs'
s=open(p).read()
needle='  if (endpoint2.protocol !== "https:" || endpoint2.username || endpoint2.password || endpoint2.hash || typeof fetchImpl !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15e3 || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1024 || maxResponseBytes > 8388608) fail89();'
rep='  console.error("RPC_ARGS", JSON.stringify({url, protocol: endpoint2.protocol, user: endpoint2.username, pass: endpoint2.password, hash: endpoint2.hash, fetch: typeof fetchImpl, timeoutMs, maxResponseBytes, readSpacingMs}));\n'+needle
if needle not in s: raise SystemExit('missing')
s=s.replace(needle,rep,1);open(p,'w').write(s);print('patched')
