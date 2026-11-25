import shutil
p='/opt/jamddmaj-perps/worker/perps-server-worker.mjs'
shutil.copy2(p,p+'.bak-test-hook-20261124')
s=open(p).read()
old='''      phoenixAutoFeed = async () => {
        const catalog = await phoenixPublicClient.catalog();'''
new='''      phoenixAutoFeed = async () => {
        const testSignal = process.env.JAMDDMAJ_PHOENIX_TEST_SIGNAL;
        if (testSignal) {
          const parsed = JSON.parse(testSignal);
          return { remotePaused: false, candidates: [parsed] };
        }
        const catalog = await phoenixPublicClient.catalog();'''
if old not in s: raise SystemExit('pattern missing')
s=s.replace(old,new,1)
open(p,'w').write(s)
print('patched test hook')
