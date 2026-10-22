import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../api/perps-review.js';
import {validateWebPerpsReview} from '../lib/perps-navigation.js';
import {setupFuturesTicket} from '../lib/swap-quote-ui.js';
import {selectWalletAccount} from '../lib/wallet-portfolio-store.js';
import {IDBFactory} from 'fake-indexeddb';
const wallet='11111111111111111111111111111112',other='11111111111111111111111111111113';
const draft={asset:'BTC',side:'LONG',margin:'10',leverage:'3',referencePrice:'100'};
const env={UPSTASH_REDIS_REST_URL:'configured',UPSTASH_REDIS_REST_TOKEN:'configured'};
function review(at=Date.now(),form=draft,address=wallet){return {stage:'MANUAL_PERPS_REVIEW_VALIDATED',readyForSigning:false,tradingEnabled:false,walletAddress:address,draft:form,
 observedAt:at,observedSlot:100,expiresAt:at+15000,availableUsdcUnits:'20000000',payerLamports:'100000000',marginUsdcUnits:'10000000',sizeUsdUnits:'30000000',
 networkFeeLamports:'15100',rentLockedLamports:'10000000',requiresWalletSignature:true,requiresDurableSubmissionJournal:true};}
const request=value=>new Request('https://www.jamddmaj.com/api/perps-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
test('web review API accepts only bounded manual form data and never a signed transaction or execution action',async()=>{
 let prepared=0,limited=0;const diagnostics=[];
 const handler=createHandler({env,limit:async()=>{limited++;},prepare:async(form,address)=>{prepared++;assert.deepEqual(form,draft);assert.equal(address,wallet);return review();},diagnostic:code=>diagnostics.push(code)});
 const response=await handler(request({walletAddress:wallet,draft}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal((await response.json()).review.tradingEnabled,false);assert.equal(prepared,1);assert.equal(limited,1);
 for(const input of [{walletAddress:wallet,draft,signature:'secret'},{walletAddress:wallet,draft:{...draft,serializedTxBase64:'wire'}},{walletAddress:'not-a-key',draft},{walletAddress:wallet,draft:{...draft,margin:'1'}},{}])assert.equal((await handler(request(input))).status,400);
 assert.equal(prepared,1);assert.equal(limited,1);
 assert.equal((await handler(new Request('https://www.jamddmaj.com/api/perps-review'))).status,405);
 assert.equal((await handler(new Request('https://www.jamddmaj.com/api/perps-review',{method:'POST',headers:{'Content-Type':'application/json'},body:' '.repeat(2049)}))).status,400);
 assert.equal((await handler(new Request('https://www.jamddmaj.com/api/perps-review?action=execute',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}))).status,400);
 assert.equal(diagnostics.length,0);
});
test('missing rate-limit configuration and quota failure stop before builder or RPC and errors never echo private input',async()=>{
 let prepared=0;const prepare=async()=>{prepared++;return review();};
 assert.equal((await createHandler({env:{},prepare})(request({walletAddress:wallet,draft}))).status,503);
 const handler=createHandler({env,prepare,limit:async()=>{throw Object.assign(Error('must-not-echo'),{status:429});},diagnostic:()=>{}});
 const response=await handler(request({walletAddress:wallet,draft}));assert.equal(response.status,429);assert.equal(prepared,0);assert.doesNotMatch(await response.text(),/must-not-echo/);
 for(const code of ['PERPS_MANUAL_INSUFFICIENT_USDC','PERPS_MANUAL_INSUFFICIENT_SOL']){
  const result=await createHandler({env,limit:async()=>{},prepare:async()=>{throw Error(code);},diagnostic:()=>{}})(request({walletAddress:wallet,draft}));
  assert.equal(result.status,409);assert.equal((await result.json()).error,code);
 }
});
test('browser display refuses another account, altered order, stale review, invented balance, executable response and extra wire',()=>{
 const at=Date.now(),valid=review(at);assert.equal(validateWebPerpsReview(valid,draft,wallet,at).readyForSigning,false);
 for(const change of [{walletAddress:other},{draft:{...draft,side:'SHORT'}},{expiresAt:at},{observedAt:at-15001},{readyForSigning:true},{tradingEnabled:true},
  {availableUsdcUnits:'9999999'},{sizeUsdUnits:'30000001'},{networkFeeLamports:'0'},{payerLamports:'1000'},{serializedTxBase64:'wire'},{requiresWalletSignature:false}])assert.throws(()=>validateWebPerpsReview({...valid,...change},draft,wallet,at));
});
function ui(fetchImpl){
 const nodes=[],listeners=new Map(),events=[];let connectCalls=0;
 const doc={createElement(tag){const callbacks=new Map(),node={tag,children:[],value:'',append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(){},addEventListener(type,fn){callbacks.set(type,[...(callbacks.get(type)||[]),fn]);},emit(type){for(const fn of callbacks.get(type)||[])fn();}};nodes.push(node);return node;},
  addEventListener(type,fn){listeners.set(type,[...(listeners.get(type)||[]),fn]);},removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(value=>value!==fn));},dispatchEvent(event){events.push(event);for(const fn of listeners.get(event.type)||[])fn(event);},
  defaultView:{CustomEvent,fetch:fetchImpl}};
 const ticket=setupFuturesTicket(doc.createElement('main'),'en',doc,()=>{},()=>{connectCalls++;});
 return {doc,nodes,ticket,events,get connectCalls(){return connectCalls;},long:nodes.find(n=>n.textContent==='Review Long'),price:nodes.find(n=>n.id==='jupiter-reference-price'),
  capability:nodes.find(n=>n.className==='futures-signing-status'),status:nodes.filter(n=>n.tag==='p').at(-1),output:nodes.filter(n=>n.className==='trade-order-summary').at(-1),
  select(address=wallet){selectWalletAccount(doc,{address,source:'external',name:'Phantom'});}};
}
test('web Futures offers wallet selection and explicit review rather than disabled Android-only trading controls',async()=>{
 let calls=0;const f=ui(async()=>{calls++;throw Error();});assert.equal(f.long.disabled,false);assert.match(f.capability.textContent,/Web signing is not enabled/);
 await f.long.onclick();assert.equal(f.connectCalls,1);assert.equal(calls,0);
 f.select();assert.match(f.capability.textContent,/Phantom/);assert.match(f.capability.textContent,/not enabled yet/);
 f.ticket.dispose();await f.long.onclick();assert.equal(calls,0);
 assert(!f.nodes.some(n=>n.textContent?.includes('Trading requires a compatible Android build')));
});

