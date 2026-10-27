import test from 'node:test';
import assert from 'node:assert/strict';
import {incomingWalletReceipts,createWalletReceiptReader} from '../lib/wallet-receipt-reader.js';
import {setupWalletReceiptNotifications} from '../lib/wallet-receipt-notifications.js';
import {rememberWalletAccount,forgetWalletAccount} from '../lib/wallet-portfolio-store.js';
const wallet='3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T',sender='7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy',mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',ata='4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr',signature='1'.repeat(64);
function tx({token=false,own=false,failed=false}={}){return {blockTime:1800000000,transaction:{signatures:[signature],message:{accountKeys:[{pubkey:sender,signer:true},{pubkey:wallet,signer:own},{pubkey:ata,signer:false}],instructions:[token?{programId:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',parsed:{type:'transferChecked',info:{source:sender,destination:ata,mint,tokenAmount:{amount:'2500000',decimals:6}}}}:{programId:'11111111111111111111111111111111',parsed:{type:'transfer',info:{source:sender,destination:wallet,lamports:80000000}}}]}},meta:{err:failed?{}:null,preBalances:[1e9,0,0],postBalances:[9e8,80000000,0],preTokenBalances:[],postTokenBalances:token?[{accountIndex:2,owner:wallet,mint,uiTokenAmount:{amount:'2500000',decimals:6}}]:[],innerInstructions:[]}};}
test('only actual successful incoming transfers produce receipts, not own swaps or price/balance changes',()=>{
 assert.equal(incomingWalletReceipts(tx(),wallet,signature)[0].units,'80000000');
 assert.equal(incomingWalletReceipts(tx({token:true}),wallet,signature)[0].units,'2500000');
 for(const options of [{own:true},{failed:true}])assert.deepEqual(incomingWalletReceipts(tx(options),wallet,signature),[]);
 const noTransfer=tx();noTransfer.transaction.message.instructions=[];assert.deepEqual(incomingWalletReceipts(noTransfer,wallet,signature),[]);
 const wrong=tx({token:true});wrong.meta.postTokenBalances[0].owner=sender;assert.deepEqual(incomingWalletReceipts(wrong,wallet,signature),[]);
});
test('read discovery includes token accounts, only finalized signatures, bounded methods, and no sends',async()=>{
 const calls=[];const read=createWalletReceiptReader({fetchImpl:async(url,o)=>{const q=JSON.parse(o.body);calls.push(q);let result;
  if(q.method==='getGenesisHash')result='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  else if(q.method==='getTokenAccountsByOwner')result={value:q.params[1].programId.startsWith('Tokenkeg')?[{pubkey:ata}]:[]};
  else if(q.method==='getSignaturesForAddress')result=q.params[0]===ata?[{signature,blockTime:1800000000,err:null,confirmationStatus:'finalized'}]:[];
  else if(q.method==='getTransaction')result=tx({token:true});else throw Error('Forbidden RPC '+q.method);
  return Response.json({jsonrpc:'2.0',id:q.id,result});}});
 const r=await read(wallet,{since:1799999999000});assert.equal(r.receipts.length,1);assert.ok(calls.some(q=>q.method==='getSignaturesForAddress'&&q.params[0]===ata));assert.equal(calls.some(q=>q.method==='sendTransaction'),false);
});
function uiFixture(read){const doc=new EventTarget(),nodes=[];doc.hidden=false;const create=tag=>{const n={tag,style:{},children:[],textContent:'',setAttribute(){},append(...v){this.children.push(...v);},prepend(v){this.children.unshift(v);},remove(){},get lastElementChild(){return this.children.at(-1);}};nodes.push(n);return n;};doc.createElement=create;doc.body=create('body');doc.defaultView={CustomEvent};const data=new Map(),sent=[];
 class Notification{static permission='granted';static async requestPermission(){throw Error('No unsolicited prompt');}constructor(title,o){sent.push({title,...o});}}
 const win={Notification,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}};
 rememberWalletAccount(doc,{address:wallet,source:'watch',name:'Bot'});
 const controller=setupWalletReceiptNotifications(create('host'),'en',doc,win,{read,now:()=>1800000001000});
 return {doc,nodes,sent,controller,toggle:nodes.find(n=>n.tag==='input')};
}
test('explicit opt-in, multiple polls deduplicate, no unsolicited system permission, and disabled lookups stop',async t=>{
 let calls=0;const f=uiFixture(async()=>{calls++;return {receipts:incomingWalletReceipts(tx(),wallet,signature).map(v=>({...v,at:1800000001000})),nextCursor:0};});t.after(()=>f.controller.dispose());
 await f.controller.poll();assert.equal(calls,0);f.toggle.checked=true;f.toggle.onchange();await new Promise(r=>setTimeout(r,0));await f.controller.poll();
 assert.equal(f.nodes.find(n=>n.tag==='ul').children.length,1);assert.equal(f.sent.length,0);
 f.toggle.checked=false;f.toggle.onchange();const before=calls;await f.controller.poll();assert.equal(calls,before);
});
test('disabling or unlinking during a receipt lookup suppresses its result',async t=>{
 let resolve;const f=uiFixture(()=>new Promise(r=>{resolve=r;}));t.after(()=>f.controller.dispose());f.toggle.checked=true;f.toggle.onchange();forgetWalletAccount(f.doc,{address:wallet,source:'watch'});
 resolve({receipts:incomingWalletReceipts(tx(),wallet,signature),nextCursor:0});await new Promise(r=>setTimeout(r,0));assert.equal(f.nodes.find(n=>n.tag==='ul').children.length,0);
});
