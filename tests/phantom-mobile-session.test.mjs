import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {createPhantomMobileSession} from '../lib/phantom-mobile-session.js';
function fixture(){
 let callback,url,removed=0;
 const app={async addListener(name,fn){assert.equal(name,'appUrlOpen');callback=fn;return {remove(){removed++;}}}};
 const launcher={async openPhantom(options){url=options.url;}};
 return {app,launcher,get url(){return url;},get removed(){return removed;},emit(value){callback({url:value});}};
}
function approval(url){
 const request=new URL(url),redirect=new URL(request.searchParams.get('redirect_link'));
 const phantom=nacl.box.keyPair(),nonce=nacl.randomBytes(24),shared=nacl.box.before(bs58.decode(request.searchParams.get('dapp_encryption_public_key')),phantom.secretKey);
 const data=nacl.box.after(new TextEncoder().encode(JSON.stringify({public_key:'11111111111111111111111111111111',session:'session'})),nonce,shared);
 redirect.searchParams.set('phantom_encryption_public_key',bs58.encode(phantom.publicKey));redirect.searchParams.set('nonce',bs58.encode(nonce));redirect.searchParams.set('data',bs58.encode(data));return redirect.toString();
}
test('listener is registered before launch; encrypted approval returns only public account and cleans up',async()=>{
 const f=fixture(),session=createPhantomMobileSession(f),result=session.connect();await new Promise(resolve=>setImmediate(resolve));
 f.emit('jamddmaj://phantom?request='+'0'.repeat(32));
 const callback=approval(f.url);f.emit(callback);
 assert.deepEqual(await result,{address:'11111111111111111111111111111111',network:'Solana mainnet'});assert.equal(f.removed,1);
 f.emit(callback);assert.equal(f.removed,1);session.dispose();
});
test('rejection, cancellation and expiry clear listeners without exposing a connected account',async()=>{
 for(const action of ['reject','cancel','expire']){
  const f=fixture();let time=0;const session=createPhantomMobileSession({...f,now:()=>time,timeoutMs:1000});const result=session.connect(),rejected=assert.rejects(result);await new Promise(resolve=>setImmediate(resolve));
  if(action==='cancel')session.disconnect();else{const callback=new URL(new URL(f.url).searchParams.get('redirect_link'));callback.searchParams.set('errorCode','4001');if(action==='expire')time=1001;f.emit(callback.toString());}
  await rejected;assert.equal(f.removed,1);session.dispose();
 }
});
