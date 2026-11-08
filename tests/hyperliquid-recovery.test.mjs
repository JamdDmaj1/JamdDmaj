import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createHyperliquidTestnetJournal} from '../lib/hyperliquid-journal.js';
import {reconcileHyperliquidOrder} from '../lib/hyperliquid-reconcile.js';
const now=1800000000000,user='0x'+'11'.repeat(20),cloid='0x'+'12'.repeat(16),order={a:1,b:false,p:'0.12',s:'240',r:true,t:{limit:{tif:'Ioc'}},c:cloid};
const record={network:'testnet',user,cloid,symbol:'DOGE',positionSize:'240',order,phase:'UNCERTAIN',createdAt:now,expiresAt:now+15000};
const status=(state='filled',remaining='0')=>({status:'order',order:{status:state,order:{cloid,coin:'DOGE',side:'A',origSz:'240',sz:remaining,oid:123}}});
const account=(size=null)=>({network:'testnet',user,observedAt:now,positions:size?[{symbol:'DOGE',size}]:[],orders:[]});
const fills=sz=>[{coin:'DOGE',side:'A',oid:123,tid:100,time:now,sz}];
test('full and partial close receipts require matching fills, original size and resulting position',()=>{
 const full=reconcileHyperliquidOrder({record,status:status(),fills:fills('240'),account:account(),now});assert.equal(full.stage,'FILLED');assert.equal(full.positionRemains,false);
 const partial=reconcileHyperliquidOrder({record,status:status('canceled','120'),fills:fills('120'),account:account('120'),now});assert.equal(partial.stage,'PARTIALLY_FILLED');assert.equal(partial.positionRemains,true);
 assert.equal(reconcileHyperliquidOrder({record,status:{status:'unknownOid'},fills:[],account:account(),now}),null);
 assert.equal(reconcileHyperliquidOrder({record,status:status(),fills:fills('240'),account:account('240'),now}),null);
 assert.throws(()=>reconcileHyperliquidOrder({record,status:status(),fills:[],account:account(),now}),/incomplete-fills/);
 assert.throws(()=>reconcileHyperliquidOrder({record,status:status(),fills:[...fills('120'),...fills('120')],account:account(),now}),/fill-identity/);
});
test('durable hold survives reopen; forged receipts, different cloid and unknown sends never clear it',async()=>{
 const indexedDB=new IDBFactory(),locks={request:async(_name,_options,fn)=>fn({})};
 let journal=createHyperliquidTestnetJournal({indexedDB,locks});await journal.put(user,record);assert.equal(await journal.nonce(user,now),now);await journal.dispose();
 journal=createHyperliquidTestnetJournal({indexedDB,locks});assert.deepEqual(await journal.get(user),record);assert.equal(await journal.nonce(user,now),now+1);await assert.rejects(()=>journal.put(user,{...record,cloid:'0x'+'34'.repeat(16)}),/pending-operation/);
 await assert.rejects(()=>journal.release(user,cloid,{network:'testnet',user,cloid,reconciled:true}),/reconcile-required/);
 const receipt=reconcileHyperliquidOrder({record,status:status(),fills:fills('240'),account:account(),now});await journal.release(user,cloid,receipt);assert.equal(await journal.get(user),null);assert.equal(await journal.nonce(user,now),now+2);await journal.dispose();
});
test('unavailable durable storage or contended cross-tab lock blocks instead of using memory',async()=>{
 assert.throws(()=>createHyperliquidTestnetJournal({indexedDB:null,locks:null}),/durable-storage-required/);
 const journal=createHyperliquidTestnetJournal({indexedDB:new IDBFactory(),locks:{request:async(_name,_options,fn)=>fn(null)}});let executed=false;await assert.rejects(()=>journal.lock('test',async()=>{executed=true;}),/another-tab-active/);assert.equal(executed,false);await journal.dispose();
});
