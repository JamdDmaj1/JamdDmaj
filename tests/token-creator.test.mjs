import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSigner,getTransactionDecoder,getTransactionEncoder,partiallySignTransactionWithSigners,getBase58Decoder} from '@solana/kit';
import {prepareTokenCreation,readTokenCreation,tokenCreatorJournal,tokenCreatorIdentity} from '../lib/token-creator.js';
test('identity uses exact integer base units',()=>{
 assert.equal(tokenCreatorIdentity({name:'JamdDmaj',symbol:'JAMD',supply:'100000000',decimals:6}).amount,100000000000000n);
 for(const supply of ['1e8','-1','0','18446744073709551615'])assert.throws(()=>tokenCreatorIdentity({name:'Test',symbol:'T',supply,decimals:6}));
});

test('recovery clears only rooted failures or independently verified expiry',async t=>{
 for(const scenario of ['failed','expired','status-reappears','mint-exists','rpc-unavailable'])await t.test(scenario,async()=>{
  const previous=globalThis.fetch,memory=new Map(),owner=await generateKeyPairSigner(),mint=await generateKeyPairSigner();
  const journal=tokenCreatorJournal({getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)});
  const {createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,compileTransaction}=await import('@solana/kit');
  const unsigned=compileTransaction(setTransactionMessageLifetimeUsingBlockhash({blockhash:'11111111111111111111111111111111',lastValidBlockHeight:10n},setTransactionMessageFeePayer(owner.address,createTransactionMessage({version:0}))));
  const signed=await partiallySignTransactionWithSigners([owner],unsigned),signature=getBase58Decoder().decode(signed.signatures[owner.address]);
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',signed.messageBytes)).toString('hex');
  journal.save({chain:'solana:mainnet',signature,mint:mint.address,owner:owner.address,name:'Fixture',symbol:'TEST',supply:'1',decimals:6,lastValidBlockHeight:'10',messageHash:hash});
  let statusReads=0;
  globalThis.fetch=async(url,options)=>{
   assert.equal(String(url),'https://solana-rpc.publicnode.com');const q=JSON.parse(options.body);let result;
   if(q.method==='getGenesisHash')result='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
   else if(q.method==='getSignatureStatuses'){statusReads++;result={context:{slot:20},value:[scenario==='failed'?{err:{InstructionError:[0,'Custom']},confirmationStatus:'finalized'}:scenario==='status-reappears'&&statusReads===2?{err:null,confirmationStatus:'confirmed'}:null]};}
   else if(q.method==='getBlockHeight'){if(scenario==='rpc-unavailable')throw Error('RPC_UNAVAILABLE');result=20;}
   else if(q.method==='getAccountInfo')result={context:{slot:20},value:scenario==='mint-exists'?{data:['','base64'],executable:false,lamports:1,owner:owner.address,rentEpoch:0,space:0}:null};
   else if(q.method==='getTransaction')result={slot:20,transaction:[Buffer.from(getTransactionEncoder().encode(signed)).toString('base64'),'base64'],meta:{err:{InstructionError:[0,'Custom']}}};
   else throw Error('Forbidden RPC '+q.method);
   return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}),{headers:{'Content-Type':'application/json'}});
  };
  try{
   if(scenario==='rpc-unavailable'){await assert.rejects(readTokenCreation(journal));assert.ok(journal.read());}
   else{const result=await readTokenCreation(journal);assert.equal(result.state,['failed','expired'].includes(scenario)?scenario:'pending');assert.equal(Boolean(journal.read()),!['failed','expired'].includes(scenario));}
  }finally{globalThis.fetch=previous;}
 });
});
test('mainnet creator uses intercepted RPC and disposable signatures only',async t=>{
 for(const scenario of ['success','success-not-finalized','success-invalid-receipt','cancel','changed-message','wrong-network','storage-failure','uncertain-send','expired','wallet-changed'])await t.test(scenario,async()=>{
  const oldFetch=globalThis.fetch,owner=await generateKeyPairSigner(),account={address:owner.address,chains:['solana:mainnet']},calls=[],memory=new Map();let time=1000,signs=0,submittedWire;
  const journal=tokenCreatorJournal({getItem:k=>memory.get(k)||null,setItem:(k,v)=>{if(scenario==='storage-failure')throw Error('STORAGE');memory.set(k,v);},removeItem:k=>memory.delete(k)});
  const wallet={accounts:[account],features:{'solana:signTransaction':{supportedTransactionVersions:[0],async signTransaction({transaction,chain}){
   signs++;assert.equal(chain,'solana:mainnet');let tx=getTransactionDecoder().decode(transaction);
   if(scenario==='changed-message'){const messageBytes=new Uint8Array(tx.messageBytes);messageBytes[messageBytes.length-1]^=1;tx={...tx,messageBytes};}
   return [{signedTransaction:getTransactionEncoder().encode(await partiallySignTransactionWithSigners([owner],tx))}];
  }}}};
  globalThis.fetch=async(url,options)=>{
   assert.equal(String(url),'https://solana-rpc.publicnode.com');const q=JSON.parse(options.body);calls.push(q.method);let result;
   if(q.method==='getGenesisHash')result=scenario==='wrong-network'?'wrong':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
   else if(q.method==='getMinimumBalanceForRentExemption')result=2039280;
   else if(q.method==='getLatestBlockhash')result={context:{slot:1},value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:1000}};
   else if(q.method==='simulateTransaction')result={context:{slot:1},value:{err:null,fee:10600,preBalances:[1000000000],postBalances:[990000000]}};
   else if(q.method==='sendTransaction'){
    assert.ok(journal.read());assert.equal(q.params[1].skipPreflight,false);assert.equal(q.params[1].maxRetries,0);
    if(scenario==='uncertain-send')throw Error('UNCERTAIN');
    submittedWire=q.params[0];result=getBase58Decoder().decode(getTransactionDecoder().decode(Buffer.from(q.params[0],'base64')).signatures[owner.address]);
   }else if(q.method==='getSignatureStatuses')result={context:{slot:1},value:[{err:null,confirmationStatus:scenario==='success-not-finalized'?'confirmed':'finalized'}]};
   else if(q.method==='getTransaction'){
    // The SDK omits the default finalized commitment on the wire.
    assert.equal(q.params[1].commitment??'finalized','finalized');const r=journal.read();
    result={slot:1,transaction:[submittedWire,'base64'],meta:{err:null,postTokenBalances:[{mint:r.mint,owner:r.owner,uiTokenAmount:{amount:scenario==='success-invalid-receipt'?'1':'100000000000000',decimals:6}}]}};
   }
   else throw Error('UNEXPECTED_RPC '+q.method);
   return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}),{headers:{'Content-Type':'application/json'}});
  };
  try{
   const prepare=()=>prepareTokenCreation({identity:{name:'Fixture',symbol:'TEST',supply:'100000000',decimals:6},wallet,account,journal,now:()=>time});
   if(scenario==='wrong-network'){await assert.rejects(prepare(),/NETWORK/);return;}
   const prepared=await prepare();assert.equal(signs,0);assert.equal(prepared.review.cluster,'solana:mainnet');assert.equal(prepared.review.platformFeeLamports,'0');assert.equal(prepared.review.vestingCreated,false);
   if(scenario==='cancel'){await assert.rejects(prepared.approveAndSubmit(),/APPROVAL_REQUIRED/);assert.equal(signs,0);return;}
   if(scenario==='expired')time=50000;
   if(scenario==='wallet-changed')wallet.accounts=[];
   const run=()=>prepared.approveAndSubmit({explicitApproval:true});
   if(scenario.startsWith('success')){await run();
    if(scenario==='success-invalid-receipt'){await assert.rejects(readTokenCreation(journal),/RECEIPT/);assert.ok(journal.read());}
    else {const status=await readTokenCreation(journal);assert.equal(status.state,scenario==='success-not-finalized'?'pending':'confirmed');assert.equal(Boolean(journal.read()),scenario==='success-not-finalized');}
    await assert.rejects(run(),/CONSUMED/);
   }
   else{await assert.rejects(run());if(scenario==='uncertain-send')assert.ok(journal.read());else assert.equal(calls.includes('sendTransaction'),false);}
  }finally{globalThis.fetch=oldFetch;}
 });
});
