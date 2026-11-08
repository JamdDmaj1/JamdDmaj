import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import bs58 from 'bs58';
import {getCompiledTransactionMessageDecoder} from '@solana/kit';
import {readPhoenixCollateralContext,preparePhoenixCollateral} from '../lib/phoenix-collateral.js';
import {buildPhoenixCollateralWire} from '../lib/phoenix-collateral-simulation.js';
import {capturePhoenixSignedCollateral,archivePhoenixSignedCollateral,restorePhoenixSignedCollateral,reconcilePhoenixCollateral,requirePhoenixFinalizedCollateral,requirePhoenixCanonicalPayout} from '../lib/phoenix-collateral-receipt.js';
import {readPhoenixChainAccount} from '../lib/phoenix-chain-account.js';
import {phoenixNativeMarketFixture} from './helpers/phoenix-native-market-fixture.mjs';
import {phoenixTraderBytes,phoenixRpcAccount,phoenixTokenBytes} from './helpers/phoenix-chain-account-fixture.mjs';
import {PHOENIX_IDENTITIES as ID} from '../lib/phoenix-market-plan.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
async function fixture(phase='WITHDRAW',{signing=generateKeyPairSync('ed25519')}={}){
 const wallet=bs58.encode(signing.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 const f=await phoenixNativeMarketFixture({wallet}),map=new Map([...f.nativeMap,...f.map]);
 const parent=Buffer.from(map.get(f.parent).data[0],'base64');parent.writeUInt32LE(1,116);map.set(f.parent,phoenixRpcAccount(ID.program,parent));
 map.set(f.a.trader,phoenixRpcAccount(ID.program,phoenixTraderBytes({address:f.a.trader,wallet,baseLots:0n,virtualQuoteLots:0n,collateral:phase==='WITHDRAW'?10010000n:0n})));
 map.set(f.a.canonicalAta,phoenixRpcAccount(TOKEN,phoenixTokenBytes(ID.canonicalUsdc,wallet,phase==='WITHDRAW'?0n:10010000n)));
 const read=async(method,params)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method!=='getMultipleAccounts')throw Error('NO_NETWORK_MUTATIONS');
  return {context:{slot:1000},value:params[0].map(address=>{const a=map.get(address);if(!a)return null;const s=params[1].dataSlice;
   return s?{...a,data:[Buffer.from(a.data[0],'base64').subarray(s.offset,s.offset+s.length).toString('base64'),'base64']}:a;})};
 };
 const options={request:read,now:f.now,monotonicNow:f.monotonicNow},context=await readPhoenixCollateralContext({walletAddress:wallet},options);
 const account=await readPhoenixChainAccount({walletAddress:wallet,subaccountIndices:[1]},options);
 const prep=await preparePhoenixCollateral({context,account,subaccountIndex:1,phase,amountUnits:'10010000'},{request:read}),wire=buildPhoenixCollateralWire(prep,f.wireOptions);
 const signed=Buffer.from(wire.serializedTxBase64,'base64');sign(null,signed.subarray(65),signing.privateKey).copy(signed,1);
 const source=phase==='UNWRAP'?await fixture('WITHDRAW',{signing}):null;
 const payout=source?await reconcilePhoenixCollateral(source.proof,{request:source.request}):null;
 const proof=capturePhoenixSignedCollateral(wire,signed.toString('base64'),{payout}),m=getCompiledTransactionMessageDecoder().decode(signed.subarray(65)),keys=m.staticAccounts;
 const balance=(address,mint,amount)=>({accountIndex:keys.indexOf(address),mint,owner:wallet,programId:TOKEN,uiTokenAmount:{amount,decimals:6}});
 const preTokenBalances=[balance(f.a.canonicalAta,ID.canonicalUsdc,phase==='WITHDRAW'?'0':'10010000')];
 const postTokenBalances=[balance(f.a.canonicalAta,ID.canonicalUsdc,phase==='WITHDRAW'?'10010000':'0')];
 if(phase==='UNWRAP'){preTokenBalances.push(balance(f.a.usdcAta,ID.usdc,'3000000'));postTokenBalances.push(balance(f.a.usdcAta,ID.usdc,'13010000'));}
 const transfer=Buffer.alloc(9);transfer[0]=3;transfer.writeBigUInt64LE(10010000n,1);
 const tokenSource=phase==='WITHDRAW'?f.a.globalVault:f.a.emberVault,dest=phase==='WITHDRAW'?f.a.canonicalAta:f.a.usdcAta;
 const preBalances=keys.map(()=>2039280);preBalances[0]=100000000;const postBalances=[...preBalances];postBalances[0]-=5300;
 const tx={slot:1001,transaction:[signed.toString('base64'),'base64'],meta:{err:null,fee:5300,preTokenBalances,postTokenBalances,preBalances,postBalances,
  innerInstructions:[{index:phase==='WITHDRAW'?3:4,instructions:[{programIdIndex:keys.indexOf(TOKEN),accounts:[keys.indexOf(tokenSource),keys.indexOf(dest),keys.indexOf(tokenSource)],data:bs58.encode(transfer)}]}]}};
 let status={slot:1001,err:null,confirmationStatus:'finalized'},current=tx;
 const calls=[],request=async(method,params)=>{calls.push(method);
  if(source&&(method==='getSignatureStatuses'&&params[0][0]===source.proof.signature||method==='getTransaction'&&params[0]===source.proof.signature))return source.request(method,params);
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSignatureStatuses')return {context:{slot:1002},value:[status]};if(method==='getTransaction')return current;throw Error('NO_SEND_ALLOWED');};
 return {...f,wire,proof,signed,tx,request,keys,prep,calls,source,payout,setStatus(s){status=s;},setTx(v){current=v;}};
}
test('exact finalized native canonical payout and USDC conversion are separate verified facts',async()=>{
 for(const phase of ['WITHDRAW','UNWRAP']){
  const f=await fixture(phase),r=await reconcilePhoenixCollateral(f.proof,{request:f.request});
  assert.equal(r.state,phase==='WITHDRAW'?'CANONICAL_RECEIVED':'USDC_RECEIVED');assert.equal(r.walletCredited,phase==='UNWRAP');
  assert.equal(r.receivedUnits,'10010000');assert.equal(requirePhoenixFinalizedCollateral(r,{walletAddress:f.wallet,phase}),r);
  assert.throws(()=>requirePhoenixFinalizedCollateral({...r}));assert.throws(()=>requirePhoenixFinalizedCollateral(r,{phase:'another'}));
  assert.ok(f.calls.every(m=>!m.startsWith('send')));
 }
});
test('accepted withdrawal without canonical credit remains waiting and cannot authorize conversion',async()=>{
 const f=await fixture();f.tx.meta.postTokenBalances[0].uiTokenAmount.amount='0';f.tx.meta.innerInstructions=[];
 const r=await reconcilePhoenixCollateral(f.proof,{request:f.request});assert.equal(r.state,'AWAITING_PAYOUT');assert.equal(r.walletCredited,false);assert.equal(r.receivedUnits,undefined);
 assert.throws(()=>requirePhoenixCanonicalPayout(r,{walletAddress:f.wallet,subaccountIndex:1,amountUnits:'10010000'}),/PAYOUT_BINDING/);
});
test('confirmed-only, missing and unavailable finalized receipts stay unresolved without retries',async()=>{
 const f=await fixture();for(const s of [null,{slot:1001,err:null,confirmationStatus:'confirmed'}]){f.setStatus(s);assert.equal((await reconcilePhoenixCollateral(f.proof,{request:f.request})).state,'UNKNOWN');}
 f.setStatus({slot:1001,err:null,confirmationStatus:'finalized'});f.setTx(null);assert.equal((await reconcilePhoenixCollateral(f.proof,{request:f.request})).mayRetry,false);
 const conversion=await fixture('UNWRAP');conversion.source.setStatus(null);
 assert.equal((await reconcilePhoenixCollateral(conversion.proof,{request:conversion.request})).state,'UNKNOWN');
 conversion.source.setStatus({slot:1002,err:null,confirmationStatus:'finalized'});conversion.source.tx.slot=1002;
 await assert.rejects(()=>reconcilePhoenixCollateral(conversion.proof,{request:conversion.request}),/TRANSACTION/);
});
test('same signed evidence reconstructs after expiry, while amount, child, phase and signature substitutions fail',async()=>{
 for(const phase of ['WITHDRAW','UNWRAP']){
  const f=await fixture(phase),archive=JSON.parse(JSON.stringify(archivePhoenixSignedCollateral(f.proof)));f.advance(60000);
  const restored=await restorePhoenixSignedCollateral(archive);assert.equal(restored.signature,f.proof.signature);
  if(phase==='UNWRAP'){
   assert.throws(()=>capturePhoenixSignedCollateral(f.wire,f.signed.toString('base64')));
   assert.throws(()=>capturePhoenixSignedCollateral(f.wire,f.signed.toString('base64'),{payout:{...f.payout}}));
   const original=archive.payoutArchive.serializedTxBase64;archive.payoutArchive.serializedTxBase64='tampered-after-restore';
   assert.equal(archivePhoenixSignedCollateral(restored).payoutArchive.serializedTxBase64,original);
   archive.payoutArchive.serializedTxBase64=original;
  }
  assert.equal((await reconcilePhoenixCollateral(restored,{request:f.request})).receivedUnits,'10010000');
  for(const changes of [{amountUnits:'10010001'},{subaccountIndex:2},{phase:phase==='WITHDRAW'?'UNWRAP':'WITHDRAW'},{serializedTxBase64:f.wire.serializedTxBase64}])await assert.rejects(()=>restorePhoenixSignedCollateral({...archive,...changes}));
 }
});
test('balance credit without exact native source transfer, wrong owner, slot, wire or extra SOL debit fails',async()=>{
 for(const mutate of [f=>{f.tx.meta.innerInstructions=[];},f=>{f.tx.meta.postTokenBalances[0].owner=f.keys[1];},
  f=>{f.tx.meta.innerInstructions[0].instructions[0].accounts[0]=0;},f=>{f.tx.slot=1000;},f=>{f.tx.meta.postBalances[0]--;},f=>{f.tx.transaction[0]=f.wire.serializedTxBase64;}]){
  const f=await fixture();mutate(f);await assert.rejects(()=>reconcilePhoenixCollateral(f.proof,{request:f.request}));
 }
});
