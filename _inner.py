p='/tmp/perps-web-debug.mjs'
s=open(p).read()
old='''  } catch {
    try {
      release();
    } catch {
    }
    fail95();
  }'''
new='''  } catch (inner) {
    console.error("INNER_ERROR", inner?.stack || inner);
    try {
      release();
    } catch {
    }
    fail95();
  }'''
if old not in s: print('pattern missing')
else:
 s=s.replace(old,new,1);open(p,'w').write(s);print('patched')
