import shutil
p='/opt/jamddmaj-perps/worker/perps-server-worker.mjs'
shutil.copy2(p,p+'.bak-manualopen-20261124')
s=open(p).read()
old='      const manualOpen = [...items.values()].some((item) => item.state === "OPEN" && !autoWorkflows.has(item.workflowId));'
new='''      const manualOpen = [...items.values()].some((item) => {
        if (item.state !== "OPEN" || autoWorkflows.has(item.workflowId)) return false;
        return Array.isArray(item.trader?.positions) && item.trader.positions.some((position) => {
          try { return BigInt(position.baseLots ?? 0) !== 0n; } catch { return false; }
        });
      });'''
if old not in s: raise SystemExit('pattern missing')
s=s.replace(old,new,1);open(p,'w').write(s);print('patched manualOpen')
