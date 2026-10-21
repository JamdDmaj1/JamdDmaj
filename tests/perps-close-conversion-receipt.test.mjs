import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {readFinalizedPerpsCloseConversionReceipt,requireVerifiedPerpsCloseConversionReceipt,decodePerpsCloseConversionSwapEvent} from '../lib/perps-close-conversion-receipt.js';
import {conversionReceiptFixture} from './helpers/perps-conversion-receipt-fixture.mjs';
const read=f=>readFinalizedPerpsCloseConversionReceipt(f.wire,f.identity,f.receiptOptions);
test('native public unsigned simulation event matches the pinned PoolSwapEvent layout without granting receipt authority',()=>{
 // Observed from actual native self-CPI at bank 459581590. This is only public
 // unsigned simulation output, not a finalized receipt or owned-wallet trade.
 const data=Buffer.from(bs58.decode('q7FXAAedM1BLrviLPdEuWogeFKvyw5VcgAmmBKzZcAdsaheHAk7cKyyKexhJJfK8oMm1cm87iubY9Zv35AzscbszvAfbXDigdhZAor3izPKMYHX2y9UQWEcjK6XPfD3PEgSfF5XYJPqFkG1JzF61ie1fzFhpi7BAFvLGusXWRAnzgZxLvmoyEvhMBwHv7r51NuRtiSyGLzVXRiayaseAQtZeHPECboxPemHMviwhNFNTwPm6JR3ZkDWRe2DT8uiENbdaLgcCk1VL8KXKgX8PvjnCqCfDXZk8P7qk5Ca'));
 assert.equal(data.length,216);const event=decodePerpsCloseConversionSwapEvent(data.subarray(8));
 assert.equal(event.owner,'Bnm7bbv4KkiC48suvQXBmKZCiwod7woAaTZ8BoHVxKDs');assert.equal(event.amountIn,'100000');
 assert.equal(event.amountOut,'10682');assert.equal(event.amountOutAfterFees,'10634');assert.equal(event.feeBps,'45');
 assert.equal(event.readyForSigning,false);assert.equal(event.requiresVerifiedNativeCpi,true);assert.throws(()=>requireVerifiedPerpsCloseConversionReceipt(event));
 assert.throws(()=>decodePerpsCloseConversionSwapEvent(data));
});
test('finalized one-owner conversion proves the exact wire, native CPI event, transfers, minimum and old-balance conservation',async()=>{
 for(const options of [{asset:'BTC'},{asset:'ETH'},{asset:'SOL',nativeSolInput:false},{asset:'SOL'},{asset:'SOL',closeWrappedAccount:false,oldWrapped:17n,unsynced:7n}]){
  const f=await conversionReceiptFixture(options),p=await read(f);
  assert.equal(p.receivedUsdcUnits,f.received.toString());assert.equal(p.convertedTokenUnits,f.amount.toString());assert.equal(p.slot,120);
  assert.equal(p.networkFeeLamports,'5400');assert.equal(p.readyForSigning,false);assert.equal(p.requiresFinalizedCloseAndSignedJournalBinding,true);assert.equal(p.requiresCompleteDailyAccounting,true);
  assert.ok(Object.isFrozen(p));assert.equal(requireVerifiedPerpsCloseConversionReceipt(p),p);assert.throws(()=>requireVerifiedPerpsCloseConversionReceipt({...p}));
  assert.ok(f.calls.filter(c=>c.method==='getTransaction').every(c=>c.params[1].commitment==='finalized'));
  f.expire();assert.throws(()=>requireVerifiedPerpsCloseConversionReceipt(p));
 }
});
test('ATA rent and SOL cleanup are measured from finalized effects, not current rent assumptions',async()=>{
 for(const options of [{asset:'BTC',newDestination:true},{asset:'SOL',newSource:true,newDestination:true},{asset:'SOL',newSource:true,closeWrappedAccount:false},{asset:'SOL',closeWrappedAccount:false,oldWrapped:9n}]){
  const f=await conversionReceiptFixture(options),p=await read(f),owner=f.index(f.walletAddress);
  assert.equal(p.walletSolChangeLamports,String(f.transaction.meta.postBalances[owner]-f.transaction.meta.preBalances[owner]));
  assert.equal(p.receivedUsdcUnits,f.received.toString());
 }
});

