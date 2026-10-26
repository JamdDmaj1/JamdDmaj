import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {swapFixture} from './fixtures/web-swap.mjs';
import {createWalletInlineSwap,swapInputUnits} from '../lib/wallet-inline-swap.js';
import {selectWalletAccount} from '../lib/wallet-portfolio-store.js';
import {bindWebPerpsWalletSession,openWebSwapJournal,authorizeWebPerpsOwnerSignature,authorizeWebCloseSignature} from '../lib/perps-web-wallet-session.js';

test('token amounts use exact integer units and reject precision loss and invalid amounts',()=>{
 assert.equal(swapInputUnits('0.000000001',9),'1');assert.equal(swapInputUnits('5.000001',6),'5000001');
 for(const value of ['0','-1','1e2','NaN','1.0000001',' 1','01','1,2'])assert.throws(()=>swapInputUnits(value,6));
});
async function fixture({connected=true,changeWhileSigning=false}={}){
 const seed=new Uint8Array(32).fill(91),publicKey=ed25519.getPublicKey(seed),address=bs58.encode(publicKey),f=await swapFixture(address,{slippageBps:50}),nodes=[];
 const doc=new EventTarget();doc.visibilityState='visible';let signatures=0,sends=0,locks=0;
 const win={Event,indexedDB:new IDBFactory(),navigator:{locks:{request:async(name,options,fn)=>{locks++;assert.equal(name,'jamddmaj-wallet-operation:'+address);return fn();}}}};doc.defaultView=win;
 doc.createElement=tag=>{const node={tag,textContent:'',children:[],value:'',checked:false,append(...items){this.children.push(...items);},setAttribute(){}};nodes.push(node);return node;};
 win.fetch=async(url,options)=>{
  if(url.startsWith('/api/swap-build?'))return Response.json({ok:true,preparation:f.preparation});
  assert.equal(url,'https://solana-rpc.publicnode.com');const request=JSON.parse(options.body);let result;
  if(request.method==='sendTransaction'){sends++;const wire=Buffer.from(request.params[0],'base64');assert(ed25519.verify(wire.subarray(1,65),wire.subarray(65),publicKey));result=bs58.encode(wire.subarray(1,65));}
  else if(request.method==='getSignatureStatuses')result={context:{slot:100},value:[{slot:99,err:null,confirmationStatus:'finalized',confirmations:null}]};
  else result=await f.rpc(request.method,request.params);
  return Response.json({jsonrpc:'2.0',id:request.id,result});
 };
 const account={address,publicKey,chains:['solana:mainnet'],features:['solana:signTransaction']};
 const wallet={name:'Phantom fixture',chains:['solana:mainnet'],accounts:[account],features:{'solana:signTransaction':{version:'1.0.0',supportedTransactionVersions:[0,'legacy'],signTransaction:async input=>{
  signatures++;assert.equal(input.chain,'solana:mainnet');const wire=Uint8Array.from(input.transaction);wire.set(ed25519.sign(wire.subarray(65),seed),1);
  if(changeWhileSigning)selectWalletAccount(doc,{address,source:'watch',name:'watch'});
  return [{signedTransaction:wire}];
 }}}};
 selectWalletAccount(doc,{address,source:'external',name:'Phantom fixture'});if(connected)bindWebPerpsWalletSession(doc,wallet,account);
 const panel=createWalletInlineSwap('en',doc,win),button=text=>nodes.find(n=>n.tag==='button'&&n.textContent===text);
 return {doc,win,address,panel,nodes,button,counts:()=>({signatures,sends,locks})};
}
test('inline review, explicit Phantom approval, single send, finalized check; no navigation',async t=>{
 const f=await fixture();t.after(()=>f.panel.dispose());f.panel.open();assert.equal(f.panel.element.hidden,false);
 const amount=f.nodes.find(n=>n.tag==='input'&&n.type==='text'),approve=f.nodes.find(n=>n.type==='checkbox');amount.value='0.1';amount.oninput();
 await f.button('Review swap').onclick();assert.deepEqual(f.counts(),{signatures:0,sends:0,locks:0});
 assert(f.nodes.some(n=>n.textContent.includes('Minimum received: 9.950000 USDC')),f.nodes.map(n=>n.textContent).join('\n'));
 assert.equal(f.button('Approve in wallet and submit').disabled,true);approve.checked=true;approve.onchange();
 assert.equal(f.button('Approve in wallet and submit').disabled,false);await f.button('Approve in wallet and submit').onclick();
 assert.deepEqual(f.counts(),{signatures:1,sends:1,locks:1});
 const journal=await openWebSwapJournal(f.win.indexedDB);try{assert(await journal.read(f.address));await f.button('Check pending operation').onclick();assert.equal(await journal.read(f.address),null);}finally{journal.close();}
 assert(f.nodes.some(n=>n.textContent.includes('Swap finalized')));
});
test('remembered address without live provider cannot authorize a swap',async t=>{
 const f=await fixture({connected:false});t.after(()=>f.panel.dispose());f.panel.open();assert.equal(f.button('Review swap').disabled,true);
 assert(f.nodes.some(n=>n.textContent.includes('Reconnect this external wallet')));assert.deepEqual(f.counts(),{signatures:0,sends:0,locks:0});
});
test('account changed during wallet prompt cannot broadcast the returned signature',async t=>{
 const f=await fixture({changeWhileSigning:true});t.after(()=>f.panel.dispose());f.panel.open();f.nodes.find(n=>n.type==='text').value='0.1';await f.button('Review swap').onclick();const approve=f.nodes.find(n=>n.type==='checkbox');approve.checked=true;approve.onchange();await f.button('Approve in wallet and submit').onclick();
 assert.equal(f.counts().signatures,1);assert.equal(f.counts().sends,0);
});
test('unsupported cross-tab lock cannot request a signature or send',async t=>{
 const f=await fixture();t.after(()=>f.panel.dispose());delete f.win.navigator.locks;f.panel.open();f.nodes.find(n=>n.type==='text').value='0.1';await f.button('Review swap').onclick();f.nodes.find(n=>n.type==='checkbox').checked=true;await f.button('Approve in wallet and submit').onclick();assert.equal(f.counts().signatures,0);assert.equal(f.counts().sends,0);
});
test('a durable pending swap blocks the shared futures entry and close authorization paths',async t=>{
 const f=await fixture();t.after(()=>f.panel.dispose());const journal=await openWebSwapJournal(f.win.indexedDB);
 try{await journal.begin({address:f.address,signature:'public-fixture-signature',lastValidBlockHeight:'500'});
  for(const authorize of [authorizeWebPerpsOwnerSignature,authorizeWebCloseSignature])await assert.rejects(authorize({walletAddress:f.address},{doc:f.doc,explicitApproval:true}),/WEB_SWAP_PENDING_CHECK_REQUIRED/);
  assert.equal(f.counts().signatures,0);assert.equal(f.counts().sends,0);
 }finally{journal.close();}
});
