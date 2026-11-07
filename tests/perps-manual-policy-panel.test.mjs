import test from 'node:test';
import assert from 'node:assert/strict';
import {setupManualPerpsPolicyPanel} from '../lib/perps-manual-policy-panel.js';
import {selectWalletAccount} from '../lib/wallet-portfolio-store.js';
import {fixtureWallet as address} from './helpers/perps-history-fixture.mjs';
const limits={capitalUsd:'50',dailyLossUsd:'5',positions:1,dailyTrades:5};
function fixture(client,source='external'){const listeners=new Map(),node=()=>({children:[],events:{},append(...v){this.children.push(...v);},setAttribute(){},addEventListener(k,f){this.events[k]=f;}}),doc={createElement:node,
 addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k),dispatchEvent:e=>listeners.get(e.type)?.()};
 selectWalletAccount(doc,{address,source,name:source==='watch'?'Bot':'Phantom'});return {...setupManualPerpsPolicyPanel(node(),{doc,client}),doc};}
test('manual policy panel has no inherited limits, only explicit reads and separate unchecked save consent',async()=>{
 let reads=0,saves=0;const f=fixture({read:async()=>{reads++;return {policy:null,executionAvailable:false};},save:async input=>{
  saves++;assert.deepEqual(input.limits,limits);assert.equal(input.expectedRevision,null);assert.equal(input.explicitApproval,true);return {policy:{walletAddress:address,revision:'saved',limits},executionAvailable:false};}});
 assert.equal(reads+saves,0);assert.equal(f.fields.capitalUsd.value,'');assert.equal(f.approval.checked,false);assert.equal(f.save.disabled,true);
 await f.read.onclick();assert.equal(reads,1);for(const [k,v]of Object.entries(limits))f.fields[k].value=String(v);
 f.approval.checked=true;f.approval.onchange();await f.save.onclick();assert.equal(saves,1);assert.equal(f.approval.checked,false);assert.match(f.status.textContent,/deshabilitada/);
});
test('a lost policy save clears claimed confirmation and requires a fresh read, never retries or activates',async()=>{
 let saves=0;const f=fixture({read:async()=>({policy:null,executionAvailable:false}),save:async()=>{saves++;throw Error('private');}});
 await f.read.onclick();for(const [k,v]of Object.entries(limits))f.fields[k].value=String(v);f.approval.checked=true;await f.save.onclick();
 assert.equal(saves,1);assert.equal(f.save.disabled,true);assert.match(f.status.textContent,/sin confirmar/);assert.doesNotMatch(f.status.textContent,/private/);
});

test('order flow automatically reads protection and opens setup only when limits are missing, never saving defaults',async()=>{
 let reads=0;const f=fixture({read:async()=>{reads++;return {policy:null,executionAvailable:true};},save:()=>assert.fail('No automatic save')});
 assert.equal(await f.ensureForReview(),false);assert.equal(reads,1);assert.equal(f.panel.open,true);assert.equal(f.fields.capitalUsd.value,'');
 const ready=fixture({read:async()=>({policy:{walletAddress:address,revision:'saved',limits},executionAvailable:true}),save:()=>assert.fail('No automatic save')});
 assert.equal(await ready.ensureForReview(),true);assert.notEqual(ready.panel.open,true);assert.equal(ready.fields.capitalUsd.value,'50');assert.equal(ready.approval.checked,false);
});

test('bot wallet per-order mode requires a deliberate click after reading its revision, never auto-saves',async()=>{
 let saves=0;const f=fixture({read:async()=>({policy:{walletAddress:address,revision:'old',limits},executionAvailable:false}),save:async input=>{
  saves++;assert.equal(input.expectedRevision,'old');assert.deepEqual(input.limits,{mode:'perOrder'});assert.equal(input.explicitApproval,true);
  return {policy:{walletAddress:address,revision:'new',limits:input.limits},executionAvailable:false};
 }},'watch');
 await f.ensureForReview();assert.equal(saves,0);assert.equal(f.perOrder.disabled,false);
 await f.perOrder.onclick();assert.equal(saves,1);assert.equal(f.perOrder.disabled,true);assert.match(f.status.textContent,/Sin topes/);
});

test('unsaved edits survive automatic review reads and invalid limits do not destroy the loaded revision',async()=>{
 let reads=0,saves=0;const f=fixture({read:async()=>{reads++;return {policy:{walletAddress:address,revision:'old',limits},executionAvailable:true};},save:()=>{saves++;assert.fail();}});
 await f.read.onclick();f.fields.dailyLossUsd.value='90';f.fields.dailyLossUsd.events.input();
 assert.equal(await f.ensureForReview(),false);assert.equal(reads,1);assert.equal(f.fields.dailyLossUsd.value,'90');
 f.approval.checked=true;await f.save.onclick();assert.equal(saves,0);assert.match(f.status.textContent,/No se guardó/);
 f.fields.dailyLossUsd.value='6';f.approval.checked=true;f.approval.onchange();assert.equal(f.save.disabled,false);
});
