import shutil
p='/opt/jamddmaj-perps/worker/perps-server-worker.mjs';shutil.copy2(p,p+'.bak-log2-20261124')
s=open(p).read();old='''      } catch {
        store.fail(candidate.id);
        return Object.freeze({ stage: "PHOENIX_AUTO_OPEN_RETRY", signalId: candidate.id });''';new='''      } catch (error) {
        console.error("PHOENIX_AUTO_OPEN_ERROR", error?.message || error);
        store.fail(candidate.id);
        return Object.freeze({ stage: "PHOENIX_AUTO_OPEN_RETRY", signalId: candidate.id });''';assert old in s;open(p,'w').write(s.replace(old,new,1));print('patched')
