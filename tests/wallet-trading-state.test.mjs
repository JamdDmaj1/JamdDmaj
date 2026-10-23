import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {selectWalletAccount,selectedWalletAccount,publishWalletPortfolio} from '../lib/wallet-portfolio-store.js';
import {publishWalletTradingState,currentWalletTradingState,validateWalletTradingSnapshot} from '../lib/wallet-trading-state.js';
import {setupWalletTradingController} from '../lib/wallet-trading-controller.js';
import {bindWalletDisplay} from '../lib/wallet-display.js';
import {readWalletTradingState} from '../lib/wallet-trading-reader.js';
import {createHandler} from '../api/wallet-trading-state.js';
import {PERPS_CUSTODIES} from '../lib/perps-server-custody.js';
import {PERPS_PROGRAM,PERPS_POOL,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {getProgramDerivedAddress} from '@solana/kit';
const a={source:'native',address:bs58.encode(Buffer.alloc(32,1)),name:'JamdDmaj'},b={source:'external',address:bs58.encode(Buffer.alloc(32,2)),name:'Phantom'};
function docFixture(){const doc=new EventTarget();doc.defaultView=new EventTarget();doc.defaultView.Event=Event;doc.defaultView.CustomEvent=class extends Event{constructor(name,{detail}){super(name);this.detail=detail;}};return doc;}
function snapshot(account=a,patch={}){return {stage:'PUBLIC_WALLET_TRADING_STATE',walletAddress:account.address,network:'solana-mainnet',readOnly:true,observedAt:Date.now(),observedSlot:123,
 availableUsdcUnits:'5000000',allocatedUsdUnits:'12000000',payerLamports:'180000000',positions:[{address:b.address,asset:'SOL',side:'SHORT',sizeUsdUnits:'30000000',collateralUsdUnits:'12000000',priceUsdUnits:'100000000'}],orders:[],ordersComplete:true,history:[],historyComplete:true,...patch};}
test('unified display keeps on-chain collateral separate and never double subtracts it from wallet funds',()=>{
 const doc=docFixture();selectWalletAccount(doc,a);const account=selectedWalletAccount(doc),data=snapshot();
 publishWalletTradingState(doc,data,account,{pendingKnown:true});const state=currentWalletTradingState(doc);
 assert.equal(state.availableUsdcUnits,'5000000');assert.equal(state.snapshot.allocatedUsdUnits,'12000000');assert.equal(state.reservationsKnown,true);
 data.availableUsdcUnits='9999999';assert.equal(state.availableUsdcUnits,'5000000');assert(Object.isFrozen(state.snapshot.orders));
});
test('unknown journal, any pending operation, unknown native order or incomplete order query withhold available capital',()=>{
 for(const [patch,holds]of [[{},{}],[{},{pendingKnown:true,pending:[{id:'fixture',state:'UNKNOWN',signedBase64:'MUST_NOT_LEAK'}]}],[{ordersComplete:false},{pendingKnown:true}],[{orders:[{address:b.address,kind:'UNCLASSIFIED'}]},{pendingKnown:true}]]){
  const doc=docFixture();selectWalletAccount(doc,a);publishWalletTradingState(doc,snapshot(a,patch),selectedWalletAccount(doc),holds);
  const state=currentWalletTradingState(doc);assert.equal(state.availableUsdcUnits,null);assert(!JSON.stringify(state).includes('MUST_NOT_LEAK'));
 }
});
test('wallet switch including ABA rejects late responses and cannot mix native, Phantom or bot capital',()=>{
 const doc=docFixture();selectWalletAccount(doc,a);const original=selectedWalletAccount(doc);
 publishWalletTradingState(doc,snapshot(),original,{pendingKnown:true});selectWalletAccount(doc,b);assert.equal(currentWalletTradingState(doc),null);
 selectWalletAccount(doc,a);assert.equal(publishWalletTradingState(doc,snapshot(),original,{pendingKnown:true}),false);
 const account=selectedWalletAccount(doc);assert.throws(()=>publishWalletTradingState(doc,snapshot(b),account,{pendingKnown:true}));
 selectWalletAccount(doc,null);assert.equal(currentWalletTradingState(doc),null);
});
test('stale, future, malformed or regressed chain evidence never becomes available capital',()=>{
 const doc=docFixture();selectWalletAccount(doc,a);const account=selectedWalletAccount(doc);
 for(const patch of [{observedAt:Date.now()-30001},{observedAt:Date.now()+5000},{availableUsdcUnits:'1.1'},{availableUsdcUnits:'18446744073709551616'},{positions:[{}]},{history:[{}]},{readOnly:false},{network:'devnet'}])assert.throws(()=>validateWalletTradingSnapshot(snapshot(a,patch),a));
 publishWalletTradingState(doc,snapshot(),account,{pendingKnown:true});assert.equal(publishWalletTradingState(doc,snapshot(a,{observedSlot:122}),account,{pendingKnown:true}),false);
 const late=currentWalletTradingState(doc,Date.now()+31000);assert.equal(late.snapshot,null);assert.equal(late.availableUsdcUnits,null);
});
test('Trade and Futures percent sizing share exact same capital without changing edited values on refresh',()=>{
 const doc=docFixture();selectWalletAccount(doc,a);const account=selectedWalletAccount(doc),outputs=[{},{}],sliders=[{},{}],amounts=[{value:'12',dispatchEvent(){}},{value:'20',dispatchEvent(){}}];
 for(let i=0;i<2;i++)bindWalletDisplay(doc,'en',outputs[i],sliders[i],amounts[i]);
 assert(sliders.every(s=>s.disabled));publishWalletTradingState(doc,snapshot(),account,{pendingKnown:true});assert(sliders.every(s=>!s.disabled));assert.equal(amounts[0].value,'12');
 for(const s of sliders){s.value='50';s.oninput();}assert(amounts.every(v=>v.value==='2.500000'));
 publishWalletTradingState(doc,snapshot(),account,{pendingKnown:true,pending:[{id:'pending',state:'SUBMITTED'}]});assert(sliders.every(s=>s.disabled));
 selectWalletAccount(doc,b);assert(sliders.every(s=>s.disabled));
 doc.defaultView.dispatchEvent(new Event('pagehide'));
});
test('a suspended expiry timer cannot size an order from an already-expired public balance',t=>{
 const doc=docFixture();selectWalletAccount(doc,a);const account=selectedWalletAccount(doc),slider={},amount={value:'12',dispatchEvent(){}};
 bindWalletDisplay(doc,'en',{},slider,amount);publishWalletTradingState(doc,snapshot(),account,{pendingKnown:true});assert.equal(slider.disabled,false);
 const at=Date.now();t.mock.method(Date,'now',()=>at+31000);slider.value='100';slider.oninput();assert.equal(amount.value,'12');assert.equal(slider.disabled,true);
 doc.defaultView.dispatchEvent(new Event('pagehide'));
});
async function chainFixture(){
 const token=Buffer.alloc(165);Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint)).copy(token);Buffer.from(bs58.decode(a.address)).copy(token,32);token[108]=1;token.writeBigUInt64LE(5000000n,64);
 const calls=[],request=async(method,params)=>{calls.push(method);
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getMultipleAccounts')return {context:{slot:123},value:[{owner:'11111111111111111111111111111111',executable:false,lamports:180000000,data:['','base64']},{owner:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',executable:false,lamports:2039280,data:[token.toString('base64'),'base64']},...Array(6).fill(null)]};
  if(method==='getProgramAccounts'){assert.equal(params[1].filters[1].memcmp.bytes,a.address);assert.equal(params[1].minContextSlot,123);return {context:{slot:124},value:[]};}
  if(method==='getSignaturesForAddress')return [{signature:bs58.encode(Buffer.alloc(64,5)),slot:120,blockTime:1000,err:null,confirmationStatus:'finalized'}];
  throw Error('NO_FINANCIAL_METHOD:'+method);
 };return {request,calls};
}
test('public API and real native decoder return shared account data using only bounded read methods',async()=>{
 const f=await chainFixture(),handler=createHandler({request:f.request,limit:async()=>{},diagnostic(){}}),response=await handler(new Request('https://fixture.test/api/wallet-trading-state?address='+a.address));
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const data=await response.json();
 assert.equal(data.availableUsdcUnits,'5000000');assert.equal(data.payerLamports,'180000000');assert.equal(data.history.length,1);assert.equal(data.ordersComplete,true);
 assert(f.calls.every(m=>['getGenesisHash','getMultipleAccounts','getProgramAccounts','getSignaturesForAddress'].includes(m)));
 assert(!JSON.stringify(data).includes('signedBase64'));assert(!JSON.stringify(data).includes('ownerAccountHash'));
});
test('partial orders/history do not invent a zero-confirmed account or a complete history',async()=>{
 const f=await chainFixture(),request=async(m,p)=>{if(['getProgramAccounts','getSignaturesForAddress'].includes(m))throw Error('offline');return f.request(m,p);};
 const data=await readWalletTradingState(a.address,{request});assert.equal(data.availableUsdcUnits,'5000000');assert.equal(data.ordersComplete,false);assert.equal(data.historyComplete,false);
 const doc=docFixture();selectWalletAccount(doc,a);publishWalletTradingState(doc,data,selectedWalletAccount(doc),{pendingKnown:true});assert.equal(currentWalletTradingState(doc).availableUsdcUnits,null);
});
test('native owner-bound position and TP request are decoded together, while foreign or unsupported requests never masquerade as safe empty orders',async()=>{
 const f=await chainFixture(),intent={walletAddress:a.address,asset:'SOL',side:'SHORT'},ids=await deriveServerPerpsIdentities(intent);
 const p=Buffer.alloc(210);Buffer.from('aabc8fe47a40f7d0','hex').copy(p);
 for(const [offset,key]of [[8,a.address],[40,PERPS_POOL],[72,PERPS_CUSTODIES.SOL.address],[104,PERPS_CUSTODIES.USDC.address]])Buffer.from(bs58.decode(key)).copy(p,offset);
 p.writeBigUInt64LE(1000n,136);p.writeBigUInt64LE(1001n,144);p[152]=2;p.writeBigUInt64LE(100000000n,153);p.writeBigUInt64LE(30000000n,161);p.writeBigUInt64LE(12000000n,169);p[209]=ids.positionBump;
 const counter=Buffer.alloc(8);counter.writeBigUInt64LE(7n);
 const [requestAddress,bump]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(ids.position),counter,new Uint8Array([2])]});
 const data=Buffer.alloc(230);Buffer.from('0c26fac72e9a20d8','hex').copy(data);
 for(const [offset,key]of [[8,a.address],[40,PERPS_POOL],[72,PERPS_CUSTODIES.SOL.address],[104,ids.position],[136,PERPS_CUSTODIES.USDC.mint]])Buffer.from(bs58.decode(key)).copy(data,offset);
 data.writeBigUInt64LE(1000n,168);data.writeBigUInt64LE(1001n,176);data.writeBigUInt64LE(30000000n,184);data[200]=2;data[201]=1;data[202]=2;data[206]=1;data.writeBigUInt64LE(90000000n,207);data[215]=1;data[216]=0;data[217]=1;data.writeBigUInt64LE(7n,220);data[228]=bump;
 const row={pubkey:requestAddress,account:{owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[data.toString('base64'),'base64']}};
 const request=async(m,params)=>{
  if(m==='getProgramAccounts')return {context:{slot:124},value:[row]};
  const result=await f.request(m,params);if(m==='getMultipleAccounts')result.value[7]={owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[p.toString('base64'),'base64']};return result;
 };
 const result=await readWalletTradingState(a.address,{request});assert.equal(result.positions[0].side,'SHORT');assert.equal(result.allocatedUsdUnits,'12000000');assert.deepEqual(result.orders,[{address:requestAddress,kind:'TP'}]);
 data[203]=1;row.account.data[0]=data.toString('base64');assert.equal((await readWalletTradingState(a.address,{request})).orders[0].kind,'UNCLASSIFIED');
 data[8]^=1;row.account.data[0]=data.toString('base64');assert.equal((await readWalletTradingState(a.address,{request})).ordersComplete,false);
});
test('native pending status is read without opening or unlocking a wallet and changed native identity stays unknown',async()=>{
 const doc=docFixture(),win=doc.defaultView;selectWalletAccount(doc,a);let opened=0,reads=0;
 const dispose=setupWalletTradingController(doc,win,{nativePlugin:()=>({open(){opened++;},async getPublicAccount(){reads++;return {available:true,address:b.address,pendingKnown:true,pending:[]};}}),request:async()=>Response.json(snapshot())});
 await new Promise(r=>setImmediate(r));assert.equal(reads,1);assert.equal(opened,0);assert.equal(currentWalletTradingState(doc).availableUsdcUnits,null);dispose();
});
test('native resume immediately withholds sizing then reads the actual public pending hold without a biometric or send',async()=>{
 const doc=docFixture(),win=doc.defaultView;selectWalletAccount(doc,a);let pending=[],reads=0;
 const dispose=setupWalletTradingController(doc,win,{nativePlugin:()=>({async getPublicAccount(){reads++;return {available:true,address:a.address,pendingKnown:true,pending};}}),request:async()=>Response.json(snapshot())});
 await new Promise(r=>setImmediate(r));assert.equal(currentWalletTradingState(doc).availableUsdcUnits,'5000000');
 pending=[{id:'unfunded-fixture',state:'UNKNOWN'}];win.dispatchEvent(new Event('focus'));assert.equal(currentWalletTradingState(doc).availableUsdcUnits,null);
 await new Promise(r=>setImmediate(r));assert.equal(reads,2);assert.equal(currentWalletTradingState(doc).operations[0].state,'UNKNOWN');assert.equal(currentWalletTradingState(doc).availableUsdcUnits,null);dispose();
});
test('API rejects unknown fields, other methods, unavailable chain and rate limits without returning another account',async()=>{
 let calls=0;const handler=createHandler({read:async()=>{calls++;throw Error();},limit:async()=>{},diagnostic(){}});
 assert.equal((await handler(new Request('https://fixture.test/?address='+a.address+'&owner=secret'))).status,400);
 assert.equal((await handler(new Request('https://fixture.test/?address='+a.address,{method:'POST'}))).status,405);assert.equal(calls,0);
 assert.equal((await handler(new Request('https://fixture.test/?address='+a.address))).status,502);
 const limited=createHandler({limit:async()=>{throw {status:429};},diagnostic(){}});assert.equal((await limited(new Request('https://fixture.test/?address='+a.address))).status,429);
});
test('one read-only controller refreshes all views and ignores late responses from a previous account',async()=>{
 const doc=docFixture(),win=doc.defaultView;let release,reads=0;
 selectWalletAccount(doc,a);
 const dispose=setupWalletTradingController(doc,win,{readPending:async()=>({pendingKnown:true,pending:[]}),request:async url=>{
  reads++;const address=new URL(url,'https://fixture.test').searchParams.get('address');if(address===a.address)await new Promise(r=>release=r);
  return Response.json(snapshot(address===a.address?a:b));
 }});
 await new Promise(r=>setImmediate(r));selectWalletAccount(doc,b);await new Promise(r=>setImmediate(r));
 assert.equal(currentWalletTradingState(doc).account.address,b.address);release();await new Promise(r=>setImmediate(r));
 assert.equal(currentWalletTradingState(doc).account.address,b.address);assert.equal(reads,2);dispose();
});
