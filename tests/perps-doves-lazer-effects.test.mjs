import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePerpsDovesLazerConfiguration,checkPerpsDovesLazerEffects} from '../lib/perps-doves-lazer-effects.js';
// Public primary native unsigned simulation at paired bank 459603638. These
// prefixes are captured observations, not fabricated signed-payload proof.
const beforeHex='8efdce7a02000000f86d9ad86a00000000fe0600000003c0cf5f9a575e06000400000000000000';
const afterHex='e177ef7a02000000f86f9ad86a00000000fe06000000038061819a575e06000300000000000000';
function fixture(){
 const a=Buffer.alloc(283),b=Buffer.alloc(283);Buffer.from(beforeHex,'hex').copy(a,73);Buffer.from(afterHex,'hex').copy(b,73);
 const signed={priceUnits:'10652448737',exponent:-8,timestampUs:'1792580207600000',feedUpdateTimestampUs:'1792580207600000',confidenceUnits:'4247163'};return {a,b,signed};
}
test('captured native extension change matches exact signed microseconds and confidence floor, without granting provenance or signing',()=>{
 const {a,b,signed}=fixture(),result=checkPerpsDovesLazerEffects(a,b,signed);
 assert.equal(result.before.micros,1792580205400000n);assert.equal(result.after.micros,1792580207600000n);
 assert.equal(result.before.confidence,4n);assert.equal(result.after.confidence,3n);
 assert.equal(result.after.timestamp,1792580207n);assert.equal(result.readyForSigning,undefined);
});
test('extensions are exact, not a whitelist for arbitrary tails, missing confidence, microsecond regressions or unsigned changes',()=>{
 for(const mode of ['unsigned','microsecond','confidence','reserved','config','id','channel','size','missing','null','timestamp','regression','downgrade']){
  const {a,b,signed}=fixture();let s=signed,next=b;
  if(mode==='unsigned')s=undefined;if(mode==='microsecond')b.writeBigUInt64LE(b.readBigUInt64LE(96)+1n,96);
  if(mode==='confidence')b.writeBigUInt64LE(4n,104);if(mode==='reserved')b[112]=1;if(mode==='config')b[40]=1;
  if(mode==='id')b[91]^=1;if(mode==='channel')b[95]^=1;if(mode==='size')next=Buffer.concat([b,Buffer.alloc(1)]);
  if(mode==='missing')s={...signed,confidenceUnits:null};if(mode==='null')s={...signed,feedUpdateTimestampUs:'1792580207599999'};
  if(mode==='timestamp')b.writeBigInt64LE(1792580206n,82);
  if(mode==='regression'){a.writeBigInt64LE(1792580207n,82);a.writeBigUInt64LE(1792580207800000n,96);}
  if(mode==='downgrade')b.fill(0,96,112);
  assert.throws(()=>checkPerpsDovesLazerEffects(a,next,s),/UNVERIFIED_PERPS_CLOSE_ORACLE_EFFECTS/,mode);
 }
});
test('context-to-bank comparisons keep native microsecond observations and enforce reserved bytes rather than discarding the whole tail',()=>{
 const {a,b}=fixture();assert.equal(comparePerpsDovesLazerConfiguration(a,b).after.confidence,3n);
 for(const offset of [0,72,90,91,95,112,282]){const x=Buffer.from(b);x[offset]^=1;assert.throws(()=>comparePerpsDovesLazerConfiguration(a,x));}
 const padded=Buffer.from(a);padded.fill(0,96);assert.equal(comparePerpsDovesLazerConfiguration(padded,a).before.micros,null);
 const legacy=padded.subarray(0,96);assert.equal(comparePerpsDovesLazerConfiguration(legacy,legacy).after.micros,null);
 a[112]=9;b[112]=9;assert.equal(comparePerpsDovesLazerConfiguration(a,b).after.confidence,3n);
});
