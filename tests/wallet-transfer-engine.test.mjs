import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {getCompiledTransactionMessageDecoder} from '@solana/kit';
import {createWalletTransferEngine,consumeWalletTransferGrant,transferAmountUnits} from '../lib/wallet-transfer-engine.js';
import {transferFixture,recipient,USDC,TOKEN,SYSTEM} from './fixtures/wallet-transfer.mjs';
const secret=new Uint8Array(32).fill(8),wallet=bs58.encode(ed25519.getPublicKey(secret));
for(const [mint,missing]of [['SOL',false],[USDC,false],[USDC,true]])test('review, exact transfer signature, one mocked broadcast '+mint+' missing '+missing,async()=>{
 const f=await transferFixture(wallet,{mint,missing});let begun=0;const journal={read:async()=>begun?{}:null,begin:async r=>{begun++;assert.equal(r.address,wallet);}};
 const engine=createWalletTransferEngine({rpc:f.rpc,journal}),review=await engine.prepare({payer:wallet,recipient,mint,amount:mint==='SOL'?'0.08':'2.5'});
 assert.equal(f.sends(),0);assert.equal(review.rent,missing?'2039280':'0');assert.equal(review.fee,'5000');
 const p=await consumeWalletTransferGrant(engine.authorize(review,true),wallet),decoded=getCompiledTransactionMessageDecoder().decode(p.message),last=decoded.instructions.at(-1);
 assert.equal(decoded.staticAccounts[last.programAddressIndex],mint==='SOL'?SYSTEM:TOKEN);
 assert.equal(decoded.instructions.length,missing?2:1);if(missing){assert.equal(Buffer.from(decoded.instructions[0].data).toString('hex'),'01');}
 const signature=ed25519.sign(p.message,secret),wire=Buffer.concat([Buffer.from([1]),signature,p.message]).toString('base64');
 await engine.submit(review,wire);assert.equal(begun,1);assert.equal(f.sends(),1);assert.equal(f.simulations.at(-1)[1].sigVerify,true);
 await assert.rejects(engine.submit(review,wire));assert.equal(f.sends(),1);
});
test('amount precision, recipient, unsupported token, funds, expiry and simulated effects fail closed',async()=>{
 for(const input of ['0','-1','1e2','0.0000000001',' 1','1.1.1'])assert.throws(()=>transferAmountUnits(input,9));
 for(const mode of ['self','token-address','funds','simulation','effects','expired']){
  let clock=Date.now();const f=await transferFixture(wallet);if(mode==='funds')f.state.get(wallet).lamports=1;if(mode==='simulation')f.failSimulation();if(mode==='effects')f.corruptSimulation();
  const e=createWalletTransferEngine({rpc:f.rpc,journal:{read:async()=>null},now:()=>clock});
  if(mode==='expired'){const r=await e.prepare({payer:wallet,recipient,mint:'SOL',amount:'0.08'});clock+=60001;assert.throws(()=>e.authorize(r,true));}
  else await assert.rejects(e.prepare({payer:wallet,recipient:mode==='self'?wallet:mode==='token-address'?USDC:recipient,mint:'SOL',amount:'0.08'}));
  assert.equal(f.sends(),0);
 }
 const f=await transferFixture(wallet,{mint:USDC});f.state.get(USDC).owner='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
 await assert.rejects(createWalletTransferEngine({rpc:f.rpc,journal:{read:async()=>null}}).prepare({payer:wallet,recipient,mint:USDC,amount:'1'}),/UNSUPPORTED_TOKEN/);
});
