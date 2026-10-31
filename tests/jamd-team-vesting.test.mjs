import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareJamdTeamVesting,checkJamdTeamVestingAccounts} from '../lib/jamd-team-vesting.js';
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {deriveProtectionAddresses} from '../lib/solana-devnet-token.js';
const payer='11111111111111111111111111111111',beneficiary='2RmDx5KLnEWG8wxdpdB6Z4ySDn9Z2Jir5aaCdg1ARCom',mint='Gdvhja25md5P4B9LpX5NSD1QmS32rTwTbLwqnkEdfTdB';
test('team vesting prepares full 15 million allocation for a distinct beneficiary without signing',async()=>{
 const derived=await deriveProtectionAddresses(mint,beneficiary);
 const args={chain:'solana:devnet',mint,policy:String(derived.policyAddress),source:payer,payer,beneficiary};
 const result=await prepareJamdTeamVesting(args);
 assert.equal(result.instruction.accounts[1].address,payer);
 assert.equal(result.instruction.accounts[2].address,beneficiary);
 assert.equal(result.vaultAddress,String(derived.creatorVaultAddress));
 const data=new DataView(result.instruction.data.buffer,result.instruction.data.byteOffset,result.instruction.data.byteLength);
 assert.equal(data.getBigUint64(8,true),15000000000000n);
 assert.equal(data.getBigUint64(16,true),15000000000000n);
 assert.equal(result.transactionAuthorized,false);
 await assert.rejects(prepareJamdTeamVesting({...args,chain:'solana:mainnet'}),/DEVNET_ONLY/);
 await assert.rejects(prepareJamdTeamVesting({...args,policy:payer}),/POLICY/);
});

test('read-only team preflight rejects incompatible supply, schedules, source funds and duplicate vaults',async()=>{
 const derived=await deriveProtectionAddresses(mint,beneficiary);
 const args={chain:'solana:devnet',mint,policy:String(derived.policyAddress),source:payer,payer,beneficiary};
 const tokenProgram='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
 function fixture(){
  const m=Buffer.alloc(82);m.writeBigUInt64LE(100000000000000n,36);m[44]=6;m[45]=1;
  const p=Buffer.alloc(198);createHash('sha256').update('account:LaunchPolicy').digest().copy(p,0,0,8);Buffer.from(bs58.decode(payer)).copy(p,8);Buffer.from(bs58.decode(mint)).copy(p,40);p.writeBigInt64LE(BigInt(731*86400),122);p.writeBigInt64LE(BigInt(1096*86400),130);p.writeUInt16LE(2,196);
  const s=Buffer.alloc(165);Buffer.from(bs58.decode(mint)).copy(s);Buffer.from(bs58.decode(payer)).copy(s,32);s.writeBigUInt64LE(15000000000000n,64);
  return {m,p,s};
 }
 async function run(change=()=>{}){
  const bytes=fixture();change(bytes);
  return checkJamdTeamVestingAccounts({...args,fetchImpl:async(url,request)=>{
   assert.equal(url,'https://api.devnet.solana.com');const body=JSON.parse(request.body);assert.equal(body.method,'getMultipleAccounts');
   return {ok:true,json:async()=>({result:{value:[{owner:tokenProgram,data:[bytes.m.toString('base64'),'base64']},{owner:'FzH2QN9NFFrpwsn8xqLT83BZ7ruqmMBiwY4CU6MkLVQ4',data:[bytes.p.toString('base64'),'base64']},{owner:tokenProgram,data:[bytes.s.toString('base64'),'base64']},bytes.existing||null,null]}})};
  }});
 }
 const result=await run();assert.equal(result.accountsChecked,true);assert.equal(result.transactionAuthorized,false);
 await assert.rejects(run(({m})=>{m[44]=9;}),/MINT/);
 await assert.rejects(run(({m})=>{m.writeUInt32LE(1,0);}),/MINT/);
 await assert.rejects(run(({p})=>{p.writeBigInt64LE(0n,122);}),/SCHEDULE/);
 await assert.rejects(run(({s})=>{s.writeBigUInt64LE(1n,64);}),/SOURCE/);
 await assert.rejects(run(bytes=>{bytes.existing={};}),/ALREADY_INITIALIZED/);
});
