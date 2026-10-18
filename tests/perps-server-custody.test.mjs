import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {PERPS_CUSTODIES,PERPS_PROGRAM,PERPS_POOL,decodeServerPerpsCustody,deriveServerPerpsIdentities,checkServerPerpsCustodyBindings,readAndCheckServerPerpsCustodies} from '../lib/perps-server-custody.js';
const owner='4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi';
function custodyFixture(asset){
 const identity=PERPS_CUSTODIES[asset],index=['SOL','ETH','BTC','USDC'].indexOf(asset),data=Buffer.alloc(416);
 Buffer.from('01b830515d833f91','hex').copy(data,0);Buffer.from(bs58.decode(PERPS_POOL)).copy(data,8);Buffer.from(bs58.decode(identity.mint)).copy(data,40);
 Buffer.alloc(32,30+index).copy(data,72);data[104]=identity.decimals;data[105]=Number(identity.stable);Buffer.alloc(32,40+index).copy(data,106);data[138]=2;
 data.writeBigUInt64LE(500000n,175);data[199]=1;data[202]=1;data[203]=1;Buffer.alloc(32,50+index).copy(data,384);
 const account={owner:PERPS_PROGRAM,executable:false,data:[data.toString('base64'),'base64']};
 return {identity,data,account,decoded:decodeServerPerpsCustody(asset,identity.address,account)};
}
async function fixture(side='LONG',asset='SOL'){
 const intent={walletAddress:owner,asset,side,leverage:'3'},market=custodyFixture(asset),usdc=custodyFixture('USDC'),collateral=side==='LONG'?market:usdc;
 const ids=await deriveServerPerpsIdentities(intent);
 const accounts=[bs58.encode(Buffer.alloc(32,2)),bs58.encode(Buffer.alloc(32,3)),owner,bs58.encode(Buffer.alloc(32,4)),ids.perpetuals,PERPS_POOL,ids.position,
  market.identity.address,market.decoded.dovesAgOracle,market.decoded.oracle,collateral.identity.address,collateral.decoded.dovesAgOracle,collateral.decoded.oracle,collateral.decoded.tokenAccount,
  bs58.encode(Buffer.alloc(32,5)),bs58.encode(Buffer.alloc(32,6)),'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','11111111111111111111111111111111',ids.eventAuthority,PERPS_PROGRAM];
 const keys=[owner,...new Set(accounts.filter(k=>k!==owner))],indices=accounts.map(a=>keys.indexOf(a)),program=keys.indexOf(PERPS_PROGRAM);
 const inspection={stage:'INSPECTED_NOT_AUTHORIZED',observedSlot:50,resolvedKeys:keys,envelope:{staticKeys:keys,instructions:[{program,accounts:indices,dataBase64:Buffer.from('a47e44b6dfa640b7','hex').toString('base64')}]}};
 return {intent,market,usdc,collateral,inspection,ids,accounts};
}
test('server PDA derivation matches six existing native cross-platform vectors',async()=>{
 for(const [asset,side,expected]of [
  ['SOL','LONG','7PJVXao3xWQU9BN27DNUJiEAz3qiEKTbvLJViAb8GZSM'],['SOL','SHORT','5TqFAc2X2XnBqPRggRjUbR1C5AH4J7SToxSZT6sS47cA'],
  ['ETH','LONG','447ZBKurikJmYFJbhG9fpo7y8LBVp46gcF28KjgaiZQk'],['ETH','SHORT','2jiWe5FFySkTiTpKiddEe1fYaAz5zpDMpdRKEeboK6A7'],
  ['BTC','LONG','2cVTZTmgEcAdAEXxgktbY7MEr1kW4oi2mDKgQ1iYpxHq'],['BTC','SHORT','7FFwKA3iqPjkihRHybZSB3WEBMRRp8PsARHgHVs7F9CQ']
 ])assert.equal((await deriveServerPerpsIdentities({walletAddress:owner,asset,side})).position,expected);
});
test('custody decoder pins program, market, mint, pool, flags, oracle layout and bounded encoding',()=>{
 for(const asset of ['SOL','ETH','BTC','USDC']){
  const f=custodyFixture(asset);assert.equal(f.decoded.asset,asset);assert.equal(f.decoded.maxLeverageBps,'500000');assert.equal(Object.isFrozen(f.decoded),true);
 }
 for(const mutate of [f=>f.account.owner=owner,f=>f.account.executable=true,f=>f.data[0]^=1,f=>f.data[8]^=1,f=>f.data[40]^=1,f=>f.data[104]++,f=>f.data[105]^=1,f=>f.data[138]=1,f=>f.data[202]=2,f=>f.data.writeBigUInt64LE(0n,175),f=>f.data.fill(0,384,416)]){
  const f=custodyFixture('SOL');mutate(f);f.account.data[0]=f.data.toString('base64');assert.throws(()=>decodeServerPerpsCustody('SOL',f.identity.address,f.account));
 }
 const f=custodyFixture('SOL');f.account.data[0]+='\n';assert.throws(()=>decodeServerPerpsCustody('SOL',f.identity.address,f.account));
});
test('verified custody binding distinguishes long asset collateral from short USDC and rejects forged decoded objects',async()=>{
 for(const side of ['LONG','SHORT']){
  const f=await fixture(side);const checked=await checkServerPerpsCustodyBindings(f.inspection,f.intent,f.market.decoded,f.collateral.decoded);
  assert.equal(checked.position,f.ids.position);assert.equal(checked.readyForSigning,false);
  await assert.rejects(checkServerPerpsCustodyBindings(f.inspection,f.intent,{...f.market.decoded},f.collateral.decoded));
  await assert.rejects(checkServerPerpsCustodyBindings(f.inspection,{...f.intent,leverage:'50.1'},f.market.decoded,f.collateral.decoded));
 }
});
test('position, custody, pool, oracle, vault and event-authority substitutions fail',async()=>{
 for(const role of [4,5,6,7,8,9,10,11,12,13,16,17,18,19]){
  const f=await fixture();const instruction=f.inspection.envelope.instructions[0];instruction.accounts[role]=0;
  await assert.rejects(checkServerPerpsCustodyBindings(f.inspection,f.intent,f.market.decoded,f.collateral.decoded));
 }
});
test('public custody fetch uses one fresh bank snapshot and never reaches a signer or send endpoint',async()=>{
 const f=await fixture('SHORT'),calls=[];
 const request=async(method,params)=>{calls.push(method);
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  assert.equal(method,'getMultipleAccounts');assert.deepEqual(params[0],[f.market.identity.address,f.usdc.identity.address]);assert.equal(params[1].minContextSlot,50);
  return {context:{slot:51},value:[f.market.account,f.usdc.account]};
 };
 const result=await readAndCheckServerPerpsCustodies(f.inspection,f.intent,{request});assert.equal(result.observedSlot,51);assert.equal(result.readyForSigning,false);
 assert.deepEqual(calls,['getGenesisHash','getMultipleAccounts','getGenesisHash']);
 await assert.rejects(readAndCheckServerPerpsCustodies(f.inspection,f.intent,{request:async(m,p)=>m==='getMultipleAccounts'?{context:{slot:49},value:[f.market.account,f.usdc.account]}:request(m,p)}));
});
