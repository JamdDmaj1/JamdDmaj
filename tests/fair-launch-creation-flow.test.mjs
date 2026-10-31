import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSigner,getTransactionDecoder,getTransactionEncoder,partiallySignTransactionWithSigners,getBase58Decoder} from '@solana/kit';
import {createFixedSupplyTokenOnDevnet} from '../lib/solana-devnet-token.js';
import {readFairLaunchTransaction,fairLaunchRecovery} from '../lib/fair-launch-transaction.js';

// All RPC calls are intercepted. Keys and balances are disposable fixtures;
// this test cannot contact a network or use a real wallet.
test('protected creation: real SDK compilation/signatures, simulated review, durable intent and confirmation',async t=>{
 for(const scenario of ['confirmed','cancel-review','changed-message','storage-failed','uncertain-send'])await t.test(scenario,async()=>{
  const originalFetch=globalThis.fetch,owner=await generateKeyPairSigner(),calls=[],memory=new Map();let signs=0;
  const recovery=fairLaunchRecovery({getItem:k=>memory.get(k)||null,setItem:(k,v)=>{if(scenario==='storage-failed')throw Error('STORAGE');memory.set(k,v);},removeItem:k=>memory.delete(k)});
  const wallet={features:{'solana:signTransaction':{supportedTransactionVersions:[0],async signTransaction({transaction,chain}){
   signs++;assert.equal(chain,'solana:devnet');let tx=getTransactionDecoder().decode(transaction);
   if(scenario==='changed-message'){const bytes=new Uint8Array(tx.messageBytes);bytes[bytes.length-2]^=1;tx={...tx,messageBytes:bytes};}
   const signed=await partiallySignTransactionWithSigners([owner],tx);return [{signedTransaction:getTransactionEncoder().encode(signed)}];
  }}}};
  globalThis.fetch=async(url,options)=>{
   assert.equal(String(url),'https://api.devnet.solana.com');const q=JSON.parse(options.body);calls.push(q.method);let result;
   if(q.method==='getAccountInfo')result={context:{slot:1},value:{executable:true}};
   else if(q.method==='getMinimumBalanceForRentExemption')result=2039280;
   else if(q.method==='getLatestBlockhash')result={context:{slot:1},value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:1000}};
   else if(q.method==='simulateTransaction'){assert.equal(q.params[1].sigVerify,false);result={context:{slot:1},value:{err:null,logs:[],fee:10000,preBalances:[1000000000],postBalances:[890000000]}};}
   else if(q.method==='sendTransaction'){
    assert.ok(recovery.read(),'recovery must exist before transmission');
    assert.equal(q.params[1].skipPreflight,false);
    if(scenario==='uncertain-send')throw Error('NETWORK_UNCERTAIN');
    const tx=getTransactionDecoder().decode(Buffer.from(q.params[0],'base64'));result=getBase58Decoder().decode(tx.signatures[owner.address]);assert.equal(result,recovery.read().signature);
   }else if(q.method==='getSignatureStatuses')result={context:{slot:1},value:[{err:null,confirmationStatus:'confirmed'}]};
   else throw Error('Forbidden RPC '+q.method);
   return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}),{headers:{'Content-Type':'application/json'}});
  };
  try{
   const run=()=>createFixedSupplyTokenOnDevnet({config:{projectName:'Fixture',symbol:'TEST',network:'solana-token-2022',totalSupply:1000000,decimals:6,revokeMintAuthority:true,disableFreezeAuthority:true},wallet,account:{address:owner.address,chains:['solana:devnet']},
    onReview:async review=>{assert.equal(signs,0);assert.equal(review.platformFeeLamports,'100000000');assert.equal(review.estimatedTotalLamports,'110000000');return scenario!=='cancel-review';},onSigned:r=>recovery.save(r)});
   if(scenario==='confirmed'){const result=await run();assert.equal((await readFairLaunchTransaction(result.signature)).state,'confirmed');assert.equal(signs,1);assert.equal(calls.filter(m=>m==='sendTransaction').length,1);}
   else {await assert.rejects(run(),scenario==='cancel-review'?/CANCELED/:scenario==='changed-message'?/TRANSACTION_CHANGED/:scenario==='storage-failed'?/STORAGE/:/NETWORK_UNCERTAIN/);
    if(scenario==='uncertain-send')assert.ok(recovery.read());else assert.equal(calls.includes('sendTransaction'),false);
    if(scenario==='cancel-review')assert.equal(signs,0);
   }
  }finally{globalThis.fetch=originalFetch;}
 });
});
