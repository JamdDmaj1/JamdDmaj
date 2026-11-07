import test from 'node:test';
import assert from 'node:assert/strict';
import {setupBotManualRecoveryPanel} from '../lib/bot-manual-recovery-panel.js';
import {selectWalletAccount} from '../lib/wallet-portfolio-store.js';

test('return panel requires fresh consent, retains identity after response loss and only queries recovery',async t=>{
 const nodes=[],doc={defaultView:{Event},dispatchEvent(){},addEventListener(){},removeEventListener(){},createElement(tag){
  const n={tag,children:[],hidden:false,textContent:'',append(...values){this.children.push(...values);},setAttribute(){}};nodes.push(n);return n;
 }};
 const wallet='11111111111111111111111111111112',id='11111111-1111-4111-8111-111111111111';selectWalletAccount(doc,{source:'watch',address:wallet});
 let preparations=0,confirmations=0,queries=0;
 const client={prepareRecovery:async(w,r)=>{assert.equal(w,wallet);assert.equal(r,id);preparations++;return {walletAddress:wallet,expiresAt:Date.now()+9000,asset:'BTC',amountUnits:'9970000',minimumUsdcUnits:'9920150',networkFeeLamports:'5400',rentLockedLamports:'0'};},
  confirmRecovery:async(_review,approval)=>{assert.equal(approval,true);confirmations++;throw Error('MOCK_RESPONSE_LOST');},
  recoverRecovery:async(w,r)=>{assert.equal(w,wallet);assert.equal(r,id);queries++;return {state:'CANCELLED',originalRiskReleased:true};}};
 const panel=setupBotManualRecoveryPanel(doc.createElement('main'),{doc,language:'en',client});t.after(()=>panel.dispose());
 panel.setOperation({wallet,id,state:'RESERVED'});
 const prepare=nodes.find(n=>n.textContent==='Review return to USDC'),confirm=nodes.find(n=>n.textContent==='Confirm return'),recover=nodes.find(n=>n.textContent==='Check return'),consent=nodes.find(n=>n.type==='checkbox');
 await prepare.onclick();assert.equal(preparations,1);assert.equal(confirm.disabled,true);
 await confirm.onclick();assert.equal(confirmations,0);consent.checked=true;
 consent.onchange();await confirm.onclick();assert.equal(confirmations,1);assert.equal(recover.hidden,false);
 await confirm.onclick();assert.equal(confirmations,1);await recover.onclick();assert.equal(queries,1);assert.equal(preparations,1);
 assert.ok(nodes.some(n=>n.textContent.includes('Reserve released after complete verification.')));
 selectWalletAccount(doc,{source:'watch',address:'11111111111111111111111111111113'});panel.setOperation({wallet,id,state:'RESERVED'});
 await recover.onclick();assert.equal(queries,1);
});

test('verified never-broadcast return permits only a new unchecked review, including after reload',async t=>{
 const nodes=[],doc={defaultView:{Event},dispatchEvent(){},addEventListener(){},removeEventListener(){},createElement(tag){
  const n={tag,children:[],hidden:false,textContent:'',append(...values){this.children.push(...values);},setAttribute(){}};nodes.push(n);return n;
 }};
 const wallet='11111111111111111111111111111112',id='11111111-1111-4111-8111-111111111111';selectWalletAccount(doc,{source:'watch',address:wallet});
 let preparations=0,confirms=0;
 const client={prepareRecovery:async()=>{preparations++;return {walletAddress:wallet,expiresAt:Date.now()+9000,asset:'BTC',amountUnits:'9970000',minimumUsdcUnits:'9920150',networkFeeLamports:'5400',rentLockedLamports:'0'};},
  confirmRecovery:async()=>{confirms++;},recoverRecovery:async()=>({state:'ABORTED',requiresNewReview:true,originalRiskReleased:false})};
 const panel=setupBotManualRecoveryPanel(doc.createElement('main'),{doc,language:'en',client});t.after(()=>panel.dispose());
 panel.setOperation({wallet,id,state:'RESERVED',recoveryState:'SIGNING'});
 const prepare=nodes.find(n=>n.textContent==='Review return to USDC'),confirm=nodes.find(n=>n.textContent==='Confirm return'),recover=nodes.find(n=>n.textContent==='Check return'),consent=nodes.find(n=>n.type==='checkbox');
 assert.equal(prepare.hidden,true);await recover.onclick();assert.equal(prepare.hidden,false);assert.equal(confirms,0);
 assert.ok(nodes.some(n=>n.textContent.includes('This attempt was not submitted. You can request a fresh review; reserve remains held.')));
 panel.setOperation({wallet,id,state:'RESERVED',recoveryState:'ABORTED'});assert.equal(prepare.hidden,false);
 await prepare.onclick();assert.equal(preparations,1);assert.equal(consent.checked,false);assert.equal(confirm.disabled,true);
 await confirm.onclick();assert.equal(confirms,0);
});

test('verified on-chain rejection remains query-only and never impersonates a returned balance',async t=>{
 const nodes=[],doc={defaultView:{Event},dispatchEvent(){},addEventListener(){},removeEventListener(){},createElement(tag){
  const n={tag,children:[],hidden:false,textContent:'',append(...values){this.children.push(...values);},setAttribute(){}};nodes.push(n);return n;
 }};
 const wallet='11111111111111111111111111111112',id='11111111-1111-4111-8111-111111111111';selectWalletAccount(doc,{source:'watch',address:wallet});let queries=0;
 const client={prepareRecovery:async()=>assert.fail('No replacement preparation'),confirmRecovery:async()=>assert.fail('No replacement confirmation'),
  recoverRecovery:async()=>{queries++;return {state:'FAILED',originalRiskReleased:false,requiresNewReview:false};}};
 const panel=setupBotManualRecoveryPanel(doc.createElement('main'),{doc,language:'en',client});t.after(()=>panel.dispose());
 panel.setOperation({wallet,id,state:'RESERVED',recoveryState:'UNKNOWN'});
 const prepare=nodes.find(n=>n.textContent==='Review return to USDC'),recover=nodes.find(n=>n.textContent==='Check return');
 await recover.onclick();await recover.onclick();assert.equal(queries,2);assert.equal(prepare.hidden,true);
 assert.ok(nodes.some(n=>n.textContent.includes('The network rejected this return; it converted no tokens. Reserve remains held and no automatic retry will occur.')));
});
