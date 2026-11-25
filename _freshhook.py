import shutil
p='/opt/jamddmaj-perps/worker/perps-server-worker.mjs'
shutil.copy2(p,p+'.bak-pre-test2-20261124')
shutil.copy2('/tmp/worker-fresh.mjs',p)
s=open(p).read()
old='      phoenixAutoFeed = async () => {\n        const catalog = await phoenixPublicClient.catalog();'
new='''      phoenixAutoFeed = async () => {
        const testSignal = process.env.JAMDDMAJ_PHOENIX_TEST_SIGNAL;
        if (testSignal) {
          const parsed = JSON.parse(testSignal);
          return { remotePaused: false, candidates: [parsed] };
        }
        const catalog = await phoenixPublicClient.catalog();'''
if old not in s: raise SystemExit('test hook pattern missing')
open(p,'w').write(s.replace(old,new,1))
print('fresh worker patched')