test('Futures recovery requires a selected external wallet and an empty local journal never claims no open positions',async()=>{
 let requests=0;const f=ui(async()=>{requests++;throw Error('must not request');});
 const button=f.nodes.find(n=>n.textContent==='Check pending operation'),message=f.nodes.at(-1);
 await button.onclick();assert.match(message.textContent,/Select the external wallet/);assert.equal(requests,0);
 f.doc.defaultView.indexedDB=new IDBFactory();f.select();await button.onclick();
 assert.match(message.textContent,/No pending web operations/);assert.match(message.textContent,/does not confirm.*no open positions/);
 assert.equal(requests,0);assert.equal(button.disabled,false);f.ticket.dispose();await button.onclick();assert.equal(requests,0);
});

test('Futures recovery keeps uncertainty visible on local storage failure without contacting a wallet or execution route',async()=>{
 let requests=0;const f=ui(async()=>{requests++;throw Error();});f.select();
 f.doc.defaultView.indexedDB={open(){throw Error('storage unavailable');}};
 const button=f.nodes.find(n=>n.textContent==='Check pending operation');await button.onclick();
 assert.match(f.nodes.at(-1).textContent,/Any pending operation is retained/);assert.equal(requests,0);assert.equal(button.disabled,false);
 f.ticket.dispose();
});
test('web review checks the selected account and current form without a wallet signing or execute request',async()=>{
 const calls=[],f=ui(async(url,options)=>{calls.push({url,options});const input=JSON.parse(options.body);return Response.json({ok:true,review:review(Date.now(),input.draft,input.walletAddress)});});
 f.select();f.price.value='100';await f.long.onclick();assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/perps-review');
 assert.deepEqual(JSON.parse(calls[0].options.body),{walletAddress:wallet,draft});assert.equal(f.output.hidden,false);assert.match(f.output.textContent,/0.000015100 SOL/);
 assert.equal(f.events.some(event=>event.type==='jamd-wallet-open-perps'),false);assert.equal(f.long.disabled,false);
 f.price.value='101';f.price.emit('input');assert.equal(f.output.hidden,true);f.ticket.dispose();
});
test('wallet changes and edits abort in-flight reviews and do not leave action buttons stuck',async()=>{
 for(const mode of ['wallet','input','market','dispose']){
  let finish,signal;const f=ui((url,options)=>{signal=options.signal;return new Promise(resolve=>{finish=()=>{const input=JSON.parse(options.body);resolve(Response.json({ok:true,review:review(Date.now(),input.draft,input.walletAddress)}));};});});
  f.select();f.price.value='100';const pending=f.long.onclick();assert.equal(f.long.disabled,true);
  if(mode==='wallet')f.select(other);if(mode==='input'){f.price.value='110';f.price.emit('input');}if(mode==='market')f.ticket.selectAsset({symbol:'SOL'});if(mode==='dispose')f.ticket.dispose();
  assert.equal(signal.aborted,true);finish();await pending;assert.equal(f.output.hidden,true);if(mode!=='dispose')assert.equal(f.long.disabled,false);f.ticket.dispose();
 }
});
test('a late transport ignoring the timeout cannot leave a web review stuck checking or display its expired result',async t=>{
 let deadline,finish;const original=setTimeout;
 t.mock.method(globalThis,'setTimeout',(fn,delay,...args)=>delay===20000?(deadline=fn,123):original(fn,delay,...args));
 const f=ui((url,options)=>new Promise(resolve=>{finish=()=>resolve(Response.json({ok:true,review:review(Date.now(),JSON.parse(options.body).draft)}));}));
 f.select();f.price.value='100';const pending=f.long.onclick();deadline();finish();await pending;
 assert.equal(f.output.hidden,true);assert.equal(f.long.disabled,false);assert(f.nodes.some(n=>n.textContent?.includes('Could not verify the web review')));f.ticket.dispose();
});
