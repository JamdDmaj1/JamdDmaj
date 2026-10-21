import test from 'node:test';
import assert from 'node:assert/strict';
import {PERPS_PYTH_LAZER,decodePerpsPythStorage,requirePerpsPythTrustedSigner,requireUnchangedPerpsPythStorage} from '../lib/perps-pyth-storage.js';
import {pythStorageFixture} from './helpers/perps-pyth-storage-fixture.mjs';
const key='11'.repeat(32),other='22'.repeat(32),now=1802865600;
function change(account,fn){const b=Buffer.from(account.data[0],'base64');fn(b);account.data[0]=b.toString('base64');}
test('native Pyth storage binds fixed account/program/treasury, initialized signer membership and strict expiry',()=>{
 const a=pythStorageFixture([{publicKeyHex:key,expiresAtSeconds:now+1},{publicKeyHex:other,expiresAtSeconds:now-1}]),s=decodePerpsPythStorage(PERPS_PYTH_LAZER.storage,a);
 assert.equal(s.updateFeeLamports,'1');assert.equal(s.readyForSigning,false);assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.signers));
 assert.equal(requirePerpsPythTrustedSigner(s,key,now).publicKeyHex,key);
 for(const time of [now+1,now+2,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>requirePerpsPythTrustedSigner(s,key,time));
 assert.throws(()=>requirePerpsPythTrustedSigner(s,other,now));
 assert.throws(()=>requirePerpsPythTrustedSigner({...s},key,now));
 assert.throws(()=>requirePerpsPythTrustedSigner(s,'33'.repeat(32),now));
 const unchanged=requireUnchangedPerpsPythStorage(s,structuredClone(a),structuredClone(a));requirePerpsPythTrustedSigner(unchanged,key,now);
});
test('foreign, truncated, noncanonical, substituted or malformed Pyth storage cannot establish trust',()=>{
 for(const mode of ['owner','executable','treasury','disc','length','base64','count','ecdsaCount','duplicate','negative','zeroKey']){
  const a=pythStorageFixture([{publicKeyHex:key,expiresAtSeconds:now+1}]);
  if(mode==='owner')a.owner='11111111111111111111111111111111';
  if(mode==='executable')a.executable=true;
  if(mode==='treasury')change(a,b=>{b[40]^=1;});
  if(mode==='disc')change(a,b=>{b[0]^=1;});
  if(mode==='length')a.data[0]=Buffer.alloc(380).toString('base64');
  if(mode==='base64')a.data[0]+='\n';
  if(mode==='count')change(a,b=>{b[80]=3;});
  if(mode==='ecdsaCount')change(a,b=>{b[281]=3;});
  if(mode==='duplicate')change(a,b=>{b[80]=2;b.copy(b,121,81,121);});
  if(mode==='negative')change(a,b=>b.writeBigInt64LE(-1n,113));
  if(mode==='zeroKey')change(a,b=>b.fill(0,81,113));
  assert.throws(()=>decodePerpsPythStorage(PERPS_PYTH_LAZER.storage,a),mode);
 }
 assert.throws(()=>decodePerpsPythStorage(PERPS_PYTH_LAZER.treasury,pythStorageFixture()));
});
test('unused signer capacity cannot authorize a key, and same-bank storage must exactly match captured configuration',()=>{
 const a=pythStorageFixture();change(a,b=>{Buffer.from(key,'hex').copy(b,81);b.writeBigInt64LE(BigInt(now+100),113);});
 const s=decodePerpsPythStorage(PERPS_PYTH_LAZER.storage,a);assert.throws(()=>requirePerpsPythTrustedSigner(s,key,now));
 for(const mode of ['before','after','lamports','absent']){
  const before=structuredClone(a),after=structuredClone(a);
  if(mode==='before')change(before,b=>{b[72]^=1;});
  if(mode==='after')change(after,b=>{b[72]^=1;});
  if(mode==='lamports')after.lamports++;
  assert.throws(()=>requireUnchangedPerpsPythStorage(s,mode==='absent'?null:before,after),mode);
 }
});