test('finalized ATA rent can differ from the simulation fixture without inventing or losing owner SOL',async()=>{
 const f=await conversionReceiptFixture({asset:'SOL',newSource:true,newDestination:true,closeWrappedAccount:false}),m=f.transaction.meta;
 for(const key of [f.wire.source,f.wire.destination]){
  const difference=m.postBalances[f.index(key)]-1488440;m.postBalances[f.index(key)]=1488440;m.postBalances[f.index(f.walletAddress)]+=difference;
 }
 const p=await read(f);assert.equal(p.rentLockedLamports,'2976880');assert.equal(p.receivedUsdcUnits,f.received.toString());
});
test('pending, unavailable and failed conversions never establish a finalized payout or release authority',async()=>{
 for(const mode of ['processed','confirmed','missingStatus','missingTx','failed']){
  const f=await conversionReceiptFixture();if(['processed','confirmed'].includes(mode))f.status.confirmationStatus=mode;
  if(mode==='failed'){f.status.err={InstructionError:[6,{Custom:6020}]};f.transaction.meta.err=f.status.err;}
  const request=(m,p)=>mode==='missingStatus'&&m==='getSignatureStatuses'?Promise.resolve({context:{slot:130},value:[null]}):mode==='missingTx'&&m==='getTransaction'?Promise.resolve(null):f.request(m,p);
  const pending=()=>readFinalizedPerpsCloseConversionReceipt(f.wire,f.identity,{...f.receiptOptions,request});
  if(mode==='failed')await assert.rejects(pending);else assert.equal(await pending(),null);
 }
});
test('wrong wire, signatures, identity, network, timing, status and unsafe metadata cannot qualify',async()=>{
 for(const mode of ['wire','signature','signedHash','slot','oldSlot','future','beforeIntent','fee','unsafe','identityPoint','network','expiry']){
  const f=await conversionReceiptFixture({identityPoint:mode==='identityPoint'}),meta=f.transaction.meta;
  if(mode==='wire'){const b=Buffer.from(f.transaction.transaction[0],'base64');b[b.length-1]^=1;f.transaction.transaction[0]=b.toString('base64');}
  if(mode==='signature')f.identity.signature=bs58.encode(Buffer.alloc(64,4));
  if(mode==='signedHash')f.identity.wireHash='a'.repeat(64);
  if(mode==='slot')f.transaction.slot++;
  if(mode==='oldSlot')f.identity.minimumSlot=121;
  if(mode==='future')f.transaction.blockTime+=3;
  if(mode==='beforeIntent')f.identity.createdAt+=100000;
  if(mode==='fee')meta.fee=1000001;
  if(mode==='unsafe')meta.preBalances[0]=Number.MAX_SAFE_INTEGER+1;
  const request=async(m,p)=>{if(mode==='network'&&m==='getGenesisHash')return 'devnet';const r=await f.request(m,p);if(mode==='expiry')f.expire();return r;};
  await assert.rejects(readFinalizedPerpsCloseConversionReceipt(f.wire,f.identity,{...f.receiptOptions,request}),mode);
 }
});
test('altered token/vault/owner deltas and forged or mismatched native CPI output fail reconciliation',async()=>{
 for(const mode of ['destination','source','sourceVault','outputVault','ownerSol','mint','tokenOwner','decimals','authority','transferAmount','eventAmount','eventOwner','eventOrigin','extraEvent','missingEvent','stack']){
  const f=await conversionReceiptFixture({asset:'ETH'}),m=f.transaction.meta,group=m.innerInstructions[0],out=m.postTokenBalances.find(b=>b.accountIndex===f.index(f.wire.destination));
  if(mode==='destination')out.uiTokenAmount.amount=String(BigInt(out.uiTokenAmount.amount)+1n);
  if(mode==='source'||mode==='sourceVault'||mode==='outputVault'){
   const key={source:f.wire.source,sourceVault:f.c.tokenAccount,outputVault:f.u.tokenAccount}[mode],b=m.postTokenBalances.find(b=>b.accountIndex===f.index(key));b.uiTokenAmount.amount=String(BigInt(b.uiTokenAmount.amount)+1n);
  }
  if(mode==='ownerSol')m.postBalances[f.index(f.walletAddress)]++;
  if(mode==='mint')out.mint=f.c.mint;
  if(mode==='tokenOwner')out.owner=f.c.address;
  if(mode==='decimals')out.uiTokenAmount.decimals=9;
  if(mode==='authority')group.instructions[0].accounts[2]=f.index(f.c.address);
  if(mode==='transferAmount'){const b=Buffer.from(bs58.decode(group.instructions[0].data));b.writeBigUInt64LE(f.amount+1n,1);group.instructions[0].data=bs58.encode(b);}
  if(mode==='eventAmount'||mode==='eventOwner'){const b=Buffer.from(bs58.decode(group.instructions[2].data));b[mode==='eventAmount'?136:152]^=1;group.instructions[2].data=bs58.encode(b);}
  if(mode==='eventOrigin')group.instructions[2].programIdIndex=f.index('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  if(mode==='extraEvent')group.instructions.push(structuredClone(group.instructions[2]));
  if(mode==='missingEvent')group.instructions.pop();
  if(mode==='stack')group.instructions[0].stackHeight=1;
  await assert.rejects(read(f),mode);
 }
});

test('in-flight identity and RPC mutations cannot replace captured receipt evidence, and backwards leases fail',async()=>{
 const f=await conversionReceiptFixture(),expected=f.identity.signature;
 const request=async(m,p)=>{const r=await f.request(m,p);if(m==='getSignatureStatuses')f.identity.signature=bs58.encode(Buffer.alloc(64,5));return r;};
 const p=await readFinalizedPerpsCloseConversionReceipt(f.wire,f.identity,{...f.receiptOptions,request});assert.equal(p.signature,expected);
 f.transaction.meta.postTokenBalances[0].uiTokenAmount.amount='0';assert.equal(requireVerifiedPerpsCloseConversionReceipt(p).signature,expected);
 f.backward();assert.throws(()=>requireVerifiedPerpsCloseConversionReceipt(p));
});
