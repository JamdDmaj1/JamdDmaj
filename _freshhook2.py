import shutil
p='/opt/jamddmaj-perps/worker/perps-server-worker.mjs';shutil.copy2(p,p+'.bak-signing-test-20261124');shutil.copy2('/tmp/worker-fresh2.mjs',p)
s=open(p).read();old='      phoenixAutoFeed = async () => {\n        const catalog = await phoenixPublicClient.catalog();';new='''      phoenixAutoFeed = async () => {
        const testSignal = process.env.JAMDDMAJ_PHOENIX_TEST_SIGNAL;
        if (testSignal) { const parsed = JSON.parse(testSignal); return { remotePaused: false, candidates: [parsed] }; }
        const catalog = await phoenixPublicClient.catalog();''';assert old in s;open(p,'w').write(s.replace(old,new,1));print('patched')
