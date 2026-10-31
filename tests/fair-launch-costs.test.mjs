import test from 'node:test';
import assert from 'node:assert/strict';
import {fairLaunchCostReview,formatTestSol} from '../lib/fair-launch-costs.js';
test('cost review uses simulated payer debit and separates fee, network and reserves exactly',()=>{
 const r=fairLaunchCostReview({value:{err:null,preBalances:[1000000000n],postBalances:[890000000n],fee:10000n}},{kind:'create',owner:'public',platformFeeLamports:100000000n,now:1000});
 assert.equal(r.estimatedTotalLamports,'110000000');assert.equal(r.accountReservesLamports,'9990000');assert.equal(r.expiresAt,46000);assert.equal(r.cluster,'solana:devnet');assert.equal(formatTestSol(r.estimatedTotalLamports),'0.110000000');assert.ok(Object.isFrozen(r));
});
test('missing, failed or inconsistent simulation cannot become an approval',()=>{
 for(const value of [{err:{failed:true}},{err:null},{err:null,preBalances:[100],postBalances:[101],fee:0},{err:null,preBalances:[100],postBalances:[90],fee:20},{err:null,preBalances:[1e20],postBalances:[0],fee:0}])assert.throws(()=>fairLaunchCostReview({value},{kind:'create'}),/UNAVAILABLE/);
});
