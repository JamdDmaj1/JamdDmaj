import test from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {getBase64Encoder,getTransactionDecoder} from '@solana/kit';
import {createDevnetTransferSession,DEVNET_GENESIS,testLamports} from '../lib/experimental-devnet-transfer.js';
function fixture(){
 const key=nacl.sign.keyPair(),recipient=bs58.encode(nacl.sign.keyPair().publicKey),owner=bs58.encode(key.publicKey),calls=[];
 const state={chain:DEVNET_GENESIS,fee:5000,balance:1000000000,fail:false,locked:false,height:10,clock:1000};
 const rpc=async(method,params)=>{
  calls.push({method,params});
  if(method==='getGenesisHash')return state.chain;
  if(method==='getLatestBlockhash')return {value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:100}};
  if(method==='getFeeForMessage')return {value:state.fee};
  if(method==='getBalance')return {value:state.balance};
  if(method==='simulateTransaction')return {value:{err:state.fail?{bad:true}:null}};
  if(method==='getBlockHeight')return state.height;
  if(method==='sendTransaction'){
   if(state.timeout)throw new Error('timeout');
   const tx=getTransactionDecoder().decode(getBase64Encoder().encode(params[0]));return bs58.encode(tx.signatures[owner]);
  }
  if(method==='getSignatureStatuses')return {value:state.confirmed?[{err:null,confirmationStatus:'confirmed'}]:[null]};
  throw new Error('Unexpected method '+method);
 };
 const session=createDevnetTransferSession({owner,rpc,now:()=>state.clock,isUnlocked:()=>!state.locked,sign:bytes=>nacl.sign.detached(bytes,key.secretKey)});
 return {session,state,calls,recipient,cleanup:()=>key.secretKey.fill(0)};
}
test('exact SOL units reject floats, excess decimals and amounts beyond test cap',()=>{
 assert.equal(testLamports('0.000000001'),1n);assert.equal(testLamports('0.1'),100000000n);
 for(const amount of [0.1,'1e-3','0','-1','0.100000001','0.0000000001',' 0.1'])assert.throws(()=>testLamports(amount));
});
test('review never sends; explicit confirm signs the reviewed message and tracks confirmation',async()=>{
 const f=fixture();try{
 const review=await f.session.prepare({recipient:f.recipient,amountSOL:'0.001'});assert.equal(review.feeLamports,'5000');
 assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
 await assert.rejects(f.session.confirm({reviewId:review.id,confirmed:false}),/confirmation/);
 await f.session.confirm({reviewId:review.id,confirmed:true});assert.equal(f.session.state.phase,'submitted');
 assert.equal((await f.session.checkStatus()).phase,'submitted');f.state.confirmed=true;assert.equal((await f.session.checkStatus()).phase,'confirmed');
 const call=f.calls.find(c=>c.method==='sendTransaction');assert.equal(call.params[1].skipPreflight,false);assert.equal(call.params[1].maxRetries,0);
 await assert.rejects(f.session.confirm({reviewId:review.id,confirmed:true}),/confirmation/);
 }finally{f.cleanup()}
});
for(const failure of ['chain','funds','simulation','fee-null'])test(`preparation fails closed: ${failure}`,async()=>{
 const f=fixture();try{
 if(failure==='chain')f.state.chain='mainnet';if(failure==='funds')f.state.balance=0;if(failure==='simulation')f.state.fail=true;if(failure==='fee-null')f.state.fee=null;
 await assert.rejects(f.session.prepare({recipient:f.recipient,amountSOL:'0.001'}));assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
 }finally{f.cleanup()}
});
for(const failure of ['locked','expired','blockhash','fee','chain'])test(`confirmation rechecks ${failure}`,async()=>{
 const f=fixture();try{const review=await f.session.prepare({recipient:f.recipient,amountSOL:'0.001'});
 if(failure==='locked')f.state.locked=true;if(failure==='expired')f.state.clock=70000;if(failure==='blockhash')f.state.height=101;if(failure==='fee')f.state.fee=6000;if(failure==='chain')f.state.chain='mainnet';
 await assert.rejects(f.session.confirm({reviewId:review.id,confirmed:true}));assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
 }finally{f.cleanup()}
});
test('unknown broadcast result retains expected signature and prevents a second send',async()=>{
 const f=fixture();try{const review=await f.session.prepare({recipient:f.recipient,amountSOL:'0.001'});f.state.timeout=true;
 await assert.rejects(f.session.confirm({reviewId:review.id,confirmed:true}),/timeout/);assert.equal(f.session.state.phase,'uncertain');assert.ok(f.session.state.signature);
 await assert.rejects(f.session.prepare({recipient:f.recipient,amountSOL:'0.001'}),/pending/);
 f.state.confirmed=true;assert.equal((await f.session.checkStatus()).phase,'confirmed');assert.equal(f.calls.filter(c=>c.method==='sendTransaction').length,1);
 }finally{f.cleanup()}
});
