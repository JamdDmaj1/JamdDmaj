import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {checkServerPerpsTokenPolicy} from '../lib/perps-server-token-policy.js';
import {PERPS_CUSTODIES} from '../lib/perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',COMPUTE='ComputeBudget111111111111111111111111111111',SYSTEM='11111111111111111111111111111111';
const key=n=>bs58.encode(Buffer.alloc(32,n));
async function fixture(){
 const intent={asset:'SOL',side:'LONG',walletAddress:key(1)};
 const associated=async mint=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(intent.walletAddress),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];
 const source=await associated(PERPS_CUSTODIES.USDC.mint),collateral=await associated(PERPS_CUSTODIES.SOL.mint);
 const keys=[key(1),key(2),key(3),source,collateral,key(4),PERPS_CUSTODIES.USDC.mint,PERPS_CUSTODIES.SOL.mint,SYSTEM,TOKEN,ATA,COMPUTE];
 const ix=(program,accounts,b)=>({program:keys.indexOf(program),accounts,dataBase64:Buffer.from(b).toString('base64')});
 const setup=ix(ATA,[0,3,0,6,8,9],[1]),cleanup=ix(TOKEN,[4,0,0],[9]);
 const limit=Buffer.alloc(5);limit[0]=2;limit.writeUInt32LE(100000,1);
 const price=Buffer.alloc(9);price[0]=3;price.writeBigUInt64LE(1000n,1);
 const envelope={stage:'STRUCTURE_ONLY',staticKeys:keys,accountCount:keys.length,readonlySigned:1,readonlyUnsigned:6,lookups:[],instructions:[ix(COMPUTE,[],limit),ix(COMPUTE,[],price),setup,cleanup]};
 const inspection={envelope,resolvedKeys:keys};return {intent,inspection,setup,cleanup,source,collateral};
}
test('only bound idempotent ATA creation and funding-account cleanup are admitted',async()=>{
 const f=await fixture(),result=await checkServerPerpsTokenPolicy(f.inspection,f.intent);
 assert.equal(result.source,f.source);assert.equal(result.collateral,f.collateral);assert.deepEqual(result.createdAccounts,[f.source]);assert.equal(result.cleanupCount,1);assert.equal(result.readyForSigning,false);assert.ok(Object.isFrozen(result.createdAccounts));
 f.cleanup.accounts=[4];f.cleanup.dataBase64=Buffer.from([17]).toString('base64');await checkServerPerpsTokenPolicy(f.inspection,f.intent);
 await assert.rejects(checkServerPerpsTokenPolicy(f.inspection,{...f.intent,side:'SHORT'}));
});
test('direct transfers, approvals, authority mutations and unrelated cleanup cannot pass token setup',async()=>{
 for(const opcode of [3,4,5,6,7,8,10,12,16,18]){
  const f=await fixture();f.cleanup.dataBase64=Buffer.from([opcode]).toString('base64');await assert.rejects(checkServerPerpsTokenPolicy(f.inspection,f.intent));
 }
 for(const mutate of [f=>f.cleanup.accounts=[5,0,0],f=>f.cleanup.accounts=[4,1,0],f=>f.cleanup.accounts=[4,0,1],f=>f.cleanup.accounts=[4,0],f=>f.cleanup.accounts=[99,0,0],f=>f.cleanup.dataBase64=Buffer.from([9,0]).toString('base64'),f=>f.inspection.envelope.staticKeys[9]='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']){
  const f=await fixture();mutate(f);await assert.rejects(checkServerPerpsTokenPolicy(f.inspection,f.intent));
 }
});
test('ATA setup rejects incorrect owner, mint, destination, programs, duplicate creation or writable mint',async()=>{
 for(const mutate of [f=>f.setup.accounts[0]=1,f=>f.setup.accounts[1]=5,f=>f.setup.accounts[2]=1,f=>f.setup.accounts[3]=7,f=>f.setup.accounts[4]=9,f=>f.setup.accounts[5]=8,f=>f.setup.dataBase64=Buffer.from([0]).toString('base64'),f=>f.inspection.envelope.instructions.push({...f.setup}),f=>f.inspection.envelope.readonlyUnsigned=5]){
  const f=await fixture();mutate(f);await assert.rejects(checkServerPerpsTokenPolicy(f.inspection,f.intent));
 }
});
