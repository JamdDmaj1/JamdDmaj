import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JAMD_BUY_LIQUIDITY_POLICY as policy,planJamdLiquidityFee as plan} from '../lib/jamd-buy-liquidity-policy.js';

test('approved JAMD economics are immutable, preparation-only and do not tax exits',()=>{
 assert.equal(policy.buyFeeBps,100);assert.equal(policy.sellFeeBps,0);assert.equal(policy.transferFeeBps,0);
 assert.equal(policy.lock,'permanent');assert.equal(policy.newLiquidityLockBps,10000);
 assert.equal(policy.burnJamd,false);assert.equal(policy.enabled,false);assert.ok(Object.isFrozen(policy));
 assert.equal(policy.scope,'jamddmaj-integration-only');
 const buy=plan({side:'buy',inputBaseUnits:'100000000'});
 assert.equal(buy.feeBaseUnits,'1000000');assert.equal(buy.tradeInputBaseUnits,'99000000');
 assert.equal(buy.executable,false);assert.equal(buy.blockers.length,3);
 for(const side of ['sell','transfer']){
  const r=plan({side,inputBaseUnits:'100000000'});assert.equal(r.feeBaseUnits,'0');assert.equal(r.tradeInputBaseUnits,'100000000');assert.equal(r.feeAsset,null);
 }
});
test('base units use exact bounded arithmetic and never round above one percent',()=>{
 for(const n of [1n,99n,100n,101n,100000001n,18446744073709551615n]){
  const r=plan({side:'buy',inputBaseUnits:String(n)}),fee=BigInt(r.feeBaseUnits);
  assert.ok(fee*100n<=n);assert.ok(n-fee*100n<100n);
  assert.equal(fee+BigInt(r.tradeInputBaseUnits),n);
 }
 for(const inputBaseUnits of ['0','-1','1e8','1.5','01','18446744073709551616',100])assert.throws(()=>plan({side:'buy',inputBaseUnits}));
 assert.throws(()=>plan({side:'unknown',inputBaseUnits:'100'}));
});
test('saved launch intent cannot imply the buy fee or lock is already operational',async()=>{
 const intent=JSON.parse(await readFile(new URL('../security/jamd-mainnet-intent.json',import.meta.url),'utf8'));
 assert.equal(intent.buyLiquidityPolicy.buyFeeBps,policy.buyFeeBps);
 assert.equal(intent.buyLiquidityPolicy.sellFeeBps,0);assert.equal(intent.buyLiquidityPolicy.transferFeeBps,0);
 assert.equal(intent.buyLiquidityPolicy.newLiquidityLockBps,10000);
 assert.equal(intent.buyLiquidityPolicy.enforcement,'unimplemented');assert.equal(intent.buyLiquidityPolicy.enabled,false);
 assert.equal(intent.mainnetEnabled,false);assert.equal(intent.buyLiquidityPolicy.poolAddress,null);
});
