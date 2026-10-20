import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {decodeServerPerpsPosition,checkServerPerpsPositionIncrease} from '../lib/perps-server-position.js';
const intent={walletAddress:'4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi',asset:'SOL',side:'LONG',marginUsd:'10',leverage:'3',maxSlippageBps:50};
async function fixture(order=intent,{size=30000000n,collateral=9990000n,update=101n}={}){
 const ids=await deriveServerPerpsIdentities(order),data=Buffer.alloc(210);
 Buffer.from('aabc8fe47a40f7d0','hex').copy(data);
 for(const [offset,address]of [[8,order.walletAddress],[40,PERPS_POOL],[72,PERPS_CUSTODIES[order.asset].address],[104,PERPS_CUSTODIES[order.side==='LONG'?order.asset:'USDC'].address]])Buffer.from(bs58.decode(address)).copy(data,offset);
 data.writeBigUInt64LE(100n,136);data.writeBigUInt64LE(update,144);data[152]=order.side==='LONG'?1:2;
 data.writeBigUInt64LE(100000000n,153);data.writeBigUInt64LE(size,161);data.writeBigUInt64LE(collateral,169);data[209]=ids.positionBump;
 const account={owner:PERPS_PROGRAM,executable:false,data:[data.toString('base64'),'base64']};
 return {address:ids.position,data,account};
}
test('position snapshots bind all six market/side identities and exact native-layout offsets',async()=>{
 for(const asset of ['SOL','ETH','BTC'])for(const side of ['LONG','SHORT']){
  const order={...intent,asset,side},f=await fixture(order),position=await decodeServerPerpsPosition(f.address,f.account,order);
  assert.equal(position.sizeUsdUnits,'30000000');assert.equal(position.collateralUsdUnits,'9990000');assert.equal(Object.isFrozen(position),true);
  assert.equal(checkServerPerpsPositionIncrease(null,position,order,'30000000').readyForSigning,false);
 }
});
test('position decoder rejects owner, market, side, bump, extension and time substitutions',async()=>{
 for(const mutate of [f=>f.account.owner=intent.walletAddress,f=>f.account.executable=true,
  f=>f.data[0]^=1,f=>f.data[8]^=1,f=>f.data[40]^=1,f=>f.data[72]^=1,f=>f.data[104]^=1,
  f=>f.data[152]=2,f=>f.data[209]^=1,f=>f.data.writeBigUInt64LE(99n,144),
  f=>f.data.writeBigUInt64LE(0n,153),f=>f.data.writeBigUInt64LE(0n,169),
  f=>{f.data=Buffer.concat([f.data,Buffer.from([1])]);}
 ]){
  const f=await fixture();mutate(f);f.account.data[0]=f.data.toString('base64');
  await assert.rejects(decodeServerPerpsPosition(f.address,f.account,intent));
 }
});
test('position native accounting offsets preserve signed realized PNL, full u128 interest and locked collateral without numeric rounding',async()=>{
 const f=await fixture();f.data.writeBigInt64LE(-1234567n,177);f.data.writeBigUInt64LE(2n,185);f.data.writeBigUInt64LE(1n,193);f.data.writeBigUInt64LE(300000000n,201);f.account.data[0]=f.data.toString('base64');
 const p=await decodeServerPerpsPosition(f.address,f.account,intent);
 assert.equal(p.realisedPnlUsdUnits,'-1234567');assert.equal(p.cumulativeInterestSnapshotUnits,'18446744073709551618');assert.equal(p.lockedTokenUnits,'300000000');
});
test('existing exposure is compared by deltas; forged snapshots and replayed smaller/larger size fail',async()=>{
 const old=await fixture(intent,{size:45000000n,collateral:15000000n}),next=await fixture(intent,{size:75000000n,collateral:24990000n});
 const before=await decodeServerPerpsPosition(old.address,old.account,intent),after=await decodeServerPerpsPosition(next.address,next.account,intent);
 assert.equal(checkServerPerpsPositionIncrease(before,after,intent,'30000000').collateralDeltaUsdUnits,'9990000');
 assert.throws(()=>checkServerPerpsPositionIncrease(before,{...after},intent,'30000000'));
 assert.throws(()=>checkServerPerpsPositionIncrease(before,after,intent,'29999999'));
 assert.throws(()=>checkServerPerpsPositionIncrease(before,after,{...intent,walletAddress:PERPS_POOL},'30000000'));
});
test('effective leverage must fit both bounds after actual collateral credit, not just the gross margin',async()=>{
 for(const [size,collateral]of [[30000001n,10000000n],[30000000n,10000001n],[30000000n,0n],[30000000n,9900000n],[29000000n,10000000n]]){
  const f=await fixture(intent,{size,collateral});
  if(collateral===0n){await assert.rejects(decodeServerPerpsPosition(f.address,f.account,intent));continue;}
  const position=await decodeServerPerpsPosition(f.address,f.account,intent);
  assert.throws(()=>checkServerPerpsPositionIncrease(null,position,intent,size.toString()));
 }
});
