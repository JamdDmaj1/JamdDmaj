import test from 'node:test';
import assert from 'node:assert/strict';
import {setupManualPerpsPolicyPanel} from '../lib/perps-manual-policy-panel.js';
import {selectWalletAccount} from '../lib/wallet-portfolio-store.js';
import {fixtureWallet as address} from './helpers/perps-history-fixture.mjs';
const limits={capitalUsd:'50',dailyLossUsd:'5',positions:1,dailyTrades:5};
function fixture(client){const listeners=new Map(),node=()=>({children:[],append(...v){this.children.push(...v);},setAttribute(){},addEventListener(){}}),doc={createElement:node,
 addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k),dispatchEvent:e=>listeners.get(e.type)?.()};
 selectWalletAccount(doc,{address,source:'external',name:'Phantom'});return {...setupManualPerpsPolicyPanel(node(),{doc,client}),doc};}
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
