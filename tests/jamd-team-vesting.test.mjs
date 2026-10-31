import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareJamdTeamVesting} from '../lib/jamd-team-vesting.js';
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
