import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerPerpsReadOnlyRpc} from '../lib/perps-server-rpc.js';
function response(body,options={}){return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'},...options});}
test('read-only transport binds each JSON-RPC response and sends no credentials or redirects',async()=>{
 const calls=[];const rpc=createServerPerpsReadOnlyRpc({fetchImpl:async(url,options)=>{calls.push({url,options});const body=JSON.parse(options.body);return response({jsonrpc:'2.0',id:body.id,result:body.method==='getGenesisHash'?'mainnet':{value:null}});}});
 assert.equal(await rpc('getGenesisHash',[]),'mainnet');assert.deepEqual(await rpc('getMultipleAccounts',[[],{commitment:'confirmed'}]),{value:null});
 assert.deepEqual(await rpc('getLatestBlockhash',[{commitment:'confirmed',minContextSlot:100}]),{value:null});
 assert.equal(JSON.parse(calls[2].options.body).method,'getLatestBlockhash');
 assert.equal(calls[0].url,'https://api.mainnet-beta.solana.com/');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.headers.Authorization,undefined);
 assert.notEqual(JSON.parse(calls[0].options.body).id,JSON.parse(calls[1].options.body).id);
});
test('write, signing and unsupported methods are rejected before any network request',async()=>{
 let calls=0;const rpc=createServerPerpsReadOnlyRpc({fetchImpl:async()=>{calls++;throw Error();}});
 for(const method of ['sendTransaction','sendRawTransaction','requestAirdrop','signTransaction','execute','getBalance','__proto__'])await assert.rejects(rpc(method,[]));
 await assert.rejects(rpc('getSlot',null));await assert.rejects(rpc('getSlot',Array(11)));assert.equal(calls,0);
});
test('concurrent read responses remain bound to their own IDs even when returned out of order',async()=>{
 const pending=[];const rpc=createServerPerpsReadOnlyRpc({fetchImpl:async(_url,options)=>new Promise(resolve=>pending.push({resolve,id:JSON.parse(options.body).id}))});
 const first=rpc('getSlot',[]),second=rpc('getBlockHeight',[]);
 pending[1].resolve(response({jsonrpc:'2.0',id:pending[1].id,result:200}));assert.equal(await second,200);
 pending[0].resolve(response({jsonrpc:'2.0',id:pending[0].id,result:100}));assert.equal(await first,100);
});
test('HTTP errors, mismatched IDs, malformed envelopes and oversized payloads fail without retries',async()=>{
 for(const make of [
  id=>response({jsonrpc:'2.0',id:id+1,result:1}),id=>response({jsonrpc:'1.0',id,result:1}),id=>response({jsonrpc:'2.0',id,error:{message:'secret provider detail'}}),
  id=>response({jsonrpc:'2.0',id,result:1,error:null}),id=>response({jsonrpc:'2.0',id}),id=>response([{jsonrpc:'2.0',id,result:1}]),
  ()=>new Response('invalid',{headers:{'Content-Type':'application/json'}}),()=>new Response('error',{status:503}),
  id=>response({jsonrpc:'2.0',id,result:'x'.repeat(2000)}),id=>response({jsonrpc:'2.0',id,result:1},{headers:{'Content-Type':'text/html'}}),
  id=>response({jsonrpc:'2.0',id,result:1},{headers:{'Content-Type':'application/json','Content-Length':'99999999'}})
 ]){
  let calls=0;const rpc=createServerPerpsReadOnlyRpc({maxResponseBytes:1024,fetchImpl:async(_url,options)=>{calls++;return make(JSON.parse(options.body).id);}});
  await assert.rejects(rpc('getSlot',[]),/^Error: PERPS_READ_ONLY_RPC_UNAVAILABLE$/);assert.equal(calls,1);
 }
});
test('timeouts abort the request and invalid endpoint/configuration never starts a request',async()=>{
 let aborted=false;const rpc=createServerPerpsReadOnlyRpc({timeoutMs:10,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('private URL'));},{once:true}))});
 await assert.rejects(rpc('getSlot',[]),/PERPS_READ_ONLY_RPC_UNAVAILABLE/);assert.equal(aborted,true);
 for(const options of [{url:'http://example.com'},{url:'https://user:password@example.com'},{url:'https://example.com/#fragment'},{timeoutMs:15001},{maxResponseBytes:999},{fetchImpl:null}])assert.throws(()=>createServerPerpsReadOnlyRpc(options));
});
