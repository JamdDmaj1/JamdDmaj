import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerpsAutomationApi} from '../lib/perps-automation-api.js';
const owner='a'.repeat(64),token='b'.repeat(64),wallet='3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T';
function fixture(){
 const calls=[],controls={read:who=>{if(who.ownerAccountHash!==owner||who.walletAddress!==wallet)throw Error('PERPS_CONTROLS_UNAVAILABLE');return {walletAddress:wallet};},readForOwner:()=>({walletAddress:wallet}),save(){},pause(){},issueActivationChallenge(){},activate(){}};
 const botSwaps=Object.fromEntries(['status','prepare','confirm','recover'].map(method=>[method,async args=>{calls.push({method,args});return {stage:'fixture',walletAddress:wallet};}]));
 const handler=createPerpsAutomationApi({controls,botSwaps,authenticate:async r=>r.headers.get('authorization')==='Bearer '+token?owner:'c'.repeat(64),rateLimit:async()=>true});
 const request=(body,headers={})=>handler(new Request('https://executor.example/v1/automation',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'https://www.jamddmaj.com',...headers},body:JSON.stringify(body)}));
 return {calls,request};
}
test('all bot swap actions bind to the authenticated owner before invoking custody service',async()=>{
 const f=fixture();for(const [action,method,extra]of [['botSwapStatus','status',{}],['botSwapPrepare','prepare',{direction:'SOL_TO_USDC',amount:'0.1'}],['botSwapConfirm','confirm',{id:'d'.repeat(64),explicitApproval:true}],['botSwapRecover','recover',{id:'d'.repeat(64)}]]){
  const response=await f.request({action,walletAddress:wallet,...extra});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');assert.equal(f.calls.at(-1).method,method);assert.equal(f.calls.at(-1).args.ownerAccountHash,owner);
 }
});
test('foreign owner, forged body identity, foreign origin and missing session never reach bot swap service',async()=>{
 const f=fixture(),body={action:'botSwapPrepare',walletAddress:wallet,direction:'SOL_TO_USDC',amount:'0.1'};
 assert.equal((await f.request(body,{Authorization:''})).status,401);
 assert.equal((await f.request(body,{Authorization:'Bearer '+'d'.repeat(64)})).status,403);
 assert.equal((await f.request({...body,ownerAccountHash:owner})).status,400);
 assert.equal((await f.request(body,{Origin:'https://attacker.example'})).status,403);
 assert.equal(f.calls.length,0);
});
