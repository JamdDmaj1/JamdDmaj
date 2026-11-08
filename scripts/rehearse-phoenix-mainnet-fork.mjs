// Fork PUBLIC protocol state into an in-memory VM with a fictitious wallet.
// No user keys, operator credentials or network send endpoints are used.
// A fresh encrypted temporary test vault signs wallet-only VM transactions. Provider setup
// signatures remain zero, so the setup can execute ONLY in the local VM.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {resolve,join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import bs58 from 'bs58';
import {createPhoenixClient,MarginType,decodePerpAssetMap,ticksToUsdWithMarketParams,buildUpdateTraderPreferenceBitsIx,TraderPreferenceToggleTarget} from '@ellipsis-labs/rise';
import {createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,
 appendTransactionMessageInstructions,compileTransaction,getBase64EncodedWireTransaction,getCompiledTransactionMessageDecoder} from '@solana/kit';
import {decodePhoenixCatalog,PHOENIX_IDENTITIES as ID} from '../lib/phoenix-market-plan.js';
import {decodePhoenixMarketQuote} from '../lib/phoenix-market-quote.js';
import {derivePhoenixWalletAccounts} from '../lib/phoenix-instruction-bindings.js';
import {readPhoenixChainAccount} from '../lib/phoenix-chain-account.js';
import {preparePhoenixOrderReview,preparePhoenixCloseReview} from '../lib/phoenix-order-review.js';
import {readPhoenixNativeMarket} from '../lib/phoenix-native-market.js';
import {buildPhoenixOrderWire} from '../lib/phoenix-order-wire.js';
import {simulatePhoenixOrder} from '../lib/phoenix-order-simulation.js';
import {buildPhoenixIsolatedSetup} from '../lib/phoenix-isolated-setup.js';
import {readPhoenixCollateralContext,preparePhoenixCollateral} from '../lib/phoenix-collateral.js';
import {buildPhoenixCollateralWire,simulatePhoenixCollateral} from '../lib/phoenix-collateral-simulation.js';
import {reconcilePhoenixCollateral} from '../lib/phoenix-collateral-receipt.js';
import {reconcilePhoenixOrder} from '../lib/phoenix-order-receipt.js';
import {openPhoenixExecutionJournal} from '../lib/phoenix-execution-journal.js';
import {authorizePhoenixOrderSigning} from '../lib/phoenix-order-signing.js';
import {authorizePhoenixCollateralSigning} from '../lib/phoenix-collateral-signing.js';
import {quotePerpsPlatformFee} from '../lib/perps-platform-fee.js';
import {openPhoenixVmCustody} from '../tests/helpers/phoenix-vm-custody.mjs';
import {createPhoenixManualService} from '../lib/phoenix-manual-service.js';
import {createPerpsAutomationApi} from '../lib/perps-automation-api.js';
import {createPhoenixManualClient} from '../lib/phoenix-manual-client.js';
import {assessPhoenixPlatformFee} from '../lib/phoenix-platform-fee-assessment.js';
import {preparePhoenixPlatformFeePayment} from '../lib/perps-platform-fee-payment.js';
import {planPhoenixPlatformFeeTransfer} from '../lib/perps-platform-fee-transfer.js';
import {authorizePhoenixFeeSigning,revalidatePhoenixFeeDispatch} from '../lib/phoenix-platform-fee-signing.js';

