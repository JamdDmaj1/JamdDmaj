import test from 'node:test';
import assert from 'node:assert/strict';
import {setupBotManualPerpsPanel} from '../lib/bot-manual-perps-panel.js';
import {selectWalletAccount} from '../lib/wallet-portfolio-store.js';
import {quotePerpsPlatformFee} from '../lib/perps-platform-fee.js';

test('conversion panel labels the first step and continues only through another unchecked review',async t=>{
 const nodes=[],doc={defaultView:{Event},dispatchEvent(){},addEventListener(){},removeEventListener(){},createElement(tag){
  const n={tag,children:[],textContent:'',hidden:false,append(...items){this.children.push(...items);},setAttribute(){},addEventListener(){},removeEventListener(){}};nodes.push(n);return n;
 }};
 const wallet='11111111111111111111111111111112',id='11111111-1111-4111-8111-111111111111';
 selectWalletAccount(doc,{source:'watch',address:wallet});
 const draft={asset:'BTC',side:'LONG',margin:'10',leverage:'3',referencePrice:'100'},requests=[];let pending=false,confirms=0;
 const base={id,walletAddress:wallet,draft,expiresAt:Date.now()+10000,submitted:false,marginUsdcUnits:'10000000',networkFeeLamports:'5000',rentLockedLamports:'0',fee:quotePerpsPlatformFee('10000000'),limits:{capitalUsd:'20',dailyLossUsd:'20',positions:1,dailyTrades:1}};
 const client={status:async()=>({available:!pending,operations:pending?[{id,draft,state:'RESERVED',requiresOpeningReview:true}]:[]}),
  prepare:async(_wallet,_draft,options)=>{assert.deepEqual(_draft,draft);requests.push(options);return {...base,stage:options.entryReservationId?'BOT_MANUAL_REVIEW':'BOT_MANUAL_ENTRY_CONVERSION_REVIEW',...(options.entryReservationId?{entryReservationId:id}:{minimumCollateralUnits:'9950000'})};},
  confirm:async()=>{confirms++;pending=true;return {id,state:'RESERVED',requiresOpeningReview:true};},
  recover:async()=>({id,state:'RESERVED',requiresOpeningReview:true,requiresNewReview:true})};
 const panel=setupBotManualPerpsPanel(doc.createElement('main'),{doc,language:'en',client});t.after(()=>panel.dispose());
 await panel.prepare(draft);
 const confirm=nodes.find(n=>n.tag==='button'&&n.textContent==='Confirm conversion · does not open a position');assert.ok(confirm);assert.equal(confirm.disabled,true);
 const consent=nodes.find(n=>n.tag==='input'&&n.type==='checkbox');consent.checked=true;consent.onchange();await confirm.onclick();assert.equal(confirms,1);
 const next=nodes.find(n=>n.textContent==='Review opening · second step');assert.equal(next.hidden,false);
 const recover=nodes.find(n=>n.tag==='button'&&n.textContent==='Check manual bot order');await recover.onclick();
 assert.equal(nodes.some(n=>n.textContent.includes('No opening submission was recorded. A new review and approval are required.')),true);
 assert.equal(confirms,1);assert.equal(next.hidden,false);
 // Reload/reselect with unrelated current form values must not replace the
 // persisted conversion's original intent when continuing its opening.
 await panel.prepare({...draft,asset:'ETH',margin:'20'});assert.equal(next.hidden,false);
 await next.onclick();
 assert.deepEqual(requests,[{}, {entryReservationId:id}]);assert.equal(confirm.textContent,'Confirm opening');assert.equal(consent.checked,false);assert.equal(confirm.disabled,true);
 assert.equal(next.hidden,true);assert.equal(confirms,1);
});
