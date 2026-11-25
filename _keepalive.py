import shutil
p='/opt/jamddmaj-perps/web/perps-web-service.mjs'
shutil.copy2(p,p+'.bak-keepalive-20261123')
s=open(p).read()
old='  await service.run({ once: process.argv.includes("--once") });\n'
new='''  const runResult = service.run({ once: process.argv.includes("--once") });
  await runResult;
  if (!process.argv.includes("--once")) {
    await new Promise((resolve) => {
      const done = () => resolve();
      process.once("SIGTERM", done);
      process.once("SIGINT", done);
    });
  }
'''
if old not in s: raise SystemExit('pattern missing')
s=s.replace(old,new,1)
open(p,'w').write(s)
print('patched keepalive')
