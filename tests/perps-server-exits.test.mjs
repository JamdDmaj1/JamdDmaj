import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {decodeServerPerpsExit,checkServerPerpsSimulatedExits} from '../lib/perps-server-exits.js';

async function fixture(asset='SOL',side='LONG',profit=false){
 const intent={asset,side,walletAddress:bs58.encode(Buffer.alloc(32,1)),stopLoss:side==='LONG'?'95':'105',takeProfit:side==='LONG'?'110':'90'};
 const ids=await deriveServerPerpsIdentities(intent),instruction=Buffer.alloc(50),data=Buffer.alloc(230);
 Buffer.from('7562427f1e3249b9','hex').copy(instruction);instruction.writeBigUInt64LE(30000000n,16);
 const price=BigInt(profit?intent.takeProfit:intent.stopLoss)*1000000n;
 instruction.writeBigUInt64LE(price,24);instruction[32]=Number(profit===(side==='LONG'));instruction.writeBigUInt64LE(18446744073709551615n,34);instruction.writeBigUInt64LE(1792324800n,42);
 const [address,bump]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(ids.position),instruction.subarray(34,42),new Uint8Array([2])]});
 Buffer.from('0c26fac72e9a20d8','hex').copy(data);
 for(const [offset,key]of [[8,intent.walletAddress],[40,PERPS_POOL],[72,PERPS_CUSTODIES[asset].address],[104,ids.position],[136,PERPS_CUSTODIES.USDC.mint]])Buffer.from(bs58.decode(key)).copy(data,offset);
 data.writeBigUInt64LE(1792324800n,168);data.writeBigUInt64LE(1792324801n,176);data.writeBigUInt64LE(30000000n,184);
 data[200]=2;data[201]=1;data[202]=side==='LONG'?1:2;data[206]=1;data.writeBigUInt64LE(price,207);data[215]=1;data[216]=instruction[32];data[217]=1;data.writeBigUInt64LE(18446744073709551615n,220);data[228]=bump;
 const account=()=>({owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[data.toString('base64'),'base64']});
 return {intent,instruction,data,address,account,profit};
}
test('pending SL and TP bind to derived request, exact size and direction for every supported market',async()=>{
 for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT'])for(const profit of [false,true]){
  const f=await fixture(asset,side,profit),result=await decodeServerPerpsExit(f.address,f.account(),f.intent,f.instruction.toString('base64'));
  assert.equal(result.kind,profit?'TP':'SL');assert.equal(result.sizeUsdUnits,'30000000');assert.equal(result.counter,'18446744073709551615');assert.equal(result.readyForSigning,false);assert.ok(Object.isFrozen(result));
 }
});
test('mismatched exit identities, amounts, options, timestamps and executed state fail closed',async()=>{
 for(const offset of [0,8,40,72,104,136,184,192,200,201,202,203,204,205,206,207,215,216,217,218,219,220,228,229]){
  const f=await fixture();f.data[offset]^=1;
  await assert.rejects(decodeServerPerpsExit(f.address,f.account(),f.intent,f.instruction.toString('base64')),/PERPS_SIMULATED_EXIT_MISMATCH/);
 }
 for(const mutate of [f=>f.data.writeBigUInt64LE(0n,168),f=>f.data.writeBigUInt64LE(1n,176),f=>f.data.writeBigUInt64LE(1n<<63n,168)]){
  const f=await fixture();mutate(f);await assert.rejects(decodeServerPerpsExit(f.address,f.account(),f.intent,f.instruction.toString('base64')));
 }
 const f=await fixture();
 await assert.rejects(decodeServerPerpsExit(f.address,{...f.account(),data:[Buffer.concat([f.data,Buffer.from([1])]).toString('base64'),'base64']},f.intent,f.instruction.toString('base64')));
 await assert.rejects(decodeServerPerpsExit(f.intent.walletAddress,f.account(),f.intent,f.instruction.toString('base64')));
 await assert.rejects(decodeServerPerpsExit(f.address,{...f.account(),executable:true},f.intent,f.instruction.toString('base64')));
 await assert.rejects(decodeServerPerpsExit(f.address,f.account(),{...f.intent,stopLoss:null},f.instruction.toString('base64')));
});
test('simulation requires every configured exit and cannot overwrite an existing request',async()=>{
 const f=await fixture(),intent={...f.intent,takeProfit:null};
 const accounts=Array(20).fill(0);accounts[7]=1;
 const prepared={intent,inspection:{resolvedKeys:[PERPS_PROGRAM,f.address],envelope:{staticKeys:[PERPS_PROGRAM],instructions:[{program:0,accounts,dataBase64:f.instruction.toString('base64')}]}}};
 const before={[f.address]:null},after={[f.address]:f.account()};
 assert.equal((await checkServerPerpsSimulatedExits(prepared,before,after)).length,1);
 for(const previous of [f.account(),{owner:'11111111111111111111111111111111',executable:false,lamports:1,data:['','base64']}])await assert.rejects(checkServerPerpsSimulatedExits(prepared,{[f.address]:previous},after));
 await assert.rejects(checkServerPerpsSimulatedExits(prepared,before,{[f.address]:null}));
 await assert.rejects(checkServerPerpsSimulatedExits({...prepared,intent:f.intent},before,after));
 await assert.rejects(checkServerPerpsSimulatedExits({...prepared,inspection:{...prepared.inspection,envelope:{...prepared.inspection.envelope,instructions:[]}}},before,after));
});