const journalDirectory=mkdtempSync(join(tmpdir(),'jamd-phoenix-vm-'));chmodSync(journalDirectory,0o700);
const custody=await openPhoenixVmCustody(journalDirectory);
const {ownerAccountHash,revision}=custody,WALLET=custody.identity.walletAddress,RPC='https://solana-rpc.publicnode.com';
const localReceipts=new Map();
const journalPath=join(journalDirectory,'phoenix.sqlite');
let journal=custody.journal;
let workflowId='a'.repeat(64);
const attemptId=label=>createHash('sha256').update('local-vm:'+label).digest('hex');
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
const CLOCK='SysvarC1ock11111111111111111111111111111111',RENT='SysvarRent111111111111111111111111111111111',RESTART='SysvarLastRestartS1ot1111111111111111111111';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const READS=new Set(['getGenesisHash','getMultipleAccounts','getSlot','getLatestBlockhash','getAccountInfo','getMinimumBalanceForRentExemption']);
const underlying=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const req=input instanceof Request?input:null,url=new URL(req?.url??String(input)),method=init?.method??req?.method??'GET';
 if(url.origin==='https://perp-api.phoenix.trade'){
  if(method!=='GET'){
   const body=typeof init?.body==='string'?JSON.parse(init.body):req?await req.clone().json():null;
   if(method!=='POST'||url.pathname!=='/v1/exchange/build-register-ixs'||body?.traderAuthority!==WALLET||body?.txFeePayer!==WALLET)throw Error('NO_PHOENIX_NETWORK_WRITE');
  }
 }else if(url.origin===RPC){
  const body=typeof init?.body==='string'?JSON.parse(init.body):req?await req.clone().json():null;
  if(method!=='POST'||!READS.has(body?.method))throw Error('NO_RPC_NETWORK_WRITE');
 }else throw Error('UNEXPECTED_NETWORK_ORIGIN');
 return underlying(input,{...init,signal:AbortSignal.timeout(20000)});
};
const client=createPhoenixClient({phoenixEnv:'prod',apiUrl:'https://perp-api.phoenix.trade',rpcUrl:RPC,ws:false,exchangeMetadata:{stream:false}});
const python=resolve('.phoenix-svm-venv',process.platform==='win32'?'Scripts':'bin',process.platform==='win32'?'python.exe':'python');
const child=spawn(python,['-u','scripts/phoenix-svm-bridge.py'],{cwd:process.cwd(),windowsHide:true,stdio:['pipe','pipe','pipe']});
const waiting=new Map();let sequence=0,stderr='';
child.stderr.on('data',part=>{stderr=(stderr+part.toString()).slice(-8000);});
createInterface({input:child.stdout}).on('line',line=>{
 let value;try{value=JSON.parse(line);}catch{return;}
 const pending=waiting.get(value.id);if(!pending)return;waiting.delete(value.id);clearTimeout(pending.timer);
 if(value.error)pending.reject(Error(value.error));else pending.resolve(value.result);
});
child.on('error',error=>{for(const p of waiting.values()){clearTimeout(p.timer);p.reject(error);}waiting.clear();});
child.on('exit',code=>{for(const p of waiting.values()){clearTimeout(p.timer);p.reject(Error('LOCAL_VM_EXIT_'+code+': '+stderr.slice(-1500)));}waiting.clear();});
function vm(kind,body={}){return new Promise((resolvePromise,reject)=>{
 const id=++sequence,timer=setTimeout(()=>{waiting.delete(id);reject(Error('LOCAL_VM_TIMEOUT'));},60000);
 waiting.set(id,{resolve:resolvePromise,reject,timer});child.stdin.write(JSON.stringify({id,kind,...body})+'\n');
});}
async function readNetwork(method,params){
 if(!READS.has(method))throw Error('NO_NETWORK_SEND');
 const response=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 const body=await response.json();if(!response.ok||body.error)throw Error('PUBLIC_RPC_READ_FAILED_'+(body.error?.code??response.status)+': '+String(body.error?.message??'').slice(0,300));return body.result;
}
async function networkAccounts(addresses,options={}){
 if(addresses.length>10){
  const values=[];let context=null;
  for(let i=0;i<addresses.length;i+=10){
   const part=await networkAccounts(addresses.slice(i,i+10),{...options,...(context?{minContextSlot:context.slot}:{})});
   values.push(...part.value);context=part.context;
  }
  return {context,value:values};
 }
 const reply=await readNetwork('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'confirmed',...options}]);
 assert.equal(reply.value.length,addresses.length);return reply;
}
function localWire(instructions,blockhash){
 let m=createTransactionMessage({version:'legacy'});m=setTransactionMessageFeePayer(WALLET,m);
 m=setTransactionMessageLifetimeUsingBlockhash({blockhash,lastValidBlockHeight:10000n},m);
 m=appendTransactionMessageInstructions(instructions.map(ix=>({...ix,data:Uint8Array.from(ix.data)})),m);
 return getBase64EncodedWireTransaction(compileTransaction(m));
}
const materialize=ix=>({programAddress:ix.programId,accounts:ix.keys.map(a=>({address:a.pubkey,role:(a.isSigner?2:0)|(a.isWritable?1:0)})),data:Uint8Array.from(ix.data)});
async function executeLocal(phase,wireBase64){
 const result=await vm('execute-local',{wireBase64});
 if(result.value.err!==null)throw Error('LOCAL_'+phase+': '+result.value.err+' '+result.value.logs.slice(-8).join(' | '));
 const raw=Buffer.from(wireBase64,'base64');if(raw[0]===1)localReceipts.set(bs58.encode(raw.subarray(1,65)),{slot:result.context.slot,blockTime:result.blockTime,transaction:[wireBase64,'base64'],meta:result.value});
 return {phase,units:result.value.unitsConsumed,fee:result.value.fee};
}
try{
 await client.exchange.ready();assert.equal(await readNetwork('getGenesisHash',[]),GENESIS);
 const rawMarkets=await client.api.exchange().getMarkets(),keys=await client.api.exchange().getKeys();
 const response=await fetch('https://perp-api.phoenix.trade/v1/exchange/build-register-ixs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({traderAuthority:WALLET,txFeePayer:WALLET,maxPositions:32})});
 const registration=await response.json();assert.ok(response.ok&&Array.isArray(registration.instructions));
 const parentIxs=registration.instructions.map(materialize);
 const common={authority:WALLET,traderPdaIndex:0,traderSubaccountIndex:1};
 const register=await client.ixs.buildRegisterTrader({...common,marginType:MarginType.Isolated,disableCollateralSweep:true});
 const sync=await client.ixs.buildSyncParentToChild({traderWallet:WALLET,traderPdaIndex:0,traderSubaccountIndex:1});
 const setupAccounts=await derivePhoenixWalletAccounts(WALLET,1);
 // Sync copies parent preference bits, so restore isolated settlement policy
 // AFTER sync. Disabling automatic sweep keeps a close independent of payout.
 const settlementPolicy=buildUpdateTraderPreferenceBitsIx({traderWallet:WALLET,traderAccount:setupAccounts.trader,
  toggles:[{target:TraderPreferenceToggleTarget.CollateralSweep,set:false}]});
 const deposit=await client.ixs.buildDepositIxs({...common,amount:10000000n});
 const market=rawMarkets.find(m=>m.symbol==='DOGE');assert.ok(market);
 const programs=[ID.program,ID.ember,TOKEN,ATA,'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'],programAccounts=await networkAccounts(programs),loaded=[];
 for(let i=0;i<programs.length;i++){
  const account=programAccounts.value[i],bytes=Buffer.from(account.data[0],'base64');let elf;
  if(bytes.subarray(0,4).equals(Buffer.from([127,69,76,70])))elf=bytes;
  else{
   assert.equal(bytes.readUInt32LE(0),2);const address=bs58.encode(bytes.subarray(4,36));
   const data=(await networkAccounts([address])).value[0],raw=Buffer.from(data.data[0],'base64');assert.equal(raw.readUInt32LE(0),3);elf=raw.subarray(45);
  }
  assert.ok(elf.subarray(0,4).equals(Buffer.from([127,69,76,70])));
  loaded.push({address:programs[i],elfBase64:elf.toString('base64'),sha256:createHash('sha256').update(elf).digest('hex')});
 }
 // Keep the mutually dependent matching-engine structures in the same bank
 // request. The free public reader permits at most ten addresses per request.
 const core=[keys.globalConfig,keys.perpAssetMap,market.marketPubkey,market.splinePubkey,
  ...keys.globalTraderIndex,...keys.activeTraderBuffer,keys.withdrawQueue,CLOCK];
 assert.ok(core.length<=10);
 const addresses=[...new Set(core.concat([...parentIxs,register,sync,settlementPolicy,...deposit.instructions].flatMap(ix=>ix.accounts.map(a=>a.address)),[
  keys.globalVault,ID.usdc,ID.canonicalUsdc,RENT,RESTART
 ]))].filter(a=>![...programs,SYSTEM,COMPUTE].includes(a));
 assert.ok(addresses.length<=100);
 const source=await networkAccounts(addresses);
 const initialized=await vm('initialize',{programs:loaded,accounts:addresses.map((address,i)=>({address,
  account:source.value[i]&&{...source.value[i],rentEpoch:0}})),walletAddress:WALLET});
 const phases=[];
 if(registration.includeRegisterTrader)phases.push(await executeLocal('REGISTER_PARENT',localWire(parentIxs,initialized.blockhash)));
 const walletAccounts=await derivePhoenixWalletAccounts(WALLET,1),token=Buffer.alloc(165);
 token.set(bs58.decode(ID.usdc),0);token.set(bs58.decode(WALLET),32);token.writeBigUInt64LE(20000000n,64);token[108]=1;
 await vm('set-fictitious-account',{address:walletAccounts.usdcAta,account:{owner:TOKEN,lamports:await vm('rent',{bytes:165}),data:[token.toString('base64'),'base64']}});
 const assetAccount=source.value[addresses.indexOf(keys.perpAssetMap)],asset=decodePerpAssetMap(Buffer.from(assetAccount.data[0],'base64')).metadata.entries.find(e=>e.key==='DOGE').value;
 const price=ticksToUsdWithMarketParams(asset.oraclePrice.markPrice.price.ticks,{tickSize:market.tickSize,baseLotsDecimals:market.baseLotsDecimals});
 const fixedNow=Date.now(),catalog=decodePhoenixCatalog(rawMarkets,{observedAt:fixedNow});
 const quote=decodePhoenixMarketQuote({symbol:'DOGE',timestamp_ms:fixedNow,mark_price:price,oracle_price:price},{symbol:'DOGE',now:fixedNow});
 const now=()=>fixedNow,monotonicNow=()=>0;
 journal.close();journal=openPhoenixExecutionJournal(journalPath,{allowNonPosixForTests:process.platform==='win32',now});
 let deferSignature=null,failNextFeeBlockhash=false;
 const rpc=async(method,params)=>{
  if(method==='getGenesisHash')return GENESIS;
  if(method==='getSlot')return initialized.slot;
  if(method==='getBlockHeight')return 1000;
  if(method==='getLatestBlockhash'){if(failNextFeeBlockhash){failNextFeeBlockhash=false;throw Error('LOCAL_FEE_PREPARATION_UNAVAILABLE');}
   return {context:{slot:initialized.slot},value:{blockhash:initialized.blockhash,lastValidBlockHeight:10000}};}
  if(method==='getSignatureStatuses')return {context:{slot:initialized.slot},value:params[0].map(signature=>{if(signature===deferSignature){deferSignature=null;return null;}return localReceipts.has(signature)?{slot:localReceipts.get(signature).slot,err:null,confirmationStatus:'finalized'}:null;})};
  if(method==='getTransaction')return localReceipts.get(params[0])??null;
  if(method==='getMultipleAccounts')return vm('read',{addresses:params[0],dataSlice:params[1]?.dataSlice});
  if(method==='getFeeForMessage'){
   const m=getCompiledTransactionMessageDecoder().decode(Buffer.from(params[0],'base64'));
   let limit=Math.min(m.instructions.length*200000,1400000),price=0n;
   for(const ix of m.instructions)if(m.staticAccounts[ix.programAddressIndex]===COMPUTE){
    const b=Buffer.from(ix.data);if(b[0]===2)limit=b.readUInt32LE(1);if(b[0]===3)price=b.readBigUInt64LE(1);
   }
   return {context:{slot:initialized.slot},value:m.header.numSignerAccounts*5000+Number((BigInt(limit)*price+999999n)/1000000n)};
  }
  if(method==='simulateTransaction')return vm('simulate',{wireBase64:params[0],addresses:params[1].accounts.addresses});
  throw Error('NO_NETWORK_OR_UNEXPECTED_VM_METHOD_'+method);
 };
 const deps={publicClient:{catalog:async()=>catalog,quote:async()=>quote},readSlot:async()=>initialized.slot,now,
  readAccount:args=>readPhoenixChainAccount(args,{request:rpc,now,monotonicNow})};
 const intent={walletAddress:WALLET,symbol:'DOGE',side:'LONG',marginUsdcUnits:'10000000',leverageTenths:30,clientOrderId:'12345',isolatedSubaccountIndex:1};
 const review=await preparePhoenixOrderReview(intent,deps);
 const native=await readPhoenixNativeMarket(review.plan,{exchangeKeys:keys,request:rpc,now,monotonicNow});
 const beforeSetup=await deps.readAccount({walletAddress:WALLET,subaccountIndices:[1]});
 const setup=await buildPhoenixIsolatedSetup({plan:review.plan,native,account:beforeSetup},{request:rpc,now});
 phases.push(await executeLocal('REGISTER_CHILD',localWire(setup.instructions,initialized.blockhash)));
 // Replaying permissionless sync must not undo the protected settlement policy.
 phases.push(await executeLocal('SYNC_REPLAY',localWire([sync],initialized.blockhash)));
 const account=await deps.readAccount({walletAddress:WALLET,subaccountIndices:[1]});
 assert.equal(account.subaccounts[0].disableCollateralSweep,true);assert.equal(account.subaccounts[1].disableCollateralSweep,true);
 if(process.argv.includes('--diagnostic'))console.error(JSON.stringify({localAccountPolicy:account.subaccounts.map(s=>({index:s.subaccountIndex,
  exists:s.exists,authorityIsWallet:s.authorityIsWallet,positionAuthorityIsZero:s.positionAuthority===SYSTEM,
  disableCollateralSweep:s.disableCollateralSweep,hasSplineLiquidity:s.hasSplineLiquidity,
  spotCollateralCount:s.spotCollateralCount,hasLockedDeposit:s.hasLockedDeposit,flags:s.capabilityFlags}))}));
 const wire=await buildPhoenixOrderWire(review,{client,exchangeKeys:keys,blockhash:initialized.blockhash,lastValidBlockHeight:10000,now});
 const simulation=await simulatePhoenixOrder({wire,native,account},{request:rpc,now,monotonicNow});
 async function executeOrder(label,wire,simulation){
  const id=attemptId(label),claim=journal.prepareOrder({id,workflowId,ownerAccountHash,controlRevision:revision,wire,simulation,request:rpc});
  if(label==='OPEN')journal.recordFeeConsent({id,ownerAccountHash,termsVersion:quotePerpsPlatformFee('10000000').version,
   maximumLamports:'5000',expiresAt:now()+300000,explicitApproval:true});
  const grant=authorizePhoenixOrderSigning({ownerAccountHash,journal,claim,wire,simulation,request:rpc,
   controls:custody.controls,backupRegistry:custody.backupRegistry,riskJournal:custody.riskJournal,swapJournal:custody.swapJournal,
   explicitApproval:true,platformFeeTerms:wire.close?undefined:quotePerpsPlatformFee('10000000'),assertUncontended(){}});
  const signed=custody.vault.signPhoenixOrder(grant);assert.throws(()=>custody.vault.signPhoenixOrder(grant));journal.markBroadcast(id,ownerAccountHash);
  phases.push(await executeLocal(label,signed.serializedTxBase64));
  const evidence=await journal.recoveryEvidence(id,ownerAccountHash),receipt=await reconcilePhoenixOrder(evidence,{request:rpc});
  journal.recordFinalized(id,ownerAccountHash,receipt);
 }
 await executeOrder('OPEN',wire,simulation);
 // Fictitious recipient ATA in RAM only. Neither recipient nor test wallet
 // has been funded or mutated on the network.
 const assessment=assessPhoenixPlatformFee({journal,workflowId,ownerAccountHash}),feePlan=await planPhoenixPlatformFeeTransfer(assessment);
 const recipientToken=Buffer.alloc(165);recipientToken.set(bs58.decode(ID.usdc));recipientToken.set(bs58.decode(feePlan.recipient),32);recipientToken[108]=1;
 await vm('set-fictitious-account',{address:feePlan.instruction.accounts[2].address,account:{owner:TOKEN,lamports:await vm('rent',{bytes:165}),data:[recipientToken.toString('base64'),'base64']}});
 const feeReview=await preparePhoenixPlatformFeePayment(assessment,{request:rpc,now,monotonicNow}),feeId=attemptId('OPEN_FEE');
 assert.equal(feeReview.feeUnits,'20000');
 const feeClaim=journal.prepareFee({id:feeId,ownerAccountHash,controlRevision:revision,review:feeReview});
 const feeGrant=authorizePhoenixFeeSigning({ownerAccountHash,journal,claim:feeClaim,review:feeReview,controls:custody.controls,
  backupRegistry:custody.backupRegistry,riskJournal:custody.riskJournal,swapJournal:custody.swapJournal,assertUncontended(){},now});
 const feeSigned=custody.vault.signPhoenixFee(feeGrant);assert.throws(()=>custody.vault.signPhoenixFee(feeGrant));
 await journal.revalidateFeeBeforeBroadcast(feeClaim,{request:rpc});revalidatePhoenixFeeDispatch(feeGrant);journal.markBroadcast(feeId,ownerAccountHash);
 phases.push(await executeLocal('OPEN_FEE',feeSigned.serializedTxBase64));deferSignature=feeSigned.signature;
 assert.equal((await journal.feeReceipt(feeId,ownerAccountHash,{request:rpc,now})).state,'UNKNOWN');
 journal.close();journal=openPhoenixExecutionJournal(journalPath,{allowNonPosixForTests:process.platform==='win32',now});
 const feeReceipt=await journal.feeReceipt(feeId,ownerAccountHash,{request:rpc,now});assert.equal(feeReceipt.state,'PAID');
 journal.recordFinalizedFee(feeId,ownerAccountHash,feeReceipt);assert.equal(journal.readWorkflow(workflowId,ownerAccountHash).state,'OPEN');
 assert.throws(()=>assessPhoenixPlatformFee({journal,workflowId,ownerAccountHash}));
 const closeReview=await preparePhoenixCloseReview({...intent,clientOrderId:'12346'},deps);
 const closeNative=await readPhoenixNativeMarket(closeReview.plan,{exchangeKeys:keys,request:rpc,now,monotonicNow});
 const closeWire=await buildPhoenixOrderWire(closeReview,{client,exchangeKeys:keys,blockhash:initialized.blockhash,lastValidBlockHeight:10000,now});
 const closing=await simulatePhoenixOrder({wire:closeWire,native:closeNative,account:closeReview.account},{request:rpc,now,monotonicNow});
 await executeOrder('CLOSE',closeWire,closing);
 let final=await deps.readAccount({walletAddress:WALLET,subaccountIndices:[1]});
 assert.ok(final.subaccounts[1].positions.every(p=>p.baseLots==='0'));
 async function settleLocal(label){
  const before=await deps.readAccount({walletAddress:WALLET,subaccountIndices:[1]}),amount=BigInt(before.subaccounts[1].quoteCollateralUnits);
  assert.ok(amount>0n);
  const context=await readPhoenixCollateralContext({walletAddress:WALLET,minimumSlot:before.observedSlot,commitment:'confirmed'},{request:rpc,now,monotonicNow});
  const withdrawal=await preparePhoenixCollateral({context,account:before,subaccountIndex:1},{request:rpc});
  // Request the native payout independently. Never roll back a queued native
  // request by trying to unwrap canonical tokens that have not arrived yet.
  const payoutWire=buildPhoenixCollateralWire(withdrawal,{blockhash:initialized.blockhash,lastValidBlockHeight:10000});
  const payoutSimulation=await simulatePhoenixCollateral(payoutWire,{request:rpc});
  const payoutId=attemptId(label+'_WITHDRAW_REQUEST'),payoutClaim=journal.prepareCollateral({id:payoutId,workflowId,ownerAccountHash,controlRevision:revision,wire:payoutWire,simulation:payoutSimulation,request:rpc});
  const custodyOptions={ownerAccountHash,journal,request:rpc,controls:custody.controls,backupRegistry:custody.backupRegistry,riskJournal:custody.riskJournal,swapJournal:custody.swapJournal,explicitApproval:true,assertUncontended(){}};
  const payoutGrant=authorizePhoenixCollateralSigning({...custodyOptions,claim:payoutClaim,wire:payoutWire,simulation:payoutSimulation});
  const payoutSigned=custody.vault.signPhoenixCollateral(payoutGrant);assert.throws(()=>custody.vault.signPhoenixCollateral(payoutGrant));journal.markBroadcast(payoutId,ownerAccountHash);
  phases.push(await executeLocal(label+'_WITHDRAW_REQUEST',payoutSigned.serializedTxBase64));
  let payout=await reconcilePhoenixCollateral(await journal.recoveryEvidence(payoutId,ownerAccountHash),{request:rpc});assert.equal(payout.state,'CANONICAL_RECEIVED');assert.equal(payout.walletCredited,false);
  assert.equal(journal.recordFinalizedCollateral(payoutId,ownerAccountHash,payout).state,'CANONICAL_READY');
  // Reopen the actual SQLite ledger between payout phases. Only the external
  // local-chain receipt map survives; no ephemeral pre-signing grant is reused.
  journal.close();journal=openPhoenixExecutionJournal(journalPath,{allowNonPosixForTests:process.platform==='win32',now});
  payout=await reconcilePhoenixCollateral(await journal.recoveryEvidence(payoutId,ownerAccountHash),{request:rpc});
  const received=await deps.readAccount({walletAddress:WALLET,subaccountIndices:[1]});
  if(received.subaccounts[1].withdrawalQueued)throw Error('LOCAL_WITHDRAWAL_QUEUED_CLOSE_ALREADY_COMPLETE');
  assert.equal(BigInt(received.canonical.amountUnits),amount);assert.equal(received.subaccounts[1].quoteCollateralUnits,'0');
  const unwrap=await preparePhoenixCollateral({context,account:received,subaccountIndex:1,phase:'UNWRAP',amountUnits:amount.toString()},{request:rpc});
  const unwrapWire=buildPhoenixCollateralWire(unwrap,{blockhash:initialized.blockhash,lastValidBlockHeight:10000});
  const unwrapSimulation=await simulatePhoenixCollateral(unwrapWire,{request:rpc});
  const unwrapId=attemptId(label+'_UNWRAP'),unwrapClaim=journal.prepareCollateral({id:unwrapId,workflowId,ownerAccountHash,controlRevision:revision,wire:unwrapWire,simulation:unwrapSimulation,request:rpc,payout});
  const unwrapGrant=authorizePhoenixCollateralSigning({...custodyOptions,journal,claim:unwrapClaim,wire:unwrapWire,simulation:unwrapSimulation});
  const unwrapSigned=custody.vault.signPhoenixCollateral(unwrapGrant);assert.throws(()=>custody.vault.signPhoenixCollateral(unwrapGrant));journal.markBroadcast(unwrapId,ownerAccountHash);
  phases.push(await executeLocal(label+'_UNWRAP',unwrapSigned.serializedTxBase64));
  const completed=await reconcilePhoenixCollateral(await journal.recoveryEvidence(unwrapId,ownerAccountHash),{request:rpc});assert.equal(completed.state,'USDC_RECEIVED');assert.equal(completed.walletCredited,true);
  assert.equal(journal.recordFinalizedCollateral(unwrapId,ownerAccountHash,completed).state,'COMPLETE');
  assert.equal(journal.heldWorkflows(WALLET).length,0);assert.equal(journal.pending(WALLET).length,0);
  const after=await deps.readAccount({walletAddress:WALLET,subaccountIndices:[1]});
  assert.equal(BigInt(after.usdc.amountUnits),BigInt(before.usdc.amountUnits)+amount);
  assert.equal(after.canonical.amountUnits,'0');assert.equal(after.canonical.delegate,null);
  return after;
 }
 final=await settleLocal('LONG');
 initialized.blockhash=(await vm('advance-local-blockhash')).blockhash;
 workflowId='b'.repeat(64);
 // Reuse the same isolated account after settlement for the opposite side.
 const shortReview=await preparePhoenixOrderReview({...intent,side:'SHORT',clientOrderId:'12347'},deps);
 const shortNative=await readPhoenixNativeMarket(shortReview.plan,{exchangeKeys:keys,request:rpc,now,monotonicNow});
 const shortWire=await buildPhoenixOrderWire(shortReview,{client,exchangeKeys:keys,blockhash:initialized.blockhash,lastValidBlockHeight:10000,now});
 const shortSimulation=await simulatePhoenixOrder({wire:shortWire,native:shortNative,account:final},{request:rpc,now,monotonicNow});
 await executeOrder('SHORT_OPEN',shortWire,shortSimulation);
 const shortClose=await preparePhoenixCloseReview({...intent,clientOrderId:'12348'},deps);
 const shortCloseNative=await readPhoenixNativeMarket(shortClose.plan,{exchangeKeys:keys,request:rpc,now,monotonicNow});
 const shortCloseWire=await buildPhoenixOrderWire(shortClose,{client,exchangeKeys:keys,blockhash:initialized.blockhash,lastValidBlockHeight:10000,now});
 const shortClosing=await simulatePhoenixOrder({wire:shortCloseWire,native:shortCloseNative,account:shortClose.account},{request:rpc,now,monotonicNow});
 await executeOrder('SHORT_CLOSE',shortCloseWire,shortClosing);
 final=await settleLocal('SHORT');
 journal.close();journal=openPhoenixExecutionJournal(journalPath,{allowNonPosixForTests:process.platform==='win32',now});assert.equal(journal.heldWorkflows(WALLET).length,0);
 // Third lifecycle closes through the actual authenticated service/API instead
 // of the harness's direct order/settlement coordination. The transport remains
 // strictly local VM execution, including a lost response and process restart.
 initialized.blockhash=(await vm('advance-local-blockhash')).blockhash;workflowId='c'.repeat(64);
 const serviceEntry=await preparePhoenixOrderReview({...intent,clientOrderId:'12349'},deps);
 const serviceNative=await readPhoenixNativeMarket(serviceEntry.plan,{exchangeKeys:keys,request:rpc,now,monotonicNow});
 const serviceWire=await buildPhoenixOrderWire(serviceEntry,{client,exchangeKeys:keys,blockhash:initialized.blockhash,lastValidBlockHeight:10000,now});
 const serviceSimulation=await simulatePhoenixOrder({wire:serviceWire,native:serviceNative,account:final},{request:rpc,now,monotonicNow});
 await executeOrder('SERVICE_OPEN_FIXTURE',serviceWire,serviceSimulation);
 let sent=0,loseResponse=true,breakFeeAfterSend=false;const seenServiceWires=new Set();
 const makeApi=()=>{
  const service=createPhoenixManualService({controls:custody.controls,vault:custody.vault,journal,riskJournal:custody.riskJournal,swapJournal:custody.swapJournal,
   backupRegistry:custody.backupRegistry,publicClient:deps.publicClient,client,readExchangeKeys:async()=>keys,rpcRequest:rpc,now,monotonicNow,
   assertUncontended(){},isRunning:()=>true,sendRequest:async(method,params)=>{
    assert.equal(method,'sendTransaction');assert.equal(params[1].maxRetries,0);assert.ok(!seenServiceWires.has(params[0]));seenServiceWires.add(params[0]);
    phases.push(await executeLocal('SERVICE_CLOSE_STEP_'+(++sent),params[0]));
    if(breakFeeAfterSend){breakFeeAfterSend=false;failNextFeeBlockhash=true;}
    const signature=bs58.encode(Buffer.from(params[0],'base64').subarray(1,65));
    if(loseResponse){loseResponse=false;deferSignature=signature;throw Error('LOCAL_LOST_RESPONSE');}return signature;
   }});
  return createPerpsAutomationApi({controls:custody.controls,authenticate:async()=>ownerAccountHash,rateLimit:async()=>true,botPhoenix:service});
 };
 let api=makeApi();
 const makeWebClient=()=>createPhoenixManualClient({fetchImpl:(url,options)=>api(new Request(url,options)),readSessionToken:()=>'f'.repeat(64),now});
 let webClient=makeWebClient();
 const apiReview=await webClient.prepareClose(WALLET,workflowId);assert.equal(apiReview.maxSlippageBps,50);assert.equal(sent,0);
 let apiResult=await webClient.confirmClose(apiReview,true);assert.equal(apiResult.attemptState,'UNKNOWN');assert.equal(sent,1);
 await assert.rejects(()=>webClient.confirmClose(apiReview,true));
 journal.close();journal=openPhoenixExecutionJournal(journalPath,{allowNonPosixForTests:process.platform==='win32',now});api=makeApi();
 webClient=makeWebClient();
 for(let i=0;i<3&&apiResult.state!=='COMPLETE';i++)apiResult=await webClient.recoverClose(WALLET,workflowId);
 assert.equal(apiResult.state,'COMPLETE');assert.equal(apiResult.walletCredited,true);assert.equal(sent,3);
 const history=await webClient.history(WALLET);assert.equal(history.items.length,3);assert.ok(history.items.every(i=>i.netPnlUsdcUnits===null));
 const positions=await webClient.positions(WALLET);assert.equal(positions.items.length,0);
 assert.equal(JSON.stringify(history).includes(ownerAccountHash),false);assert.equal(JSON.stringify(history).includes('serializedTxBase64'),false);
 // Fourth lifecycle starts at the same-session entry client/API/service, not
 // the harness coordinator. Root/child setup is the earlier local fixture.
 initialized.blockhash=(await vm('advance-local-blockhash')).blockhash;loseResponse=true;
 const entryReview=await webClient.prepareEntry(WALLET,{symbol:'DOGE',side:'SHORT',marginUsdcUnits:'10000000',leverageTenths:30});
 assert.equal(entryReview.maxSlippageBps,50);assert.equal(entryReview.platformFeeUsdcUnits,'20000');assert.equal(sent,3);
 let entryResult=await webClient.confirmEntry(entryReview,true);assert.equal(entryResult.attemptState,'UNKNOWN');assert.equal(sent,4);
 await assert.rejects(()=>webClient.confirmEntry(entryReview,true));
 journal.close();journal=openPhoenixExecutionJournal(journalPath,{allowNonPosixForTests:process.platform==='win32',now});api=makeApi();webClient=makeWebClient();
 entryResult=await webClient.recoverEntry(WALLET,entryReview.workflowId);assert.equal(entryResult.state,'OPEN');assert.equal(sent,5);
 assert.equal(entryResult.phase,'FEE');assert.equal(entryResult.attemptState,'FINALIZED');
 await webClient.recoverEntry(WALLET,entryReview.workflowId);assert.equal(sent,5);
 const fourthClose=await webClient.prepareClose(WALLET,entryReview.workflowId);
 let fourthResult=await webClient.confirmClose(fourthClose,true);
 for(let i=0;i<3&&fourthResult.state!=='COMPLETE';i++)fourthResult=await webClient.recoverClose(WALLET,entryReview.workflowId);
 assert.equal(fourthResult.state,'COMPLETE');assert.equal(sent,8);
 assert.equal((await webClient.positions(WALLET)).items.length,0);assert.equal((await webClient.history(WALLET)).items.length,4);
 // An entry is not reported failed if its following fee preparation fails.
 initialized.blockhash=(await vm('advance-local-blockhash')).blockhash;
 const attentionReview=await webClient.prepareEntry(WALLET,{symbol:'DOGE',side:'LONG',marginUsdcUnits:'10000000',leverageTenths:30});
 breakFeeAfterSend=true;
 let attention=await webClient.confirmEntry(attentionReview,true);assert.equal(attention.state,'OPEN');assert.equal(attention.entryNeedsAttention,true);assert.equal(sent,9);
 attention=await webClient.recoverEntry(WALLET,attentionReview.workflowId);assert.equal(attention.state,'OPEN');assert.equal(attention.phase,'FEE');assert.equal(sent,10);
 const attentionClose=await webClient.prepareClose(WALLET,attentionReview.workflowId);attention=await webClient.confirmClose(attentionClose,true);
 for(let i=0;i<3&&attention.state!=='COMPLETE';i++)attention=await webClient.recoverClose(WALLET,attentionReview.workflowId);
 assert.equal(attention.state,'COMPLETE');assert.equal(sent,13);
 final=await deps.readAccount({walletAddress:WALLET,subaccountIndices:[1]});assert.equal(final.canonical.amountUnits,'0');
 console.log(JSON.stringify({stage:'PHOENIX_LOCAL_VM_LONG_SHORT_SETTLED',networkSubmissions:0,testWalletSignaturesOnly:true,userKeysUsed:false,localPayoutReceiptsVerified:true,durableWorkflowRestartVerified:true,scopedVaultAndBackupVerified:true,authenticatedCloseApiRestartVerified:true,existingSessionClientVerified:true,nativeFeePaidOnceAfterRestartVerified:true,authenticatedEntryApiRestartVerified:true,feePreparationFailureKeepsEntryVerified:true,
  programs:loaded.map(p=>({address:p.address,sha256:p.sha256})),phases,
  openingProtocolFeeUnits:simulation.protocolFeeUnits,closingProtocolFeeUnits:closing.protocolFeeUnits,
  finalQuoteCollateralUnits:final.subaccounts[1].quoteCollateralUnits,finalCanonicalUnits:final.canonical.amountUnits,
  localUsdcUnits:final.usdc.amountUnits,readyForTrading:false}));
}finally{
 journal.close();
 custody.close();
 if(dirname(journalDirectory)!==resolve(tmpdir())||!basename(journalDirectory).startsWith('jamd-phoenix-vm-'))throw Error('LOCAL_VM_TEMP_PATH');
 rmSync(journalDirectory,{recursive:true,force:false});
 client.dispose();globalThis.fetch=underlying;child.stdin.end();child.kill();
}
