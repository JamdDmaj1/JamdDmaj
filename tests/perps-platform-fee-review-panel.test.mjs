import test from 'node:test';
import assert from 'node:assert/strict';
import {PERPS_PLATFORM_FEE} from '../lib/perps-platform-fee.js';
import {setupPerpsPlatformFeeReviewPanel} from '../lib/perps-platform-fee-review-panel.js';
const wallet='review-wallet',at=Date.parse('2026-10-25T12:00:00Z');
const review=()=>Object.freeze({stage:'SEPARATE_PLATFORM_FEE_PAYMENT_REVIEW',readyForSigning:false,
 assessmentId:'a'.repeat(64),walletAddress:wallet,recipient:PERPS_PLATFORM_FEE.recipient,mint:PERPS_PLATFORM_FEE.mint,
 termsVersion:PERPS_PLATFORM_FEE.version,marginUnits:'40000000',feeUnits:'80000',networkFeePayer:'TRADER',networkFeeToken:'SOL',
 networkSponsorshipAvailable:false,networkFeeLamports:'5000',rentLamports:'0',expiresAt:at+60000});
function fixture(submit=async r=>({stage:'PLATFORM_FEE_SUBMISSION_ACKNOWLEDGED',assessmentId:r.assessmentId,paid:false,readyForRetry:false})){
 let selected=wallet,time=at;const events=new Map();
 const node=()=>({children:[],append(...children){this.children.push(...children);},setAttribute(){}});
 const doc={createElement:node,hidden:false,visibilityState:'visible',hasFocus:()=>true,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 const panel=setupPerpsPlatformFeeReviewPanel({parent:node(),doc,readWallet:()=>selected,submit,now:()=>time});
 return {...panel,doc,events,select(address){selected=address;},advance(ms){time+=ms;}};
}
test('commercial USDC fee and trader-paid SOL are separate; opening a review never submits',async()=>{
 let calls=0;const f=fixture(async r=>{calls++;return {stage:'PLATFORM_FEE_SUBMISSION_ACKNOWLEDGED',assessmentId:r.assessmentId,paid:false,readyForRetry:false};});
 f.setReview(review());assert.match(f.commercial.textContent,/0\.08 USDC/);assert.match(f.commercial.textContent,/40 USDC/);
 assert.match(f.network.textContent,/0\.000005 SOL/);assert.match(f.network.textContent,/No hay patrocinio/);assert.equal(f.consent.checked,false);
 await f.confirm.onclick();assert.equal(calls,0);assert.equal(f.confirm.disabled,true);f.dispose();
});
test('explicit confirmation preserves the original signed-review identity and acknowledgement is not paid',async()=>{
 const value=review();let calls=0;const f=fixture(async(r,args)=>{calls++;assert.equal(r,value);assert.equal(args.explicitApproval,true);return {stage:'PLATFORM_FEE_SUBMISSION_ACKNOWLEDGED',assessmentId:r.assessmentId,paid:false,readyForRetry:false};});
 f.setReview(value);f.consent.checked=true;f.consent.onchange();assert.equal(f.confirm.disabled,false);
 await f.confirm.onclick();await f.confirm.onclick();assert.equal(calls,1);assert.match(f.status.textContent,/pendiente de confirmación/);assert.equal(f.confirm.disabled,true);f.dispose();
});
test('changed wallet, expiry and hidden document block the payment prompt',async()=>{
 for(const change of [f=>f.select('other-wallet'),f=>f.advance(60000),f=>{f.doc.hidden=true;}]){
  const f=fixture(()=>assert.fail('must not submit'));f.setReview(review());f.consent.checked=true;change(f);await f.confirm.onclick();assert.equal(f.confirm.disabled,true);f.dispose();
 }
});
test('altered recipient, fee, payer, mint, terms and sponsorship cannot be shown as a valid review',()=>{
 for(const patch of [{recipient:'other'},{feeUnits:'1'},{networkFeePayer:'SPONSOR'},{networkFeeToken:'USDC'},{mint:'other'},{termsVersion:'old'},
  {networkSponsorshipAvailable:true},{networkFeeLamports:'10001'},{rentLamports:'2039280'}]){
  const f=fixture();assert.throws(()=>f.setReview({...review(),...patch}));assert.equal(f.confirm.disabled,true);f.dispose();
 }
});
test('wallet/session events clear consent and disposed panels cannot show another review',()=>{
 const f=fixture();f.setReview(review());f.consent.checked=true;f.events.get('jamd-web-wallet-session')();assert.equal(f.consent.checked,false);assert.equal(f.section.hidden,true);
 f.dispose();assert.equal(f.events.size,0);assert.throws(()=>f.setReview(review()));
});
