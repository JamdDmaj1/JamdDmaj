// Fork PUBLIC protocol state into an in-memory VM with a fictitious wallet.
// No private keys, operator credentials or network send endpoints are used.
// Transactions are zero-signed and can execute ONLY in the local VM.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
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

const WALLET='11111111111111111111111111111112',RPC='https://solana-rpc.publicnode.com';
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
 const programs=[ID.program,ID.ember,TOKEN,ATA],programAccounts=await networkAccounts(programs),loaded=[];
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
 const rpc=async(method,params)=>{
  if(method==='getGenesisHash')return GENESIS;
  if(method==='getSlot')return initialized.slot;
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
 phases.push(await executeLocal('OPEN',wire.serializedTxBase64));
 const closeReview=await preparePhoenixCloseReview({...intent,clientOrderId:'12346'},deps);
 const closeNative=await readPhoenixNativeMarket(closeReview.plan,{exchangeKeys:keys,request:rpc,now,monotonicNow});
 const closeWire=await buildPhoenixOrderWire(closeReview,{client,exchangeKeys:keys,blockhash:initialized.blockhash,lastValidBlockHeight:10000,now});
 const closing=await simulatePhoenixOrder({wire:closeWire,native:closeNative,account:closeReview.account},{request:rpc,now,monotonicNow});
 phases.push(await executeLocal('CLOSE',closeWire.serializedTxBase64));
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
  await simulatePhoenixCollateral(payoutWire,{request:rpc});
  phases.push(await executeLocal(label+'_WITHDRAW_REQUEST',payoutWire.serializedTxBase64));
  const received=await deps.readAccount({walletAddress:WALLET,subaccountIndices:[1]});
  if(received.subaccounts[1].withdrawalQueued)throw Error('LOCAL_WITHDRAWAL_QUEUED_CLOSE_ALREADY_COMPLETE');
  assert.equal(BigInt(received.canonical.amountUnits),amount);assert.equal(received.subaccounts[1].quoteCollateralUnits,'0');
  const unwrap=await preparePhoenixCollateral({context,account:received,subaccountIndex:1,phase:'UNWRAP',amountUnits:amount.toString()},{request:rpc});
  const unwrapWire=buildPhoenixCollateralWire(unwrap,{blockhash:initialized.blockhash,lastValidBlockHeight:10000});
  await simulatePhoenixCollateral(unwrapWire,{request:rpc});
  phases.push(await executeLocal(label+'_UNWRAP',unwrapWire.serializedTxBase64));
  const after=await deps.readAccount({walletAddress:WALLET,subaccountIndices:[1]});
  assert.equal(BigInt(after.usdc.amountUnits),BigInt(before.usdc.amountUnits)+amount);
  assert.equal(after.canonical.amountUnits,'0');assert.equal(after.canonical.delegate,null);
  return after;
 }
 final=await settleLocal('LONG');
 // Reuse the same isolated account after settlement for the opposite side.
 const shortReview=await preparePhoenixOrderReview({...intent,side:'SHORT',clientOrderId:'12347'},deps);
 const shortNative=await readPhoenixNativeMarket(shortReview.plan,{exchangeKeys:keys,request:rpc,now,monotonicNow});
 const shortWire=await buildPhoenixOrderWire(shortReview,{client,exchangeKeys:keys,blockhash:initialized.blockhash,lastValidBlockHeight:10000,now});
 await simulatePhoenixOrder({wire:shortWire,native:shortNative,account:final},{request:rpc,now,monotonicNow});
 phases.push(await executeLocal('SHORT_OPEN',shortWire.serializedTxBase64));
 const shortClose=await preparePhoenixCloseReview({...intent,clientOrderId:'12348'},deps);
 const shortCloseNative=await readPhoenixNativeMarket(shortClose.plan,{exchangeKeys:keys,request:rpc,now,monotonicNow});
 const shortCloseWire=await buildPhoenixOrderWire(shortClose,{client,exchangeKeys:keys,blockhash:initialized.blockhash,lastValidBlockHeight:10000,now});
 await simulatePhoenixOrder({wire:shortCloseWire,native:shortCloseNative,account:shortClose.account},{request:rpc,now,monotonicNow});
 phases.push(await executeLocal('SHORT_CLOSE',shortCloseWire.serializedTxBase64));
 final=await settleLocal('SHORT');
 console.log(JSON.stringify({stage:'PHOENIX_LOCAL_VM_LONG_SHORT_SETTLED',networkSubmissions:0,signed:false,
  programs:loaded.map(p=>({address:p.address,sha256:p.sha256})),phases,
  openingProtocolFeeUnits:simulation.protocolFeeUnits,closingProtocolFeeUnits:closing.protocolFeeUnits,
  finalQuoteCollateralUnits:final.subaccounts[1].quoteCollateralUnits,finalCanonicalUnits:final.canonical.amountUnits,
  localUsdcUnits:final.usdc.amountUnits,readyForTrading:false}));
}finally{
 client.dispose();globalThis.fetch=underlying;child.stdin.end();child.kill();
}
