import shutil
p='/opt/jamddmaj-perps/web/perps-web-service.mjs'
q='/tmp/perps-web-debug.mjs'
shutil.copy2(p,q)
s=open(q).read()
s=s.replace('function fail95() {\n  throw Error("WEB_PERPS_SERVICE_UNAVAILABLE");\n}', 'function fail95() {\n  const e = Error("WEB_PERPS_SERVICE_UNAVAILABLE");\n  console.error("FAIL95_STACK", e.stack);\n  throw e;\n}')
s=s.replace('} catch {\n  console.error("WEB_PERPS_SERVICE_UNAVAILABLE");\n  process.exitCode = 1;', '} catch (error) {\n  console.error("STARTUP_ERROR", error?.stack || error);\n  process.exitCode = 1;')
open(q,'w').write(s)
print('patched')
