import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {PERPS_PROGRAM,PERPS_CUSTODIES} from '../lib/perps-server-custody.js';
import {checkPerpsClosePoolConfiguration} from '../lib/perps-server-close-pool.js';
function fixture(){
 const name=Buffer.from('Jupiter'),custodies=Object.values(PERPS_CUSTODIES).map(c=>c.address),offset=16+name.length+32*custodies.length,b=Buffer.alloc(2000);
 createHash('sha256').update('account:Pool').digest().copy(b,0,0,8);b.writeUInt32LE(name.length,8);name.copy(b,12);b.writeUInt32LE(custodies.length,12+name.length);
 custodies.forEach((key,i)=>Buffer.from(bs58.decode(key)).copy(b,16+name.length+i*32));
 const account=data=>({owner:PERPS_PROGRAM,executable:false,lamports:10000000,data:[data.toString('base64'),'base64']});
 return {b,offset,custodies,account};
}
test('native Pool policy permits only bounded-layout AUM and monotonic fee/observation effects without mutating supplied evidence',()=>{
 const f=fixture(),b=Buffer.from(f.b),p=f.offset;b.writeBigUInt64LE(123n,p);b.writeBigUInt64LE(7n,p+144);b.writeBigInt64LE(100n,p+203);b.writeBigUInt64LE(200n,p+228);
 const before=f.account(f.b),after=f.account(b),old=JSON.stringify([before,after]);
 assert.equal(checkPerpsClosePoolConfiguration(before,after,f.custodies),undefined);assert.equal(JSON.stringify([before,after]),old);
});
test('Pool fees, limits, authorities, custodies, APR configuration and unknown tails cannot change under close authority',()=>{
 const f=fixture(),p=f.offset;
 for(const at of [0,12,16+7,p+16,p+56,p+120,p+128,p+136,p+152,p+160,p+162,p+170,p+211,p+219,p+220,p+236,1999]){
  const b=Buffer.from(f.b);b[at]^=1;
  assert.throws(()=>checkPerpsClosePoolConfiguration(f.account(f.b),f.account(b),f.custodies),/POOL_CONFIGURATION_MISMATCH/,String(at));
 }
});
test('Pool layout rejects missing custody, duplicates, invalid dynamic lengths, truncated bytes and negative/regressed observations',()=>{
 const f=fixture(),p=f.offset;
 for(const mode of ['name-length','name-utf8','count','duplicate','truncate','negative-time','fee-regression','time-regression','slot-regression']){
  const before=Buffer.from(f.b);let after=Buffer.from(f.b);
  if(mode==='name-length')after.writeUInt32LE(65,8);
  if(mode==='name-utf8')after[12]=255;
  if(mode==='count')after.writeUInt32LE(17,19);
  if(mode==='duplicate')after.copy(after,55,23,55);
  if(mode==='truncate')after=after.subarray(0,p+235);
  if(mode==='negative-time')after.writeBigInt64LE(-1n,p+203);
  if(mode==='fee-regression')before.writeBigUInt64LE(1n,p+144);
  if(mode==='time-regression')before.writeBigInt64LE(1n,p+203);
  if(mode==='slot-regression')before.writeBigUInt64LE(1n,p+228);
  assert.throws(()=>checkPerpsClosePoolConfiguration(f.account(before),f.account(after),f.custodies),/POOL_CONFIGURATION_MISMATCH/,mode);
 }
 assert.throws(()=>checkPerpsClosePoolConfiguration(f.account(f.b),f.account(f.b),['11111111111111111111111111111111']));
});
