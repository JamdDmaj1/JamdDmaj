import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import bs58 from 'bs58';
import {inspectServerPerpsPreparation,prepareInspectedServerAutomation,readServerPerpsPreparationEvidence} from '../lib/perps-server-preparation.js';
import {prepareInspectedPerpsManualOrder} from '../lib/perps-manual-preparation.js';
import {createWebPerpsReviewStore} from '../lib/perps-web-review-store.js';
import {openWebPerpsSigningJournal} from '../lib/perps-web-signing-journal.js';
import {inspectWebPerpsSubmission,openWebPerpsSubmissionJournal} from '../lib/perps-web-submission-journal.js';
import {createWebPerpsBroadcaster,readWebPerpsSubmissionReceipt} from '../lib/perps-web-broadcast.js';
import {createRiskBoundWebPerpsBroadcaster} from '../lib/perps-web-risk-broadcast.js';
import {authorizeWebPerpsRisk} from '../lib/perps-web-risk-authorization.js';
import {readWebPerpsRiskSettlement,reconcileRiskBoundWebEntry,authorizeWebPerpsBarrierRelease} from '../lib/perps-web-risk-recovery.js';
import {readServerPerpsDailyAccount} from '../lib/perps-server-daily-account.js';
import {createPerpsNetworkFeeValuationReader} from '../lib/perps-network-fee-valuation.js';
import {createWebPerpsOperationStatusHandler} from '../lib/perps-web-operation-status-http.js';
import {createWebPerpsOperationStatusClient} from '../lib/perps-web-operation-status-client.js';
import {readWebPerpsFinalizedPosition,requireVerifiedWebPerpsPosition} from '../lib/perps-web-position-recovery.js';
import {decodeServerPerpsEnvelope} from '../lib/perps-server-envelope.js';
import eventLayout from '../lib/perps-event-layout.json' with {type:'json'};
import {createWebPerpsSigningReviewClient,authorizeWebPerpsOwnerSignature,readWebPerpsOwnerSignature,claimWebPerpsServerHandoff,consumeWebPerpsServerHandoff} from '../lib/perps-web-signing-review.js';
import {bindWebPerpsWalletSession,clearWebPerpsWalletSession,signReviewedWebPerpsOrder} from '../lib/perps-web-wallet-session.js';
import {selectWalletAccount} from '../lib/wallet-portfolio-store.js';
import {IDBFactory} from 'fake-indexeddb';
import {PERPS_CUSTODIES,PERPS_POOL,PERPS_PROGRAM,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {getProgramDerivedAddress} from '@solana/kit';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {reservePreparedServerPerpsAutomation} from '../lib/perps-server-reservation.js';
import {verifyOwnerSignedServerPerpsEnvelope,readOwnerSignedServerPerpsEnvelope} from '../lib/perps-server-signed-envelope.js';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault,PERPS_CUSTODY_RESTORE_REVIEW_MARKER} from '../lib/perps-custody-vault.js';
import {authorizeServerPerpsSigning} from '../lib/perps-server-signing-authorization.js';
import {emptyFixtureDailyAccount} from './helpers/perps-history-fixture.mjs';
import {createServerPerpsBroadcaster} from '../lib/perps-server-broadcast.js';
import {createServerPerpsExecutor} from '../lib/perps-server-executor.js';
import {readServerPerpsSignalFeed} from '../lib/perps-server-signal-feed.js';
import {createPerpsCustodyProvisioner} from '../lib/perps-custody-provisioning.js';
import {createServerPerpsWorker} from '../lib/perps-server-worker.js';
import {createServerPerpsActivationAuthorizer} from '../lib/perps-server-activation.js';
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js';
import {initializePerpsOperatorRecovery,createPerpsCustodyRecoveryArchive,restorePerpsCustodyRecoveryArchive} from '../lib/perps-custody-recovery.js';
const now=Date.parse('2026-10-18T12:00:00Z'),seconds=now/1000;
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
async function associated(owner,mint){return (await getProgramDerivedAddress({programAddress:'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];}
function tokenAccount(owner,amount){const b=Buffer.alloc(165);Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint)).copy(b);Buffer.from(bs58.decode(owner)).copy(b,32);b.writeBigUInt64LE(BigInt(amount),64);b[108]=1;return {owner:TOKEN,executable:false,lamports:2000000,data:[b.toString('base64'),'base64']};}
function custodyAccount(asset){
 const data=Buffer.alloc(416),id=PERPS_CUSTODIES[asset],index=asset==='SOL'?0:1;
 Buffer.from('01b830515d833f91','hex').copy(data);Buffer.from(bs58.decode(PERPS_POOL)).copy(data,8);Buffer.from(bs58.decode(id.mint)).copy(data,40);
 Buffer.alloc(32,100+index).copy(data,72);data[104]=id.decimals;data[105]=Number(id.stable);Buffer.alloc(32,110+index).copy(data,106);data[138]=2;
 data.writeBigUInt64LE(500000n,175);data[199]=1;data[202]=1;data[203]=1;Buffer.alloc(32,120+index).copy(data,384);
 return {owner:PERPS_PROGRAM,executable:false,data:[data.toString('base64'),'base64']};
}
async function fixture({exits=false,lookup=false,trusted=false,planMutation=null,ownerAddress=null,keeperSignable=false,at=now,wireNonce=40}={}){
 const seconds=at/1000;
 lookup ||= exits||trusted;
 const apiPrivate=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,21)]),format:'der',type:'pkcs8'});
 const keys=Array.from({length:19},(_,i)=>Buffer.alloc(32,i+1));keys[2]=createPublicKey(apiPrivate).export({format:'der',type:'spki'}).subarray(-32);
 const keeperKey=keeperSignable?createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,22)]),format:'der',type:'pkcs8'}):null;
 if(keeperKey)keys[1]=createPublicKey(keeperKey).export({format:'der',type:'spki'}).subarray(-32);
 const ownerKey=trusted?createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,5)]),format:'der',type:'pkcs8'}):null;
 if(ownerKey)keys[0]=createPublicKey(ownerKey).export({format:'der',type:'spki'}).subarray(-32);
 if(ownerAddress)keys[0]=Buffer.from(bs58.decode(ownerAddress));
 keys.push(Buffer.from(bs58.decode('ComputeBudget111111111111111111111111111111')),Buffer.from(bs58.decode('PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu')));
 const blockhash=bs58.encode(Buffer.alloc(32,wireNonce)),tableAddress=bs58.encode(Buffer.alloc(32,60));
 const loaded=Array.from({length:exits?4:1},(_,i)=>Buffer.alloc(32,80+i));
 let identities;
 if(trusted){
  identities=await deriveServerPerpsIdentities({walletAddress:bs58.encode(keys[0]),asset:'SOL',side:'LONG'});
  const replacements={4:identities.perpetuals,5:PERPS_POOL,6:identities.position,7:PERPS_CUSTODIES.SOL.address,8:bs58.encode(Buffer.alloc(32,120)),9:bs58.encode(Buffer.alloc(32,110)),
   10:PERPS_CUSTODIES.SOL.address,11:bs58.encode(Buffer.alloc(32,120)),12:bs58.encode(Buffer.alloc(32,110)),13:bs58.encode(Buffer.alloc(32,100)),
   16:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',17:'11111111111111111111111111111111',18:identities.eventAuthority};
  for(const [index,address]of Object.entries(replacements))keys[Number(index)]=Buffer.from(bs58.decode(address));
  keys[3]=Buffer.from(bs58.decode(await associated(bs58.encode(keys[0]),PERPS_CUSTODIES.USDC.mint)));
  keys[14]=Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint));
  if(exits)for(const [index,counter]of [[0,1],[2,2]]){
   const [request]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',Buffer.from(bs58.decode(identities.position)),u64(counter),new Uint8Array([2])]});
   loaded[index]=Buffer.from(bs58.decode(request));
   loaded[index+1]=Buffer.from(bs58.decode(await associated(request,PERPS_CUSTODIES.USDC.mint)));
  }
 }
 let table=Buffer.alloc(56+loaded.length*32);table.writeUInt32LE(1,0);table.writeBigUInt64LE(18446744073709551615n,4);table.writeBigUInt64LE(1n,12);loaded.forEach((k,i)=>k.copy(table,56+i*32));
 const account={owner:'AddressLookupTab1e1111111111111111111111111',executable:false,data:[table.toString('base64'),'base64']};
 const instruction=(program,accounts,data)=>Buffer.concat([Buffer.from([program,accounts.length,...accounts,data.length]),data]);
 const computeLimit=Buffer.alloc(5);computeLimit[0]=2;computeLimit.writeUInt32LE(100000,1);
 const computePrice=Buffer.concat([Buffer.from([3]),u64(1000)]);
 const opening=[1,2,0,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,20];
 if(lookup&&!exits)opening[3]=21;
 const openData=Buffer.concat([Buffer.from('a47e44b6dfa640b7','hex'),u64(30000000),Buffer.from([1]),u64(10000000),Buffer.from([1]),u64(100500000),u64(seconds)]);
 const instructions=[instruction(19,[],computeLimit),instruction(19,[],computePrice),instruction(20,opening,openData)];
 if(exits)for(const profit of [false,true]){
  const roles=[1,2,0,3,4,5,6,profit?23:21,profit?24:22,7,8,9,10,trusted?14:13,14,16,15,17,18,20];
  const data=Buffer.concat([Buffer.from('7562427f1e3249b9','hex'),u64(0),u64(30000000),u64(profit?110000000:95000000),Buffer.from([profit?1:0,0]),u64(profit?2:1),u64(seconds)]);
  instructions.push(instruction(20,roles,data));
 }
 let staticKeys=keys,loadedWritable=loaded.length,ledgerAddress=null,collateralAddress=null;
 if(trusted){
  const original=[...keys,...loaded],add=address=>{original.push(Buffer.from(bs58.decode(address)));return original.length-1;};
  collateralAddress=await associated(bs58.encode(keys[0]),PERPS_CUSTODIES.SOL.mint);ledgerAddress=bs58.encode(Buffer.alloc(32,61));
  const collateral=add(collateralAddress),ledger=add(ledgerAddress),transfer=add(identities.transferAuthority),usdc=add(PERPS_CUSTODIES.USDC.address),oracle=add(bs58.encode(Buffer.alloc(32,121))),vault=add(bs58.encode(Buffer.alloc(32,101))),sysvar=add('Sysvar1nstructions1111111111111111111111111');
  const longOpening=[...opening];longOpening[3]=collateral;longOpening[14]=ledger;longOpening[15]=20;
  instructions[2]=instruction(20,longOpening,Buffer.concat([Buffer.from('a47e44b6dfa640b7','hex'),u64(30000000),Buffer.from([0,1]),u64(100500000),u64(seconds)]));
  const swapRoles=[0,3,collateral,transfer,4,5,usdc,oracle,vault,7,8,13,16,sysvar,18,20];
  instructions.splice(2,0,instruction(20,[ledger,collateral,16],Buffer.from('e455b9704e4f4d02','hex')),instruction(20,swapRoles,Buffer.concat([Buffer.from('c52656a5c71726ea','hex'),u64(10000000),u64(99500000)])));
  if(planMutation==='missing-swap')instructions.splice(3,1);
  if(planMutation==='duplicate-ledger')instructions.splice(3,0,Buffer.from(instructions[2]));
  if(planMutation==='late-swap')[instructions[3],instructions[4]]=[instructions[4],instructions[3]];
  if(planMutation==='wrong-minimum')instructions[3].writeBigUInt64LE(99499999n,instructions[3].length-8);
  const readonly=[keys[16],keys[17],keys[4],keys[18],original[transfer],original[sysvar]].map(b=>b.toString('hex'));
  staticKeys=[keys[0],keys[1],keys[2],keys[19],keys[20]];
  const staticHex=staticKeys.map(b=>b.toString('hex')),unique=[...new Map([...loaded,...original].filter(b=>!staticHex.includes(b.toString('hex'))).map(b=>[b.toString('hex'),b])).values()];
  loaded.length=0;loaded.push(...unique.filter(b=>!readonly.includes(b.toString('hex'))));loadedWritable=loaded.length;loaded.push(...unique.filter(b=>readonly.includes(b.toString('hex'))));
  const resolved=[...staticKeys,...loaded],remap=i=>resolved.findIndex(b=>b.equals(original[i]));
  for(const instruction of instructions){instruction[0]=remap(instruction[0]);for(let i=0;i<instruction[1];i++)instruction[2+i]=remap(instruction[2+i]);}
  table=Buffer.alloc(56+loaded.length*32);table.writeUInt32LE(1,0);table.writeBigUInt64LE(18446744073709551615n,4);table.writeBigUInt64LE(1n,12);loaded.forEach((k,i)=>k.copy(table,56+i*32));account.data[0]=table.toString('base64');
 }
 const message=Buffer.concat([Buffer.from(lookup?[128,3,1,2,staticKeys.length]:[3,1,2,staticKeys.length]),...staticKeys,Buffer.from(bs58.decode(blockhash)),Buffer.from([instructions.length]),...instructions,
  ...(lookup?[Buffer.from([1]),Buffer.from(bs58.decode(tableAddress)),Buffer.from([loadedWritable,...loaded.slice(0,loadedWritable).map((_,i)=>i),loaded.length-loadedWritable,...loaded.slice(loadedWritable).map((_,i)=>i+loadedWritable)])]:[])]);
 const wire=Buffer.concat([Buffer.from([3]),Buffer.alloc(128),sign(null,message,apiPrivate),message]);
 assert.ok(wire.length<=1232);
 const preparation={serializedTxBase64:wire.toString('base64'),positionPubkey:bs58.encode(keys[6]),quote:{side:'long'},txMetadata:{blockhash,lastValidBlockHeight:'100000'}};
 const intent={asset:'SOL',side:'LONG',walletAddress:bs58.encode(keys[0]),marginUsd:'10',leverage:'3',referencePrice:'100',maxSlippageBps:50,stopLoss:exits?'95':null,takeProfit:exits?'110':null};
 const calls=[];
 const ledgerAccount=()=>{const b=Buffer.alloc(48);createHash('sha256').update('account:TokenLedger').digest().subarray(0,8).copy(b);Buffer.from(bs58.decode(collateralAddress)).copy(b,8);return {owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[b.toString('base64'),'base64']};};
 const request=async(method,params)=>{calls.push({method,params});
  if(method==='getGenesisHash')return GENESIS;
  if(method==='getSlot')return Math.max(50,params[0]?.minContextSlot||0);
  if(method==='getBlockHeight')return 10;
  if(method==='getMinimumBalanceForRentExemption'){assert.ok([210,230,165].includes(params[0]));return 2000000;}
  if(method==='getFeeForMessage')return {context:{slot:55},value:15100};
  if(method==='getMultipleAccounts'){
   if(params[0][0]===tableAddress){assert.deepEqual(params[0],[tableAddress]);return {context:{slot:51},value:[account]};}
   if(params[0][0]===PERPS_CUSTODIES.SOL.address){
    assert.equal(trusted,true);assert.deepEqual(params[0],[PERPS_CUSTODIES.SOL.address,PERPS_CUSTODIES.USDC.address]);
    return {context:{slot:52},value:[custodyAccount('SOL'),custodyAccount('USDC')]};
   }
   return {context:{slot:54},value:params[0].map(address=>address===intent.walletAddress?{owner:'11111111111111111111111111111111',executable:false,lamports:100000000,data:['','base64']}:address===bs58.encode(keys[3])?tokenAccount(intent.walletAddress,20000000):address===ledgerAddress?ledgerAccount():null)};
  }
  if(method==='simulateTransaction'){
   assert.equal(params[0],preparation.serializedTxBase64);assert.equal(params[1].replaceRecentBlockhash,false);assert.equal(params[1].sigVerify,false);
   const data=Buffer.alloc(210);Buffer.from('aabc8fe47a40f7d0','hex').copy(data);
   for(const [offset,key]of [[8,intent.walletAddress],[40,PERPS_POOL],[72,PERPS_CUSTODIES.SOL.address],[104,PERPS_CUSTODIES.SOL.address]])Buffer.from(bs58.decode(key)).copy(data,offset);
   data.writeBigUInt64LE(BigInt(seconds),136);data.writeBigUInt64LE(BigInt(seconds),144);data[152]=1;data.writeBigUInt64LE(100000000n,153);data.writeBigUInt64LE(30000000n,161);data.writeBigUInt64LE(9990000n,169);data[209]=identities.positionBump;
   const states=new Map([[identities.position,data]]);
   if(exits)for(const profit of [false,true]){
    const counter=profit?2:1,exit=Buffer.alloc(230);
    Buffer.from('0c26fac72e9a20d8','hex').copy(exit);
    for(const [offset,key]of [[8,intent.walletAddress],[40,PERPS_POOL],[72,PERPS_CUSTODIES.SOL.address],[104,identities.position],[136,PERPS_CUSTODIES.USDC.mint]])Buffer.from(bs58.decode(key)).copy(exit,offset);
    exit.writeBigUInt64LE(BigInt(seconds),168);exit.writeBigUInt64LE(BigInt(seconds),176);exit.writeBigUInt64LE(30000000n,184);
    exit[200]=2;exit[201]=1;exit[202]=1;exit[206]=1;exit.writeBigUInt64LE(profit?110000000n:95000000n,207);
    exit[215]=1;exit[216]=Number(profit);exit[217]=1;exit.writeBigUInt64LE(BigInt(counter),220);
    const [address,bump]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(identities.position),u64(counter),new Uint8Array([2])]});
    exit[228]=bump;states.set(address,exit);
   }
   return {context:{slot:56},value:{err:null,unitsConsumed:50000,accounts:params[1].accounts.addresses.map(address=>{
    if(states.has(address))return {owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[states.get(address).toString('base64'),'base64']};
    if(address===intent.walletAddress)return {owner:'11111111111111111111111111111111',executable:false,lamports:100000000-15100-(exits?10000000:2000000),data:['','base64']};
    if(address===bs58.encode(keys[3]))return tokenAccount(intent.walletAddress,10000000);
    if(address===ledgerAddress)return ledgerAccount();
    if(exits)for(const i of [1,3])if(address===bs58.encode(loaded[i]))return tokenAccount(bs58.encode(loaded[i-1]),0);
    return null;
   })}};
  }
  throw Error('UNEXPECTED_RPC');
 };
 return {preparation,intent,request,calls,account,table,loaded,ownerKey,keeperKey};
}
test('manual web review uses actual wallet funding and the full exact-wire inspection without custody, signing or submission',async()=>{
 const f=await fixture({exits:true,trusted:true});let clock=0;
 const draft={asset:'SOL',side:'LONG',margin:'10',leverage:'3',referencePrice:'100',stopLoss:'95',takeProfit:'110'};
 const calls=[],state={funds:20000000,sol:100000000,mutate:null};
 const request=async(method,params)=>{
  calls.push(method);const reply=await f.request(method,params);
  if(reply?.context)reply.context.slot=Math.max(reply.context.slot,params[1]?.minContextSlot||0);
  if(method==='getMultipleAccounts'&&params[0].length===8){reply.value[0].lamports=state.sol;reply.value[1]=tokenAccount(f.intent.walletAddress,state.funds);}
  if(state.mutate)state.mutate(method,params,reply);
  return reply;
 };
 let builders=0;
 const options={now:()=>now,monotonicNow:()=>clock,rpcRequest:request,builderRequest:async()=>{builders++;return Response.json(f.preparation);}};
 const review=await prepareInspectedPerpsManualOrder(draft,f.intent.walletAddress,options);
 assert.equal(review.stage,'MANUAL_PERPS_REVIEW_VALIDATED');assert.equal(review.readyForSigning,false);assert.equal(review.tradingEnabled,false);
 assert.equal(review.marginUsdcUnits,'10000000');assert.equal(review.availableUsdcUnits,'20000000');assert.equal(review.networkFeeLamports,'15100');
 assert.equal(review.rentLockedLamports,'10000000');assert.equal(review.sizeUsdUnits,'30000000');assert.equal(builders,1);
 assert.equal(Object.hasOwn(review,'serializedTxBase64'),false);assert.equal(Object.isFrozen(review),true);
 assert(calls.includes('simulateTransaction'));assert(calls.every(method=>!['sendTransaction','signTransaction','requestAirdrop'].includes(method)));
 state.funds=9999999;await assert.rejects(prepareInspectedPerpsManualOrder(draft,f.intent.walletAddress,options),/INSUFFICIENT_USDC/);assert.equal(builders,1);
 state.funds=20000000;state.sol=999999;await assert.rejects(prepareInspectedPerpsManualOrder(draft,f.intent.walletAddress,options),/INSUFFICIENT_SOL/);assert.equal(builders,1);
 state.sol=100000000;state.mutate=(method,params,reply)=>{if(method==='getMultipleAccounts'&&params[0].length===8&&params[1].minContextSlot>=56)reply.value[1]=tokenAccount(f.intent.walletAddress,9999999);};
 await assert.rejects(prepareInspectedPerpsManualOrder(draft,f.intent.walletAddress,options),/INSUFFICIENT_USDC/);
 state.mutate=method=>{if(method==='simulateTransaction')clock=15001;};await assert.rejects(prepareInspectedPerpsManualOrder(draft,f.intent.walletAddress,options));clock=0;
 state.mutate=(method,params,reply)=>{if(method==='simulateTransaction')reply.value.accounts.find(a=>a?.owner==='11111111111111111111111111111111').lamports--;};
 await assert.rejects(prepareInspectedPerpsManualOrder(draft,f.intent.walletAddress,options));
 for(const change of [{asset:'ZEC'},{margin:'1'},{serializedTxBase64:'untrusted'}])await assert.rejects(prepareInspectedPerpsManualOrder({...draft,...change},f.intent.walletAddress,options));
});

export async function webSigningFixture(t,{keeperSignable=false,at=now,wireNonce=40}={}){
 const f=await fixture({exits:true,trusted:true,keeperSignable,at,wireNonce}),draft={asset:'SOL',side:'LONG',margin:'10',leverage:'3',referencePrice:'100',stopLoss:'95',takeProfit:'110'};
 const records=new Map(),commands=[],state={time:at,mono:0,prompts:0,mode:'exact',builderCalls:0},clock=()=>state.time;
 const command=async values=>{commands.push(values[0]);const [method,key,text]=values;if(method==='SET'){if(records.has(key))return null;records.set(key,text);return 'OK';}if(method==='GET')return records.get(key)??null;throw Error();};
 const store=createWebPerpsReviewStore({command,now:clock});
 const rpcRequest=async(method,params)=>{const reply=await f.request(method,params);if(reply?.context)reply.context.slot=Math.max(reply.context.slot,params[1]?.minContextSlot||0);return reply;};
 const native=await prepareInspectedPerpsManualOrder(draft,f.intent.walletAddress,{rpcRequest,now:clock,monotonicNow:()=>state.mono,builderRequest:async()=>{state.builderCalls++;return Response.json(f.preparation);}});
 const packet=await store.prepare(native),indexedDB=new IDBFactory(),name='jamddmaj-web-perps-signing-test';
 const journal=await openWebPerpsSigningJournal({indexedDB,name,now:clock});t.after(()=>journal.close());
 const doc={hidden:false,visibilityState:'visible',hasFocus:()=>true,dispatchEvent(){}},account={address:f.intent.walletAddress,publicKey:Uint8Array.from(createPublicKey(f.ownerKey).export({format:'der',type:'spki'}).subarray(-32)),chains:['solana:mainnet'],features:['solana:signTransaction']};
 const wallet={name:'Unfunded Phantom model',chains:['solana:mainnet'],accounts:[account],features:{'solana:signTransaction':{version:'1.0.0',supportedTransactionVersions:['legacy',0],async signTransaction(input){
  state.prompts++;assert.equal(input.account,account);assert.equal(input.chain,'solana:mainnet');assert.equal(input.options.preflightCommitment,'confirmed');
  assert.equal((await journal.read(packet.reviewId)).state,'SIGNING');
  const wire=Buffer.from(input.transaction);assert.equal(wire.toString('base64'),f.preparation.serializedTxBase64);sign(null,wire.subarray(193),f.ownerKey).copy(wire,1);
  if(['changed-message','changed-resigned'].includes(state.mode))wire[wire.length-1]^=1;
  if(state.mode==='changed-resigned')sign(null,wire.subarray(193),f.ownerKey).copy(wire,1);
  if(state.mode==='changed-api')wire[129]^=1;if(state.mode==='keeper')wire[65]=1;
  if(state.mode==='missing-owner')wire.fill(0,1,65);
  if(state.mode==='account-change')selectWalletAccount(doc,{address:bs58.encode(Buffer.alloc(32,99)),source:'external',name:'another'});
  if(state.mode==='disconnect')clearWebPerpsWalletSession(doc);if(state.mode==='expired')state.time+=15001;
  if(state.mode==='reject')throw Error('User rejected fixture signature');return [{signedTransaction:Uint8Array.from(wire)}];
 }}}};
 selectWalletAccount(doc,{address:account.address,source:'external',name:wallet.name});bindWebPerpsWalletSession(doc,wallet,account);
 const client=createWebPerpsSigningReviewClient({doc,now:clock,monotonicNow:()=>state.mono,fetchImpl:async()=>Response.json({ok:true,packet})});
 return {...f,native,draft,packet,state,store,journal,indexedDB,name,command,commands,records,doc,wallet,account,client,rpcRequest,clock};
}

test('web signing joins native inspection, durable server review, committed browser claim and exactly one owner-only wallet prompt',async t=>{
 const f=await webSigningFixture(t);assert.equal(f.state.prompts,0);assert.deepEqual(f.commands,['SET','GET']);
 await assert.rejects(f.store.prepare({...f.native}));
 const revived=createWebPerpsReviewStore({command:f.command,now:f.clock});assert.deepEqual(await revived.read(f.packet.reviewId),f.packet);
 await revived.revalidate(f.packet.reviewId,{rpcRequest:f.rpcRequest,monotonicNow:()=>f.state.mono});assert.equal(f.state.builderCalls,1);
 const review=await f.client.prepare(f.draft);assert.equal(f.state.prompts,0);
 await assert.rejects(authorizeWebPerpsOwnerSignature(review,{doc:f.doc,journal:f.journal,explicitApproval:false}));
 await assert.rejects(authorizeWebPerpsOwnerSignature({...review},{doc:f.doc,journal:f.journal,explicitApproval:true}));
 const grant=await authorizeWebPerpsOwnerSignature(review,{doc:f.doc,journal:f.journal,explicitApproval:true});assert.equal(f.state.prompts,0);
 const result=await signReviewedWebPerpsOrder(f.doc,grant),signed=await readWebPerpsOwnerSignature(result,{doc:f.doc,journal:f.journal});
 assert.equal(result.readyForBroadcast,false);assert.equal(result.requiresSubmissionJournal,true);assert.equal(f.state.prompts,1);
 const before=Buffer.from(f.preparation.serializedTxBase64,'base64'),wire=Buffer.from(signed.signedBase64,'base64');assert(wire.subarray(65).equals(before.subarray(65)));
 assert.equal((await f.journal.read(f.packet.reviewId)).signedBase64,signed.signedBase64);
 await assert.rejects(signReviewedWebPerpsOrder(f.doc,grant));await assert.rejects(authorizeWebPerpsOwnerSignature(review,{doc:f.doc,journal:f.journal,explicitApproval:true}));
 const another=await openWebPerpsSigningJournal({indexedDB:f.indexedDB,name:f.name,now:f.clock});t.after(()=>another.close());
 assert.equal((await another.read(f.packet.reviewId)).state,'OWNER_SIGNED');assert.equal((await another.pending(f.account.address)).length,1);
 await assert.rejects(another.beginSigning(f.packet));assert.equal(f.state.prompts,1);assert(f.calls.every(call=>!['sendTransaction','signTransaction','requestAirdrop'].includes(call.method)));
});

test('changed wallet outputs, wallet rejection, expired approvals and lost provider bindings never become a broadcast permission',async t=>{
 for(const mode of ['changed-message','changed-resigned','changed-api','keeper','missing-owner','reject','account-change','disconnect','expired']){
  const f=await webSigningFixture(t),review=await f.client.prepare(f.draft),grant=await authorizeWebPerpsOwnerSignature(review,{doc:f.doc,journal:f.journal,explicitApproval:true});f.state.mode=mode;
  if(['changed-message','changed-resigned','changed-api','keeper','missing-owner','reject'].includes(mode)){
   await assert.rejects(signReviewedWebPerpsOrder(f.doc,grant));assert.equal((await f.journal.read(f.packet.reviewId)).state,'SIGNING');
  }else{
   const result=await signReviewedWebPerpsOrder(f.doc,grant);assert.equal((await f.journal.read(f.packet.reviewId)).state,'OWNER_SIGNED');
   await assert.rejects(readWebPerpsOwnerSignature(result,{doc:f.doc,journal:f.journal}));
  }
  await assert.rejects(signReviewedWebPerpsOrder(f.doc,grant));assert.equal(f.state.prompts,1);
 }
});

test('no active browser connection, hidden review, unsupported format, copied journal or failed durable claim can prompt a wallet',async t=>{
 for(const mode of ['watch-only','hidden','unfocused','unsupported-version','copied-journal','closed-journal','expired-before-approval']){
  const f=await webSigningFixture(t);
  if(mode==='watch-only'){clearWebPerpsWalletSession(f.doc);await assert.rejects(f.client.prepare(f.draft));}
  else if(mode==='unsupported-version'){f.wallet.features['solana:signTransaction'].supportedTransactionVersions=['legacy'];await assert.rejects(f.client.prepare(f.draft));}
  else{
   const review=await f.client.prepare(f.draft);if(mode==='hidden')f.doc.hidden=true;if(mode==='unfocused')f.doc.hasFocus=()=>false;
   if(mode==='closed-journal')f.journal.close();if(mode==='expired-before-approval')f.state.time+=15001;
   await assert.rejects(authorizeWebPerpsOwnerSignature(review,{doc:f.doc,journal:mode==='copied-journal'?{...f.journal}:f.journal,explicitApproval:true}));
  }
  assert.equal(f.state.prompts,0);
 }
});

test('two browser connections cannot claim the same signing review or create parallel pending reviews for one wallet',async t=>{
 const f=await webSigningFixture(t),other=await openWebPerpsSigningJournal({indexedDB:f.indexedDB,name:f.name,now:f.clock});t.after(()=>other.close());
 const competing=await Promise.allSettled([f.journal.beginSigning(f.packet),other.beginSigning(f.packet)]);assert.equal(competing.filter(result=>result.status==='fulfilled').length,1);
 const second=await f.store.prepare(f.native);await assert.rejects(other.beginSigning(second));assert.equal((await other.pending(f.account.address)).length,1);assert.equal(f.state.prompts,0);
});

test('an owner signature cannot be read for submission after its local durable record disappears',async t=>{
 const f=await webSigningFixture(t),review=await f.client.prepare(f.draft),grant=await authorizeWebPerpsOwnerSignature(review,{doc:f.doc,journal:f.journal,explicitApproval:true});
 const result=await signReviewedWebPerpsOrder(f.doc,grant);await assert.rejects(readWebPerpsOwnerSignature({...result},{doc:f.doc,journal:f.journal}));
 await new Promise((resolve,reject)=>{
  const request=f.indexedDB.open(f.name,1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
   const db=request.result,tx=db.transaction('operations','readwrite');tx.objectStore('operations').delete(f.packet.reviewId);
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};
  };
 });
 await assert.rejects(readWebPerpsOwnerSignature(result,{doc:f.doc,journal:f.journal}));assert.equal(f.state.prompts,1);
});

test('server handoff commits uncertainty before releasing exact bytes, is one-use and survives expiry and reload without retry',async t=>{
 const f=await webSigningFixture(t),review=await f.client.prepare(f.draft),grant=await authorizeWebPerpsOwnerSignature(review,{doc:f.doc,journal:f.journal,explicitApproval:true});
 const result=await signReviewedWebPerpsOrder(f.doc,grant);
 await assert.rejects(claimWebPerpsServerHandoff(result,{doc:f.doc,journal:f.journal,explicitApproval:false}));
 await assert.rejects(claimWebPerpsServerHandoff({...result},{doc:f.doc,journal:f.journal,explicitApproval:true}));
 const claims=await Promise.allSettled([0,1].map(()=>claimWebPerpsServerHandoff(result,{doc:f.doc,journal:f.journal,explicitApproval:true})));
 assert.equal(claims.filter(c=>c.status==='fulfilled').length,1);
 const claim=claims.find(c=>c.status==='fulfilled').value;
 assert.equal((await f.journal.read(f.packet.reviewId)).state,'SUBMISSION_UNCERTAIN');
 await assert.rejects(consumeWebPerpsServerHandoff({...claim},{doc:f.doc,journal:f.journal}));
 const wire=await consumeWebPerpsServerHandoff(claim,{doc:f.doc,journal:f.journal});
 assert.equal(wire.readyForBroadcast,false);assert.equal(wire.requiresServerSubmissionJournal,true);
 assert.equal(wire.signedBase64,(await f.journal.read(f.packet.reviewId)).signedBase64);
 await assert.rejects(consumeWebPerpsServerHandoff(claim,{doc:f.doc,journal:f.journal}));
 await assert.rejects(readWebPerpsOwnerSignature(result,{doc:f.doc,journal:f.journal}));
 await assert.rejects(claimWebPerpsServerHandoff(result,{doc:f.doc,journal:f.journal,explicitApproval:true}));
 f.state.time+=600000;f.journal.close();
 const reopened=await openWebPerpsSigningJournal({indexedDB:f.indexedDB,name:f.name,now:f.clock});t.after(()=>reopened.close());
 const row=await reopened.read(f.packet.reviewId);assert.equal(row.state,'SUBMISSION_UNCERTAIN');assert.equal(row.signedBase64,wire.signedBase64);
 assert.equal((await reopened.pending(f.account.address)).length,1);assert.equal(f.state.prompts,1);
 assert(f.calls.every(call=>!['sendTransaction','requestAirdrop'].includes(call.method)));
});

test('expired, hidden, disconnected or closed-journal handoff never releases bytes or clears the pending operation',async t=>{
 for(const mode of ['expired','hidden','disconnect','closed']){
  const f=await webSigningFixture(t),review=await f.client.prepare(f.draft),grant=await authorizeWebPerpsOwnerSignature(review,{doc:f.doc,journal:f.journal,explicitApproval:true});
  const result=await signReviewedWebPerpsOrder(f.doc,grant),claim=await claimWebPerpsServerHandoff(result,{doc:f.doc,journal:f.journal,explicitApproval:true});
  if(mode==='expired')f.state.time+=15001;if(mode==='hidden')f.doc.hidden=true;if(mode==='disconnect')clearWebPerpsWalletSession(f.doc);if(mode==='closed')f.journal.close();
  await assert.rejects(consumeWebPerpsServerHandoff(claim,{doc:f.doc,journal:f.journal}));
  f.doc.hidden=false;f.state.time=now;bindWebPerpsWalletSession(f.doc,f.wallet,f.account);
  await assert.rejects(consumeWebPerpsServerHandoff(claim,{doc:f.doc,journal:f.journal}));
  const reopened=await openWebPerpsSigningJournal({indexedDB:f.indexedDB,name:f.name,now:f.clock});t.after(()=>reopened.close());
  assert.equal((await reopened.read(f.packet.reviewId)).state,'SUBMISSION_UNCERTAIN');assert.equal(f.state.prompts,1);
 }
});

test('permanent server submission barrier accepts only fresh original native evidence and survives connection restart without TTL or retry',async t=>{
 const f=await webSigningFixture(t),review=await f.client.prepare(f.draft),grant=await authorizeWebPerpsOwnerSignature(review,{doc:f.doc,journal:f.journal,explicitApproval:true});
 const result=await signReviewedWebPerpsOrder(f.doc,grant),wire=await readWebPerpsOwnerSignature(result,{doc:f.doc,journal:f.journal});
 const directory=mkdtempSync(join(tmpdir(),'jamddmaj-web-submission-')),opened=[];t.after(()=>{for(const db of opened)db.close();rmSync(directory,{recursive:true,force:true});});
 const filename=join(directory,'journal.sqlite'),journal=openWebPerpsSubmissionJournal({filename,now:f.clock});
 const other=openWebPerpsSubmissionJournal({filename,now:f.clock});opened.push(journal,other);
 const inspect=()=>inspectWebPerpsSubmission(f.packet,wire.signedBase64,{reviewStore:f.store,rpcRequest:f.rpcRequest,now:f.clock,monotonicNow:()=>f.state.mono});
 const evidence=await inspect(),competitor=await inspect();
 assert.throws(()=>journal.claim({...evidence}));assert.equal(journal.read(f.packet.reviewId),null);
 const held=journal.claim(evidence);assert.equal(held.state,'UNCERTAIN');assert.equal(held.readyForBroadcast,false);
 assert.throws(()=>journal.claim(evidence));assert.throws(()=>other.claim(competitor));
 assert.equal(other.pending(f.account.address).signed_base64,wire.signedBase64);
 f.state.time+=3600000;journal.close();
 const reopened=openWebPerpsSubmissionJournal({filename,now:f.clock});opened.push(reopened);
 assert.equal(reopened.pending(f.account.address).state,'UNCERTAIN');assert.equal(reopened.read(f.packet.reviewId).signature,result.signature);
 assert.equal(f.state.builderCalls,1);assert.equal(f.state.prompts,1);assert(f.calls.every(c=>!['sendTransaction','requestAirdrop'].includes(c.method)));
});

test('server submission barrier rejects modified wire, expired review, copied native proof and clock rollback without writing',async t=>{
 for(const mode of ['modified-wire','expired','copied-proof','clock-rollback']){
  const f=await webSigningFixture(t),review=await f.client.prepare(f.draft),grant=await authorizeWebPerpsOwnerSignature(review,{doc:f.doc,journal:f.journal,explicitApproval:true});
  const result=await signReviewedWebPerpsOrder(f.doc,grant),wire=await readWebPerpsOwnerSignature(result,{doc:f.doc,journal:f.journal});
  const directory=mkdtempSync(join(tmpdir(),'jamddmaj-web-submission-'));
  const journal=openWebPerpsSubmissionJournal({filename:join(directory,'journal.sqlite'),now:f.clock});t.after(()=>{journal.close();rmSync(directory,{recursive:true,force:true});});
  if(mode==='clock-rollback'){
   const evidence=await inspectWebPerpsSubmission(f.packet,wire.signedBase64,{reviewStore:f.store,rpcRequest:f.rpcRequest,now:f.clock,monotonicNow:()=>f.state.mono});f.state.time--;
   assert.throws(()=>journal.claim(evidence));
  }else{
   if(mode==='expired')f.state.time+=15001;
   const changed=Buffer.from(wire.signedBase64,'base64');changed[changed.length-1]^=1;
   const reviewStore=mode==='copied-proof'?{read:async()=>f.packet,revalidate:async()=>({...f.native})}:f.store;
   await assert.rejects(inspectWebPerpsSubmission(f.packet,mode==='modified-wire'?changed.toString('base64'):wire.signedBase64,{reviewStore,rpcRequest:f.rpcRequest,now:f.clock,monotonicNow:()=>f.state.mono}));
  }
  assert.equal(journal.read(f.packet.reviewId),null);
 }
 assert.throws(()=>openWebPerpsSubmissionJournal({filename:':memory:'}));
});

async function webSubmissionFixture(t){
 const f=await webSigningFixture(t,{keeperSignable:true}),review=await f.client.prepare(f.draft),grant=await authorizeWebPerpsOwnerSignature(review,{doc:f.doc,journal:f.journal,explicitApproval:true});
 const signed=await signReviewedWebPerpsOrder(f.doc,grant),wire=await readWebPerpsOwnerSignature(signed,{doc:f.doc,journal:f.journal});
 const directory=mkdtempSync(join(tmpdir(),'jamddmaj-web-transport-')),filename=join(directory,'journal.sqlite');
 const extraJournals=[],serverJournal=openWebPerpsSubmissionJournal({filename,now:f.clock});t.after(()=>{for(const extra of extraJournals)extra.close();serverJournal.close();rmSync(directory,{recursive:true,force:true});});
 const inspect=()=>inspectWebPerpsSubmission(f.packet,wire.signedBase64,{reviewStore:f.store,rpcRequest:f.rpcRequest,now:f.clock,monotonicNow:()=>f.state.mono});
 return {...f,signed,wire,serverJournal,inspect,filename,trackJournal:journal=>{extraJournals.push(journal);return journal;}};
}

async function riskBoundWebFixture(t,{availableUsdcUnits='20000000'}={}){
 const f=await webSubmissionFixture(t),riskJournal=f.trackJournal(openPerpsExecutionJournal(f.filename.replace(/\.sqlite$/,'-risk.sqlite'),{now:f.clock}));
 const account=await emptyFixtureDailyAccount(f.account.address,{availableUsdcUnits});
 const policy={walletAddress:f.account.address,revision:'policy-1',limits:{capitalUsd:'50',dailyLossUsd:'30',positions:2,dailyTrades:5}};
 return {...f,riskJournal,dailyAccount:account,policy,readLimits:()=>structuredClone(policy),readAccount:async()=>account};
}

test('web risk coordinator atomically charges the shared ledger before either transport and blocks other entry paths after restart',async t=>{
 const f=await riskBoundWebFixture(t),id='web:'+f.packet.reviewId;let sends=0;
 const submit=createRiskBoundWebPerpsBroadcaster({journal:f.serverJournal,riskJournal:f.riskJournal,readAccount:f.readAccount,readLimits:f.readLimits,fetchImpl:async()=>{
  sends++;const risk=f.riskJournal.read(id),web=f.serverJournal.read(f.packet.reviewId);
  assert.equal(risk.state,'UNCERTAIN');assert.equal(risk.signature,web.signature);assert.equal(risk.wire_hash,web.wire_hash);assert.equal(risk.margin,10000000);
  assert.equal(JSON.parse(risk.entry_exit_plan).exits.length,2);return Response.json({action:'increase-position',txid:f.signed.signature});
 }});
 const evidence=await f.inspect(),result=await submit(evidence);assert.equal(result.stage,'WEB_PERPS_BROADCAST_ACKNOWLEDGED');assert.equal(sends,1);
 const state=f.riskJournal.riskState(f.account.address);assert.equal(state.pendingMarginUsdcUnits,'10000000');assert.equal(state.pendingCount,1);
 const other=f.trackJournal(openPerpsExecutionJournal(f.filename.replace(/\.sqlite$/,'-risk.sqlite'),{now:f.clock}));
 assert.throws(()=>other.reserve({walletAddress:f.account.address,signalId:'another-native-or-bot-entry',reservationId:'parallel',marginUsd:'10',limits:f.policy.limits,snapshot:f.dailyAccount}),/RECONCILIATION_REQUIRED/);
 assert.throws(()=>other.cancelUnsigned(id));assert.equal(other.read(id).state,'UNCERTAIN');
 await assert.rejects(submit(evidence));assert.equal(sends,1);assert.equal(f.state.prompts,1);
});

test('web risk limits, actual daily provenance, balance and policy revision fail before durable submission or transport',async t=>{
 for(const mode of ['capital','loss','balance','copied-account','policy-change','existing-pending']){
  const f=await riskBoundWebFixture(t,{availableUsdcUnits:mode==='balance'?'5000000':'20000000'});let sends=0;
  if(mode==='capital')Object.assign(f.policy.limits,{capitalUsd:'5',dailyLossUsd:'5'});if(mode==='loss')f.policy.limits.dailyLossUsd='5';
  if(mode==='existing-pending')f.riskJournal.reserve({walletAddress:f.account.address,signalId:'native-pending',reservationId:'native-pending',marginUsd:'10',limits:f.policy.limits,snapshot:f.dailyAccount});
  const submit=createRiskBoundWebPerpsBroadcaster({journal:f.serverJournal,riskJournal:f.riskJournal,readLimits:f.readLimits,readAccount:async()=>{
   if(mode==='policy-change')f.policy.revision='policy-2';return mode==='copied-account'?{...f.dailyAccount}:f.dailyAccount;
  },fetchImpl:async()=>{sends++;throw Error();}});
  await assert.rejects(submit(await f.inspect()),undefined,mode);assert.equal(sends,0);assert.equal(f.serverJournal.read(f.packet.reviewId),null);
  assert.equal(f.riskJournal.read('web:'+f.packet.reviewId),null);
 }
});

test('late web policy revocation or failed web persistence never cancels owner-signed shared risk or reaches the transport',async t=>{
 for(const mode of ['revoked-before-fetch','closed-web-journal']){
  const f=await riskBoundWebFixture(t),id='web:'+f.packet.reviewId;let sends=0;
  const readLimits=()=>{
   if(mode==='revoked-before-fetch'&&f.serverJournal.pending(f.account.address))return {...f.policy,revision:'revoked'};
   if(mode==='closed-web-journal'&&f.riskJournal.read(id)?.state==='UNCERTAIN')f.serverJournal.close();
   return structuredClone(f.policy);
  };
  const submit=createRiskBoundWebPerpsBroadcaster({journal:f.serverJournal,riskJournal:f.riskJournal,readLimits,readAccount:f.readAccount,fetchImpl:async()=>{sends++;throw Error();}});
  const evidence=await f.inspect();
  if(mode==='closed-web-journal')await assert.rejects(submit(evidence));
  else assert.equal((await submit(evidence)).stage,'WEB_PERPS_BROADCAST_UNKNOWN');
  assert.equal(sends,0);assert.equal(f.riskJournal.read(id).state,'UNCERTAIN');assert.equal(f.riskJournal.riskState(f.account.address).pendingMarginUsdcUnits,'10000000');
  assert.throws(()=>f.riskJournal.cancelUnsigned(id));
 }
});

test('web shared-risk import rejects copied grants and rolls back every nested state on a final policy check failure',async t=>{
 const f=await riskBoundWebFixture(t),id='web:'+f.packet.reviewId;
 const grant=await authorizeWebPerpsRisk(await f.inspect(),{journal:f.riskJournal,readAccount:f.readAccount,readLimits:f.readLimits});
 assert.throws(()=>f.riskJournal.reserveWebSubmission({...grant}));assert.equal(f.riskJournal.read(id),null);
 let sends=0;
 const submit=createRiskBoundWebPerpsBroadcaster({journal:f.serverJournal,riskJournal:f.riskJournal,readAccount:f.readAccount,readLimits:()=>{
  if(f.riskJournal.read(id)?.state==='UNCERTAIN')throw Error('Policy revoked during atomic import');return f.readLimits();
 },fetchImpl:async()=>{sends++;throw Error();}});
 await assert.rejects(submit(await f.inspect()));assert.equal(sends,0);assert.equal(f.riskJournal.read(id),null);
 assert.equal(f.riskJournal.riskState(f.account.address).pendingCount,0);assert.equal(f.serverJournal.read(f.packet.reviewId),null);
 // The preceding failed transaction did not leave SQLite/savepoint depth
 // poisoned; an original still-fresh authorization can commit normally.
 assert.equal(f.riskJournal.reserveWebSubmission(grant).state,'UNCERTAIN');assert.throws(()=>f.riskJournal.reserveWebSubmission(grant));
});

test('web single-attempt transport commits exact identity before the fixed Jupiter request and never equates acknowledgement with a position',async t=>{
 const f=await webSubmissionFixture(t),evidence=await f.inspect(),competing=await f.inspect();let calls=0;
 const submit=createWebPerpsBroadcaster({journal:f.serverJournal,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://perps-api.jup.ag/v2/transaction/execute');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
  assert.deepEqual(JSON.parse(options.body),{action:'increase-position',serializedTxBase64:f.wire.signedBase64});
  const row=f.serverJournal.read(f.packet.reviewId);assert.equal(row.state,'UNCERTAIN');assert.equal(row.signed_base64,f.wire.signedBase64);assert.equal(row.signature,f.signed.signature);
  return Response.json({action:'increase-position',txid:f.signed.signature});
 }});
 const result=await submit(evidence);assert.equal(result.stage,'WEB_PERPS_BROADCAST_ACKNOWLEDGED');assert.equal(result.state,'UNCERTAIN');assert.equal(result.readyForRetry,false);
 await assert.rejects(submit(evidence));await assert.rejects(submit(competing));assert.equal(calls,1);assert.equal(f.state.prompts,1);
 assert.throws(()=>createWebPerpsBroadcaster({journal:{...f.serverJournal},fetchImpl:async()=>{}}));
});

test('web transport timeout, HTTP errors, malformed replies and wrong signatures remain durably unknown without retry',async t=>{
 for(const mode of ['throw','http','redirect','wrong-signature','wrong-action','extra-key','oversized','invalid-json']){
  const f=await webSubmissionFixture(t);let calls=0;
  const submit=createWebPerpsBroadcaster({journal:f.serverJournal,fetchImpl:async()=>{
   calls++;if(mode==='throw')throw Error('Ambiguous network disconnect');
   if(mode==='http')return new Response('failure',{status:503});
   if(mode==='redirect')return {status:200,redirected:true};
   if(mode==='oversized')return new Response('x'.repeat(4097),{headers:{'Content-Type':'application/json'}});
   if(mode==='invalid-json')return new Response('{',{headers:{'Content-Type':'application/json'}});
   return Response.json({action:mode==='wrong-action'?'decrease-position':'increase-position',txid:mode==='wrong-signature'?'foreign':f.signed.signature,...(mode==='extra-key'?{extra:true}:{})});
  }});
  const evidence=await f.inspect(),result=await submit(evidence);assert.equal(result.stage,'WEB_PERPS_BROADCAST_UNKNOWN');assert.equal(result.readyForRetry,false);
  assert.equal(f.serverJournal.pending(f.account.address).state,'UNCERTAIN');await assert.rejects(submit(evidence));assert.equal(calls,1);
 }
});

test('copied, expired or lost-durable web submission authority cannot reach a transport',async t=>{
 for(const mode of ['copied','expired','closed']){
  const f=await webSubmissionFixture(t);let calls=0;
  const evidence=await f.inspect(),submit=createWebPerpsBroadcaster({journal:f.serverJournal,fetchImpl:async()=>{calls++;throw Error();}});
  if(mode==='expired')f.state.time+=15001;if(mode==='closed')f.serverJournal.close();
  await assert.rejects(submit(mode==='copied'?{...evidence}:evidence));assert.equal(calls,0);
 }
});

test('web one-attempt transport deadline aborts an in-flight request and retains its identity for recovery',async t=>{
 const f=await webSubmissionFixture(t),evidence=await f.inspect();let calls=0,aborted=false;
 const submit=createWebPerpsBroadcaster({journal:f.serverJournal,fetchImpl:async(url,{signal})=>{
  calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('Deadline'));},{once:true}));
 }});
 t.mock.timers.enable({apis:['setTimeout']});
 try{
  const pending=submit(evidence);t.mock.timers.tick(8000);
  const result=await pending;assert.equal(aborted,true);assert.equal(result.stage,'WEB_PERPS_BROADCAST_UNKNOWN');assert.equal(result.readyForRetry,false);
  assert.equal(f.serverJournal.read(f.packet.reviewId).signature,f.signed.signature);await assert.rejects(submit(evidence));assert.equal(calls,1);
 }finally{t.mock.timers.reset();}
});

test('web recovery reads only its recorded all-signer finalized identity after restart and keeps collateral held',async t=>{
 for(const failed of [false,true]){
 const f=await webSubmissionFixture(t);f.serverJournal.claim(await f.inspect());
 const finalized=Buffer.from(f.wire.signedBase64,'base64');sign(null,finalized.subarray(193),f.keeperKey).copy(finalized,65);
 const err=failed?{InstructionError:[0,'InvalidArgument']}:null;
 const slot=f.packet.review.observedSlot+5,status={slot,err,confirmationStatus:'finalized'};
 const transaction={slot,blockTime:now/1000,transaction:[finalized.toString('base64'),'base64'],meta:{err}};const calls=[];
 const rpcRequest=async(method,params)=>{calls.push({method,params});
  if(method==='getGenesisHash')return GENESIS;
  if(method==='getSignatureStatuses'){assert.equal(params[0][0],f.signed.signature);return {context:{slot:slot+1},value:[status]};}
  if(method==='getTransaction'){assert.equal(params[0],f.signed.signature);assert.equal(params[1].commitment,'finalized');return transaction;}
  throw Error('Not a read-only receipt method');
 };
 f.state.time+=600000;
 const reopened=openWebPerpsSubmissionJournal({filename:f.filename,now:f.clock});t.after(()=>reopened.close());
 const read=()=>readWebPerpsSubmissionReceipt(f.packet.reviewId,{journal:reopened,rpcRequest,now:f.clock});
 status.confirmationStatus='confirmed';assert.equal(await read(),null);assert.equal(calls.some(c=>c.method==='getTransaction'),false);
 status.confirmationStatus='finalized';const receipt=await read();assert.equal(receipt.state,failed?'FAILED':'CONFIRMED');assert.equal(receipt.confirmationStatus,'finalized');
 assert.throws(()=>reopened.recordFinalizedReceipt(f.packet.reviewId,{...receipt}));
 assert.deepEqual(reopened.readReceipt(f.packet.reviewId),receipt);
 assert.equal(reopened.pending(f.account.address).state,'UNCERTAIN');assert.equal(f.state.prompts,1);
 const original=transaction.transaction[0];const changed=Buffer.from(finalized);changed[65]^=1;transaction.transaction[0]=changed.toString('base64');await assert.rejects(read());transaction.transaction[0]=original;
 const error=failed?null:{InstructionError:[0,'InvalidArgument']};status.err=error;transaction.meta.err=error;
 await assert.rejects(read());assert.equal(reopened.pending(f.account.address).state,'UNCERTAIN');
 assert.equal(reopened.readReceipt(f.packet.reviewId).state,failed?'FAILED':'CONFIRMED');
 reopened.close();
 const recovered=openWebPerpsSubmissionJournal({filename:f.filename,now:f.clock});
 assert.deepEqual(recovered.readReceipt(f.packet.reviewId),receipt);assert.equal(recovered.pending(f.account.address).state,'UNCERTAIN');recovered.close();
 }
});

async function finalizedWebPositionFixture(t,{sharedRisk=false}={}){
 const f=await webSubmissionFixture(t);let riskJournal=null,sends=0;
 if(sharedRisk){
  riskJournal=f.trackJournal(openPerpsExecutionJournal(f.filename.replace(/\.sqlite$/,'-risk.sqlite'),{now:f.clock}));
  const account=await emptyFixtureDailyAccount(f.account.address);
  const submit=createRiskBoundWebPerpsBroadcaster({journal:f.serverJournal,riskJournal,readAccount:async()=>account,
   readLimits:()=>({walletAddress:f.account.address,revision:'policy-1',limits:{capitalUsd:'50',dailyLossUsd:'30',positions:2,dailyTrades:5}}),
   fetchImpl:async()=>{sends++;return Response.json({action:'increase-position',txid:f.signed.signature});}});
  await submit(await f.inspect());
 }else f.serverJournal.claim(await f.inspect());
 const envelope=decodeServerPerpsEnvelope(f.preparation.serializedTxBase64,f.account.address),keys=[...envelope.staticKeys,...f.loaded.map(b=>bs58.encode(b))];
 const increaseIndex=envelope.instructions.findIndex(ix=>envelope.staticKeys[ix.program]===PERPS_PROGRAM&&Buffer.from(ix.dataBase64,'base64').subarray(0,8).toString('hex')==='a47e44b6dfa640b7');
 const exits=envelope.instructions.filter(ix=>envelope.staticKeys[ix.program]===PERPS_PROGRAM&&Buffer.from(ix.dataBase64,'base64').subarray(0,8).toString('hex')==='7562427f1e3249b9').map(ix=>keys[ix.accounts[7]]);
 const addresses=[f.packet.preparation.positionPubkey,...exits];
 const post=(await f.request('simulateTransaction',[f.preparation.serializedTxBase64,{replaceRecentBlockhash:false,sigVerify:false,accounts:{addresses}}])).value.accounts;
 const finalWire=Buffer.from(f.wire.signedBase64,'base64');sign(null,finalWire.subarray(193),f.keeperKey).copy(finalWire,65);
 const slot=sharedRisk?499990:f.packet.review.observedSlot+5,ids=await deriveServerPerpsIdentities(f.intent),schema=eventLayout.events.find(e=>e.name==='InstantIncreasePositionEvent'),fields={};
 for(const [name,type]of schema.fields)fields[name]=typeof type==='object'?null:type==='publicKey'?f.account.address:type==='bool'?false:type==='u8'?0:'0';
 Object.assign(fields,{owner:f.account.address,pool:PERPS_POOL,positionKey:ids.position,positionSide:1,positionMint:PERPS_CUSTODIES.SOL.mint,
  positionCustody:PERPS_CUSTODIES.SOL.address,positionCollateralCustody:PERPS_CUSTODIES.SOL.address,positionSizeUsd:'30000000',sizeUsdDelta:'30000000',
  collateralUsdDelta:'9990000',collateralTokenDelta:'100000000',price:'100000000',openTime:String(seconds),feeUsd:'10000',positionFeeUsd:'10000'});
 const encode=(type,value)=>{if(typeof type==='object')return Buffer.from([0]);if(type==='publicKey')return Buffer.from(bs58.decode(value));
  if(type==='bool'||type==='u8')return Buffer.from([Number(value)]);const b=Buffer.alloc(8);type==='i64'?b.writeBigInt64LE(BigInt(value)):b.writeBigUInt64LE(BigInt(value));return b;};
 const encodeEvent=()=>Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),createHash('sha256').update('event:'+schema.name).digest().subarray(0,8),...schema.fields.map(([k,type])=>encode(type,fields[k]))]);
 const writable=envelope.lookups.reduce((n,lookup)=>n+lookup.writable.length,0);
 const eventIx={programIdIndex:keys.indexOf(PERPS_PROGRAM),accounts:[keys.indexOf(ids.eventAuthority)],stackHeight:2,data:''};
 const tx={slot,blockTime:seconds,transaction:[finalWire.toString('base64'),'base64'],meta:{err:null,fee:15100,
  loadedAddresses:{writable:f.loaded.slice(0,writable).map(b=>bs58.encode(b)),readonly:f.loaded.slice(writable).map(b=>bs58.encode(b))},innerInstructions:[{index:increaseIndex,instructions:[eventIx]}]}};
 const status={slot,err:null,confirmationStatus:'finalized'},state={snapshotSlot:slot,after:()=>{},network:GENESIS},recoveryCalls=[];
 const rpcRequest=async(method,params)=>{recoveryCalls.push({method,params});state.after(method);
  if(method==='getGenesisHash')return state.network;
  if(method==='getSignatureStatuses')return {context:{slot:slot+1},value:[status]};
  if(method==='getTransaction'){eventIx.data=bs58.encode(encodeEvent());return structuredClone(tx);}
  if(method==='getMultipleAccounts'){assert.deepEqual(params[0],addresses);assert.equal(params[1].commitment,'finalized');assert.equal(params[1].minContextSlot,slot);return {context:{slot:state.snapshotSlot},value:structuredClone(post)};}
  throw Error('Financial or unexpected recovery method');
 };
 return {...f,post,tx,status,fields,eventIx,riskJournal,sends,rpcRequest,recoveryState:state,recoveryCalls,readPosition:()=>readWebPerpsFinalizedPosition(f.packet.reviewId,{journal:f.serverJournal,rpcRequest,now:f.clock,monotonicNow:()=>f.state.mono})};
}

export async function sharedWebSettlementFixture(t,{failed=false}={}){
 const f=await finalizedWebPositionFixture(t,{sharedRisk:true});
 await f.journal.beginSubmission(f.packet.reviewId,{packetJson:JSON.stringify(f.packet),signedBase64:f.wire.signedBase64,signature:f.signed.signature});f.state.time+=90000;
 if(failed){f.status.err={InstructionError:[0,'InvalidArgument']};f.tx.meta.err=f.status.err;}
 const state={omitHistory:false,omitFeeValuation:false,copyAccount:false,accountChanged:false,after:()=>{}},bank=500000;
 const request=async(method,params)=>{
  state.after(method);
  if(method==='getGenesisHash'||method==='getTransaction')return f.rpcRequest(method,params);
  if(method==='getMultipleAccounts'){
   const reply=await f.request(method,params);
   const value=reply.value.map((account,i)=>{
    if(!failed&&params[0][i]===f.packet.preparation.positionPubkey)return structuredClone(f.post[0]);
    if(i===0){account.lamports=100000000-15100-(failed?0:10000000);return account;}
    if(i===1&&!failed){const b=Buffer.from(account.data[0],'base64');b.writeBigUInt64LE(10000000n,64);account.data[0]=b.toString('base64');}
    return account;
   });
   if(state.accountChanged&&!failed){const i=params[0].indexOf(f.packet.preparation.positionPubkey),b=Buffer.from(value[i].data[0],'base64');b.writeBigUInt64LE(9000000n,169);value[i].data[0]=b.toString('base64');}
   return {context:{slot:bank},value};
  }
  if(method==='getSlot')return bank;
  if(method==='getBlockTime')return params[0]===bank?f.clock()/1000-5:seconds-172800;
  if(method==='getBlocks')return [68000];if(method==='getFirstAvailableBlock')return 100;
  if(method==='getSignaturesForAddress')return state.omitHistory||![f.account.address,f.packet.preparation.positionPubkey].includes(params[0])?[]:
   [{signature:f.signed.signature,slot:f.tx.slot,blockTime:f.tx.blockTime,err:f.tx.meta.err,confirmationStatus:'finalized'}];
  throw Error('Unexpected settlement account method');
 };
 const fees=createPerpsNetworkFeeValuationReader({now:f.clock,monotonicNow:()=>f.state.mono,fetchImpl:async()=>Response.json([[Math.floor(seconds/60)*60,100,100,100,100,1]])});
 const readAccount=async input=>{
  const account=await readServerPerpsDailyAccount(input,{request,now:f.clock,monotonicNow:()=>f.state.mono,journal:f.riskJournal,...(state.omitFeeValuation?{}:{readNetworkFees:fees})});
  return state.copyAccount?{...account}:account;
 };
 const options={journal:f.serverJournal,riskJournal:f.riskJournal,rpcRequest:f.rpcRequest,readAccount,now:f.clock,monotonicNow:()=>f.state.mono};
 return {...f,settlementState:state,settlementOptions:options};
}

test('web shared-risk settlement uses rooted position and complete fee-valued history, retaining open margin or closing only a failed entry',async t=>{
 for(const failed of [false,true]){
  const f=await sharedWebSettlementFixture(t,{failed}),id='web:'+f.packet.reviewId;
  const proof=await readWebPerpsRiskSettlement(f.packet.reviewId,f.settlementOptions);assert.equal(proof.nextState,failed?'CLOSED':'OPEN');
  assert.throws(()=>f.riskJournal.reconcileWebSubmission({...proof},{webJournal:f.serverJournal}));
  assert.throws(()=>f.riskJournal.reconcileBroadcast(id,{}),/WEB_PERPS_SETTLEMENT_REQUIRED/);
  const row=f.riskJournal.reconcileWebSubmission(proof,{webJournal:f.serverJournal});assert.equal(row.state,failed?'CLOSED':'OPEN');
  assert.throws(()=>f.riskJournal.reconcileWebSubmission(proof,{webJournal:f.serverJournal}));
  const risk=f.riskJournal.riskState(f.account.address);assert.equal(risk.pendingMarginUsdcUnits,'0');assert.equal(risk.activeMarginUsdcUnits,failed?'0':'10000000');assert.equal(risk.executedToday,1);
  assert.equal(f.serverJournal.pending(f.account.address).state,'UNCERTAIN');assert.equal(f.sends,1);assert.equal(f.state.prompts,1);
  assert.equal((await reconcileRiskBoundWebEntry(f.packet.reviewId,f.settlementOptions)).state,failed?'CLOSED':'OPEN');
  assert.equal(f.riskJournal.riskState(f.account.address).executedToday,1);
 }
});

test('missing fee valuation, incomplete or copied history and changed finalized position cannot settle shared web risk',async t=>{
 for(const mode of ['fees','history','copy','position','expired']){
  const f=await sharedWebSettlementFixture(t),id='web:'+f.packet.reviewId;
  if(mode==='fees')f.settlementState.omitFeeValuation=true;if(mode==='history')f.settlementState.omitHistory=true;
  if(mode==='copy')f.settlementState.copyAccount=true;if(mode==='position')f.settlementState.accountChanged=true;
  if(mode==='expired')f.settlementState.after=method=>{if(method==='getSignaturesForAddress')f.state.mono+=10001;};
  await assert.rejects(reconcileRiskBoundWebEntry(f.packet.reviewId,f.settlementOptions),undefined,mode);
  assert.equal(f.riskJournal.read(id).state,'UNCERTAIN');assert.equal(f.riskJournal.riskState(f.account.address).pendingMarginUsdcUnits,'10000000');assert.equal(f.sends,1);
 }
});

test('web financial recovery is one-use, journal-bound and restart-idempotent without allowing a competing proof to reapply',async t=>{
 const f=await sharedWebSettlementFixture(t),id='web:'+f.packet.reviewId;
 const first=await readWebPerpsRiskSettlement(f.packet.reviewId,f.settlementOptions),second=await readWebPerpsRiskSettlement(f.packet.reviewId,f.settlementOptions);
 const other=f.trackJournal(openPerpsExecutionJournal(f.filename.replace(/\.sqlite$/,'-risk.sqlite'),{now:f.clock}));
 assert.throws(()=>other.reconcileWebSubmission(first,{webJournal:f.serverJournal}));
 assert.equal(f.riskJournal.reconcileWebSubmission(first,{webJournal:f.serverJournal}).state,'OPEN');
 assert.throws(()=>f.riskJournal.reconcileWebSubmission(second,{webJournal:f.serverJournal}));assert.equal(other.read(id).state,'OPEN');
 assert.equal(other.riskState(f.account.address).activeMarginUsdcUnits,'10000000');assert.equal(other.riskState(f.account.address).executedToday,1);
 const fresh=await readWebPerpsRiskSettlement(f.packet.reviewId,f.settlementOptions);f.state.mono+=10001;
 assert.throws(()=>f.riskJournal.reconcileWebSubmission(fresh,{webJournal:f.serverJournal}));assert.equal(other.read(id).state,'OPEN');
});

test('pending web chain history never reads settlement balances or releases the shared reserve',async t=>{
 const f=await sharedWebSettlementFixture(t);f.status.confirmationStatus='confirmed';let reads=0;
 assert.equal(await reconcileRiskBoundWebEntry(f.packet.reviewId,{...f.settlementOptions,readAccount:async()=>{reads++;throw Error();}}),null);
 assert.equal(reads,0);assert.equal(f.riskJournal.riskState(f.account.address).pendingMarginUsdcUnits,'10000000');assert.equal(f.sends,1);
});

function statusFixture(f,journal=f.journal){
 let queries=0;const handler=createWebPerpsOperationStatusHandler({journal:f.serverJournal,riskJournal:f.riskJournal,limit:async()=>{queries++;}});
 const fetchImpl=(path,options)=>{assert.equal(path,'/api/perps-operation-status');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
  assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(),['recordBinding','reviewId','signature','walletAddress']);
  return handler(new Request('https://fixture.jamddmaj.test'+path,{method:options.method,headers:{...options.headers,Origin:'https://fixture.jamddmaj.test'},body:options.body}));};
 return {handler,fetchImpl,queryCount:()=>queries,client:createWebPerpsOperationStatusClient({journal,fetchImpl,now:f.clock,monotonicNow:()=>f.state.mono})};
}

test('browser recovery consumes actual narrow persisted financial status after reload, retires only its local hold and keeps signature history',async t=>{
 for(const failed of [false,true]){
  const f=await sharedWebSettlementFixture(t,{failed});await reconcileRiskBoundWebEntry(f.packet.reviewId,f.settlementOptions);f.journal.close();
  const journal=await openWebPerpsSigningJournal({indexedDB:f.indexedDB,name:f.name,now:f.clock});t.after(()=>journal.close());
  const s=statusFixture(f,journal),proof=await s.client.inspect(f.packet.reviewId);assert.equal(proof.outcome,failed?'FAILED':'CONFIRMED');
  await assert.rejects(journal.recordServerSettlement({...proof}));assert.equal((await journal.pending(f.account.address)).length,1);
  const row=await journal.recordServerSettlement(proof);assert.equal(row.state,failed?'ENTRY_FAILED':'ENTRY_CONFIRMED');assert.equal(row.activeWallet,null);
  assert.equal(row.signedBase64,f.wire.signedBase64);assert.equal(row.signature,f.signed.signature);assert.equal((await journal.pending(f.account.address)).length,0);
  await assert.rejects(journal.recordServerSettlement(proof));assert.equal(s.queryCount(),1);assert.equal(f.sends,1);assert.equal(f.state.prompts,1);
  const reopened=await openWebPerpsSigningJournal({indexedDB:f.indexedDB,name:f.name,now:f.clock});t.after(()=>reopened.close());assert.deepEqual(await reopened.read(row.operationId),row);
  const next=await webSigningFixture(t,{at:f.clock(),wireNonce:45});await reopened.beginSigning(next.packet);
  assert.equal((await reopened.pending(f.account.address))[0].operationId,next.packet.reviewId);assert.equal((await reopened.read(row.operationId)).signature,row.signature);
 }
});

test('pending or mismatched server operation status, malformed replies and query errors never reset a browser hold',async t=>{
 const f=await sharedWebSettlementFixture(t),s=statusFixture(f);
 assert.equal(await s.client.inspect(f.packet.reviewId),null);assert.equal((await f.journal.pending(f.account.address)).length,1);
 await reconcileRiskBoundWebEntry(f.packet.reviewId,f.settlementOptions);
 for(const mode of ['signature','binding','hash','slot','state','extra','http','body']){
  const fetchImpl=async(path,options)=>{
   const response=await s.fetchImpl(path,options);if(mode==='http')return new Response('unavailable',{status:503});if(mode==='body')return Response.json({ok:true});
   const value=await response.json();
   if(mode==='signature')value.status.signature='foreign';if(mode==='binding')value.status.recordBinding='a'.repeat(64);if(mode==='hash')value.status.wireHash='b'.repeat(64);
   if(mode==='slot')value.status.confirmedSlot=0;if(mode==='state')value.status.financialState='ACTIVATED';if(mode==='extra')value.status.capital=999;
   return Response.json(value);
  };
  const client=createWebPerpsOperationStatusClient({journal:f.journal,fetchImpl,now:f.clock,monotonicNow:()=>f.state.mono});
  await assert.rejects(client.inspect(f.packet.reviewId),undefined,mode);assert.equal((await f.journal.pending(f.account.address)).length,1);
 }
});

test('operation status HTTP accepts only bounded read queries and never exposes balances, limits, rows or execution capability',async t=>{
 const f=await sharedWebSettlementFixture(t);await reconcileRiskBoundWebEntry(f.packet.reviewId,f.settlementOptions);const s=statusFixture(f);
 const input={reviewId:f.packet.reviewId,walletAddress:f.account.address,signature:f.signed.signature,recordBinding:f.packet.recordBinding};
 const request=(body=input,options={})=>new Request('https://fixture.jamddmaj.test/api/perps-operation-status'+(options.search||''),{method:options.method||'POST',headers:{'Content-Type':'application/json',Origin:options.origin||'https://fixture.jamddmaj.test'},...options.method?{}:{body:JSON.stringify(body)}});
 for(const options of [{method:'GET'},{search:'?action=execute'},{origin:'https://foreign.test'}])assert.equal((await s.handler(request(input,options))).status,options.method?405:400);
 for(const body of [{...input,action:'send'},{...input,signedBase64:f.wire.signedBase64},{...input,reviewId:'bad'},{...input,signature:''}])assert.equal((await s.handler(request(body))).status,400);
 assert.equal((await s.handler(request({...input,recordBinding:'a'.repeat(64)}))).status,200);
 const reply=await (await s.handler(request())).json();assert.equal(reply.status.stage,'WEB_PERPS_OPERATION_SETTLED');
 for(const name of ['balance','limits','risk_row_json','signedBase64','privateKey','serializedTxBase64'])assert.equal(JSON.stringify(reply).includes(name),false);
 const fail=createWebPerpsOperationStatusHandler({journal:f.serverJournal,riskJournal:f.riskJournal,limit:async()=>{throw Error('Unavailable limit store');}});
 assert.equal((await fail(request())).status,503);assert.equal(f.sends,1);
});

test('concurrent or stale browser terminal proofs cannot be applied twice or clear a later local operation',async t=>{
 const f=await sharedWebSettlementFixture(t);await reconcileRiskBoundWebEntry(f.packet.reviewId,f.settlementOptions);const s=statusFixture(f);
 const first=await s.client.inspect(f.packet.reviewId),second=await s.client.inspect(f.packet.reviewId);
 const result=await Promise.allSettled([f.journal.recordServerSettlement(first),f.journal.recordServerSettlement(second)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 const next=await webSigningFixture(t,{at:f.clock(),wireNonce:46});await f.journal.beginSigning(next.packet);
 await assert.rejects(f.journal.recordServerSettlement(first));assert.equal((await f.journal.pending(f.account.address))[0].operationId,next.packet.reviewId);
});

test('actual loopback HTTP status route reads settled journals into browser recovery without a controls or financial request',async t=>{
 const {createPerpsControlHttpServer}=await import('../lib/perps-control-http.js'),{once}=await import('node:events');
 const f=await sharedWebSettlementFixture(t);await reconcileRiskBoundWebEntry(f.packet.reviewId,f.settlementOptions);let controls=0,queries=0;
 const handler=createWebPerpsOperationStatusHandler({journal:f.serverJournal,riskJournal:f.riskJournal,limit:async()=>{queries++;}});
 const server=createPerpsControlHttpServer({handler:async()=>{controls++;throw Error();},webOperationStatusHandler:handler});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const base='http://127.0.0.1:'+server.address().port;
 const client=createWebPerpsOperationStatusClient({journal:f.journal,now:f.clock,monotonicNow:()=>f.state.mono,fetchImpl:(path,options)=>fetch(base+path,{...options,headers:{...options.headers,Origin:'https://www.jamddmaj.com'}})});
 const proof=await client.inspect(f.packet.reviewId);assert.equal((await f.journal.recordServerSettlement(proof)).state,'ENTRY_CONFIRMED');
 assert.equal(queries,1);assert.equal(controls,0);assert.equal(f.sends,1);
 const denied=await fetch(base+'/api/perps-operation-status',{method:'POST',headers:{Origin:'https://foreign.test','Content-Type':'application/json'},body:'{}'});
 assert.equal(denied.status,400);assert.equal(queries,1);
});

test('control service startup explicitly binds genuine shared journals and rejects missing or copied status configuration',async t=>{
 const {startPerpsControlService}=await import('../scripts/perps-control-service.mjs'),{once}=await import('node:events'),{createServer}=await import('node:net');
 const f=await sharedWebSettlementFixture(t);await reconcileRiskBoundWebEntry(f.packet.reviewId,f.settlementOptions);
 const directory=mkdtempSync(join(tmpdir(),'jamd-status-service-'));
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 for(const webStatus of [{},{journal:f.serverJournal,riskJournal:f.riskJournal},{journal:{...f.serverJournal},riskJournal:f.riskJournal,limit:async()=>{}},
  {journal:f.serverJournal,riskJournal:f.riskJournal,limit:async()=>{},execute:true}])assert.throws(()=>startPerpsControlService({directory,port,webStatus}));
 let queries=0,service;
 try{
  service=startPerpsControlService({directory,port,webStatus:{journal:f.serverJournal,riskJournal:f.riskJournal,limit:async()=>{queries++;}}});await once(service.server,'listening');
  const base='http://127.0.0.1:'+port;
  const health=await (await fetch(base+'/health')).json();assert.equal(health.tradingEnabled,false);assert.equal(health.executionAvailable,false);
  const response=await fetch(base+'/api/perps-operation-status',{method:'POST',headers:{Origin:'https://www.jamddmaj.com','Content-Type':'application/json'},
   body:JSON.stringify({reviewId:f.packet.reviewId,walletAddress:f.account.address,signature:f.signed.signature,recordBinding:f.packet.recordBinding})});
  assert.equal(response.status,200);assert.equal((await response.json()).status.outcome,'CONFIRMED');assert.equal(queries,1);assert.equal(f.sends,1);
 }finally{if(service)await service.close();rmSync(directory,{recursive:true,force:true});}
 // Journals belong to the runtime, not the HTTP service shutdown lifecycle.
 assert.equal(f.serverJournal.read(f.packet.reviewId).signature,f.signed.signature);assert.ok(f.riskJournal.read('web:'+f.packet.reviewId));
});

test('expired and regressed browser status clocks preserve the pending operation and require a fresh query',async t=>{
 const f=await sharedWebSettlementFixture(t);await reconcileRiskBoundWebEntry(f.packet.reviewId,f.settlementOptions);const s=statusFixture(f);
 let wall=f.clock(),mono=100;
 const client=createWebPerpsOperationStatusClient({journal:f.journal,fetchImpl:s.fetchImpl,now:()=>wall,monotonicNow:()=>mono});
 for(const change of [()=>{mono+=15001;},()=>{mono-=1;},()=>{wall+=15001;},()=>{wall-=1;}]){
  wall=f.clock();mono=100;const proof=await client.inspect(f.packet.reviewId);change();
  await assert.rejects(f.journal.recordServerSettlement(proof));assert.equal((await f.journal.pending(f.account.address)).length,1);
 }
 wall=f.clock();mono=100;const fresh=await client.inspect(f.packet.reviewId);
 assert.equal((await f.journal.recordServerSettlement(fresh)).state,'ENTRY_CONFIRMED');
 assert.equal((await f.journal.pending(f.account.address)).length,0);assert.equal(f.sends,1);
});

test('verified web settlement retires only its own wallet lock while preserving signed history and original active risk',async t=>{
 for(const failed of [false,true]){
  const f=await sharedWebSettlementFixture(t,{failed}),before=f.serverJournal.read(f.packet.reviewId);
  await reconcileRiskBoundWebEntry(f.packet.reviewId,f.settlementOptions);
  assert.equal(f.serverJournal.pending(f.account.address),null);assert.deepEqual(f.serverJournal.read(f.packet.reviewId),before);
  const record=f.serverJournal.readFinancialSettlement(f.packet.reviewId);assert.equal(record.financial_state,failed?'CLOSED':'OPEN');
  assert.equal(f.riskJournal.riskState(f.account.address).activeMarginUsdcUnits,failed?'0':'10000000');
  const reopened=openWebPerpsSubmissionJournal({filename:f.filename,now:f.clock});
  assert.deepEqual(reopened.readFinancialSettlement(f.packet.reviewId),record);assert.equal(reopened.pending(f.account.address),null);reopened.close();
  const existing=openWebPerpsSubmissionJournal({filename:f.filename,now:f.clock,requireExisting:true});
  assert.deepEqual(existing.readFinancialSettlement(f.packet.reviewId),record);assert.deepEqual(existing.read(f.packet.reviewId),before);existing.close();
 }
});

test('copied or expired release grants cannot unlock a wallet, and recovery finishes safely after the financial commit',async t=>{
 const f=await sharedWebSettlementFixture(t),proof=await readWebPerpsRiskSettlement(f.packet.reviewId,f.settlementOptions);
 assert.throws(()=>authorizeWebPerpsBarrierRelease(proof,{riskJournal:f.riskJournal,webJournal:f.serverJournal}));
 f.riskJournal.reconcileWebSubmission(proof,{webJournal:f.serverJournal});
 const grant=authorizeWebPerpsBarrierRelease(proof,{riskJournal:f.riskJournal,webJournal:f.serverJournal});
 assert.throws(()=>f.serverJournal.recordFinancialSettlement({...grant}));assert.equal(f.serverJournal.pending(f.account.address).review_id,f.packet.reviewId);
 f.state.mono+=10001;assert.throws(()=>f.serverJournal.recordFinancialSettlement(grant));assert.equal(f.serverJournal.readFinancialSettlement(f.packet.reviewId),null);
 assert.equal(f.riskJournal.riskState(f.account.address).activeMarginUsdcUnits,'10000000');
 await reconcileRiskBoundWebEntry(f.packet.reviewId,f.settlementOptions);assert.equal(f.serverJournal.pending(f.account.address),null);assert.equal(f.sends,1);
});

test('a resolved web wallet can claim one distinct next operation without an old recovery releasing the newer lock',async t=>{
 const f=await sharedWebSettlementFixture(t);await reconcileRiskBoundWebEntry(f.packet.reviewId,f.settlementOptions);
 const next=[];
 for(const wireNonce of [41,42]){
  const g=await webSigningFixture(t,{at:f.clock(),wireNonce}),review=await g.client.prepare(g.draft),grant=await authorizeWebPerpsOwnerSignature(review,{doc:g.doc,journal:g.journal,explicitApproval:true});
  const signed=await signReviewedWebPerpsOrder(g.doc,grant),wire=await readWebPerpsOwnerSignature(signed,{doc:g.doc,journal:g.journal});
  next.push({g,evidence:await inspectWebPerpsSubmission(g.packet,wire.signedBase64,{reviewStore:g.store,rpcRequest:g.rpcRequest,now:g.clock,monotonicNow:()=>g.state.mono})});
 }
 const results=await Promise.allSettled(next.map(async n=>f.serverJournal.claim(n.evidence)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const held=f.serverJournal.pending(f.account.address);assert.notEqual(held.review_id,f.packet.reviewId);
 // These are server-barrier-only fixture claims: no second trade transport,
 // new risk reservation, native wallet signature or funded transaction occurs.
 await reconcileRiskBoundWebEntry(f.packet.reviewId,{...f.settlementOptions,rpcRequest:async()=>{throw Error('Old settlement must be historical');}});
 assert.equal(f.serverJournal.pending(f.account.address).review_id,held.review_id);assert.equal(f.riskJournal.riskState(f.account.address).activeMarginUsdcUnits,'10000000');
 assert.equal(f.serverJournal.readFinancialSettlement(f.packet.reviewId).financial_state,'OPEN');assert.equal(f.sends,1);
});

test('legacy permanent-wallet-unique web storage is rejected without automatically rebuilding or erasing its pending record',async t=>{
 const f=await sharedWebSettlementFixture(t),legacy=f.filename.replace(/\.sqlite$/,'-legacy.sqlite');
 const source=new DatabaseSync(f.filename),sql=source.prepare("SELECT sql FROM sqlite_master WHERE name='web_perps_submissions'").get().sql;source.close();
 const db=new DatabaseSync(legacy);db.exec(sql.replace('wallet TEXT NOT NULL,','wallet TEXT NOT NULL UNIQUE,'));
 const row=f.serverJournal.read(f.packet.reviewId);
 db.prepare('INSERT INTO web_perps_submissions VALUES (?,?,?,?,?,?,?,?)').run(row.review_id,row.wallet,row.signature,row.wire_hash,row.state,row.packet_json,row.signed_base64,row.created);db.close();
 assert.throws(()=>openWebPerpsSubmissionJournal({filename:legacy,now:f.clock}));
 const check=new DatabaseSync(legacy);assert.deepEqual({...check.prepare('SELECT * FROM web_perps_submissions').get()},row);
 assert.equal(check.prepare("SELECT 1 FROM sqlite_master WHERE name='web_perps_wallet_locks'").get(),undefined);check.close();
});

test('web entry recovery verifies native finalized CPI size, collateral and exact pending protections without releasing funds',async t=>{
 const f=await finalizedWebPositionFixture(t),proof=await f.readPosition();
 assert.equal(requireVerifiedWebPerpsPosition(proof,{journal:f.serverJournal}),proof);
 assert.throws(()=>requireVerifiedWebPerpsPosition({...proof},{journal:f.serverJournal}));
 assert.equal(proof.stage,'WEB_PERPS_FINALIZED_ENTRY_AND_CURRENT_POSITION');assert.equal(proof.position.sizeUsdUnits,'30000000');
 assert.equal(proof.position.collateralUsdUnits,'9990000');assert.equal(proof.exits.length,2);assert.deepEqual(proof.exits.map(e=>e.kind),['SL','TP']);
 assert.equal(proof.readyForSigning,false);assert.equal(proof.requiresFinancialLedgerIntegration,true);assert.equal(f.serverJournal.pending(f.account.address).state,'UNCERTAIN');
 assert.throws(()=>f.serverJournal.recordPositionObservation({...proof}));
 const stored=f.serverJournal.recordPositionObservation(proof);assert.deepEqual(stored,proof);
 assert.throws(()=>requireVerifiedWebPerpsPosition(stored,{journal:f.serverJournal}));
 const reopened=openWebPerpsSubmissionJournal({filename:f.filename,now:f.clock});
 assert.deepEqual(reopened.readPositionObservation(f.packet.reviewId),proof);assert.equal(reopened.pending(f.account.address).state,'UNCERTAIN');reopened.close();
 assert(f.recoveryCalls.every(c=>['getGenesisHash','getTransaction','getSignatureStatuses','getMultipleAccounts'].includes(c.method)));assert.equal(f.state.prompts,1);
 f.state.time+=10001;assert.throws(()=>requireVerifiedWebPerpsPosition(proof,{journal:f.serverJournal}));
 assert.throws(()=>f.serverJournal.recordPositionObservation(proof));assert.deepEqual(f.serverJournal.readPositionObservation(f.packet.reviewId),stored);
});

test('web position recovery refuses absent positions, stale banks, altered margin, missing exits, event substitutions and clock changes',async t=>{
 for(const mode of ['position-missing','size','margin','exit-missing','exit-price','bank','event-size','event-margin','event-position-total','event-origin','event-index','unknown-event','clock','network']){
  const f=await finalizedWebPositionFixture(t);
  if(mode==='position-missing')f.post[0]=null;
  if(['size','margin'].includes(mode)){const b=Buffer.from(f.post[0].data[0],'base64');b.writeBigUInt64LE(1n,mode==='size'?161:169);f.post[0].data[0]=b.toString('base64');}
  if(mode==='exit-missing')f.post[1]=null;
  if(mode==='exit-price'){const b=Buffer.from(f.post[1].data[0],'base64');b.writeBigUInt64LE(1n,207);f.post[1].data[0]=b.toString('base64');}
  if(mode==='bank')f.recoveryState.snapshotSlot--;
  if(mode==='event-size')f.fields.sizeUsdDelta='1';if(mode==='event-margin')f.fields.collateralUsdDelta='1';if(mode==='event-position-total')f.fields.positionSizeUsd='1';
  if(mode==='event-origin')f.eventIx.stackHeight=1;if(mode==='event-index')f.tx.meta.innerInstructions[0].index=0;
  if(mode==='unknown-event')f.tx.meta.innerInstructions[0].instructions.push({...f.eventIx,data:bs58.encode(Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),Buffer.alloc(8)]))});
  if(mode==='clock')f.recoveryState.after=method=>{if(method==='getMultipleAccounts')f.state.mono+=10001;};
  if(mode==='network')f.recoveryState.network='devnet';
  await assert.rejects(f.readPosition(),undefined,mode);assert.equal(f.serverJournal.pending(f.account.address).state,'UNCERTAIN');assert.equal(f.state.prompts,1);
 }
});

test('web recovery distinguishes an entry delta from the shared aggregated native position',async t=>{
 const f=await finalizedWebPositionFixture(t),data=Buffer.from(f.post[0].data[0],'base64');
 data.writeBigUInt64LE(60000000n,161);data.writeBigUInt64LE(19980000n,169);f.post[0].data[0]=data.toString('base64');f.fields.positionSizeUsd='60000000';
 const proof=await f.readPosition();assert.equal(proof.entrySizeUsdUnits,'30000000');assert.equal(proof.entryCollateralUsdUnits,'9990000');
 assert.equal(proof.position.sizeUsdUnits,'60000000');assert.equal(proof.position.collateralUsdUnits,'19980000');
 assert.equal(proof.requiresFinancialLedgerIntegration,true);assert.equal(f.serverJournal.pending(f.account.address).state,'UNCERTAIN');
});

test('pending or failed finalized web entries never expose a current position or clear the original claim',async t=>{
 for(const mode of ['pending','failed']){
  const f=await finalizedWebPositionFixture(t);
  if(mode==='pending')f.status.confirmationStatus='confirmed';
  else{f.status.err={InstructionError:[0,'InvalidArgument']};f.tx.meta.err=f.status.err;}
  assert.equal(await f.readPosition(),null);assert.equal(f.serverJournal.readPositionObservation(f.packet.reviewId),null);
  assert.equal(f.serverJournal.pending(f.account.address).state,'UNCERTAIN');assert.equal(f.recoveryCalls.some(c=>c.method==='getMultipleAccounts'),false);
 }
});

test('expired, changed or falsely acknowledged server preparation cannot issue or resume a signing review',async t=>{
 const f=await webSigningFixture(t);
 const pretend=createWebPerpsReviewStore({now:f.clock,command:async values=>values[0]==='SET'?'OK':null});await assert.rejects(pretend.prepare(f.native));
 const key=[...f.records.keys()][0],original=f.records.get(key),value=JSON.parse(original);value.review.marginUsdcUnits='9999999';f.records.set(key,JSON.stringify(value));
 await assert.rejects(f.store.read(f.packet.reviewId));f.records.set(key,original);f.state.time+=15001;
 await assert.rejects(f.store.read(f.packet.reviewId));await assert.rejects(f.client.prepare(f.draft));assert.equal(f.state.prompts,0);
});

test('combined server gate inspects exact prepared wire, fee, core intent and RPC-resolved addresses without signing permission',async()=>{
 for(const lookup of [false,true]){
  const f=await fixture({lookup}),result=await inspectServerPerpsPreparation(f.preparation,f.intent,{request:f.request,nowSeconds:seconds});
  assert.equal(result.stage,'INSPECTED_NOT_AUTHORIZED');assert.equal(result.readyForSigning,false);
  assert.equal(result.requiresSameWireSimulation,true);assert.equal(result.requiresVerifiedCustodiesAndPdas,true);
  assert.equal(result.capabilities.priorityFeeLamports,'100');
  if(lookup){assert.equal(result.resolvedKeys[21],bs58.encode(f.loaded[0]));assert.equal(result.observedSlot,51);}
  assert.equal(f.calls.some(c=>/send|execute|sign/i.test(c.method)),false);
 }
});
test('Telegram settings and builder response feed the complete inspection chain but never become signing-ready',async t=>{
 const f=await fixture({exits:true,trusted:true});let builderCalls=0;
 const input={settings:{capital:100,loss:20,positions:2,margin:10,leverage:3,dailyTrades:5},signal:{id:'signal-1',createdAt:new Date(now).toISOString(),pair:'SOLUSDT',side:'LONG',entry:100,sl:95,tp1:110},decision:{ok:true},walletAddress:f.intent.walletAddress,snapshot:{updatedAt:now,walletAddress:f.intent.walletAddress,availableUsd:100,allocatedUsd:0,lossTodayUsd:0,openPositions:0,tradesToday:0},enabled:true,paused:false,maxSlippageBps:50,now};
 let monotonic=0;
 const result=await prepareInspectedServerAutomation(input,{nowSeconds:seconds,monotonicNow:()=>monotonic,rpcRequest:f.request,builderRequest:async()=>{builderCalls++;return new Response(JSON.stringify(f.preparation));}});
 assert.equal(builderCalls,1);assert.equal(result.inspection.core.exitCount,2);assert.equal(result.custody.position,f.preparation.positionPubkey);assert.equal(result.custody.exitCount,2);assert.equal(result.readyForSigning,false);assert.equal(result.tradingEnabled,false);
 assert.equal(result.simulation.stage,'SIMULATED_POSITION_AND_EXITS');assert.equal(result.simulation.requiresFundingAndRentChecks,true);assert.equal(result.simulation.exits.length,2);
 assert.equal(result.stage,'SIMULATED_FUNDING_AND_EXITS');assert.equal(result.funding.usdcDebitUnits,'10000000');assert.equal(result.funding.rentLockedLamports,'10000000');assert.equal(result.requiresFullTokenPolicy,true);
 assert.equal(result.fundingPlan.stage,'PRESWAP_PLAN_ONLY');assert.equal(result.fundingPlan.amountIn,'10000000');
 const evidence=readServerPerpsPreparationEvidence(result,{walletAddress:input.walletAddress,signalId:input.signal.id});
 assert.equal(evidence.readyForSigning,false);assert.equal(evidence.wireHash.length,64);assert.ok(Object.isFrozen(evidence));
 assert.throws(()=>readServerPerpsPreparationEvidence({...result},{walletAddress:input.walletAddress,signalId:input.signal.id}));
 assert.throws(()=>readServerPerpsPreparationEvidence(result,{walletAddress:input.walletAddress,signalId:'different'}));
 assert.throws(()=>readServerPerpsPreparationEvidence(result,{walletAddress:bs58.encode(Buffer.alloc(32,22)),signalId:input.signal.id}));
 assert.throws(()=>{result.preparation.serializedTxBase64='changed';});assert.throws(()=>{result.preparation.txMetadata.lastValidBlockHeight='999999';});
 assert.throws(()=>{result.review.marginUsd=1;});assert.throws(()=>{result.plan.body.sizeUsdDelta='1';});
 monotonic=15001;assert.throws(()=>readServerPerpsPreparationEvidence(result,{walletAddress:input.walletAddress,signalId:input.signal.id}));
 monotonic=-1;assert.throws(()=>readServerPerpsPreparationEvidence(result,{walletAddress:input.walletAddress,signalId:input.signal.id}));monotonic=0;
 const dir=mkdtempSync(join(tmpdir(),'jamd-prepared-reservation-')),path=join(dir,'journal.sqlite');
 const journal=openPerpsExecutionJournal(path,{now:()=>now});
 t.after(()=>{journal.close();rmSync(dir,{recursive:true,force:true});});
 const controls={walletAddress:input.walletAddress,revision:'rev-1',enabled:true,paused:false,settings:input.settings};
 const account={walletAddress:input.walletAddress,network:'solana-mainnet',balancesComplete:true,observedSlot:56,observedAt:now,day:'2026-10-18',availableUsdcUnits:'100000000',allocatedUsdcUnits:'0',lossTodayUsdcUnits:'0',openPositions:0,tradesToday:0};
 const reservationOptions={journal,walletAddress:input.walletAddress,signalId:input.signal.id,reservationId:'reserved-signal-1',controlRevision:'rev-1',readControls:async()=>controls,readAccount:async request=>{assert.equal(request.minimumSlot,56);return account;}};
 for(const changed of [{enabled:false},{paused:true},{revision:'rev-2'},{settings:{...input.settings,margin:11}},{walletAddress:bs58.encode(Buffer.alloc(32,9))}]){
  await assert.rejects(reservePreparedServerPerpsAutomation(result,{...reservationOptions,readControls:async()=>({...controls,...changed})}));
 }
 let controlReads=0;await assert.rejects(reservePreparedServerPerpsAutomation(result,{...reservationOptions,readControls:async()=>++controlReads===1?controls:{...controls,paused:true}}));
 for(const changed of [{observedSlot:55},{balancesComplete:false},{observedAt:now-10001},{availableUsdcUnits:'9999999'},{network:'solana-devnet'},{lossTodayUsdcUnits:'20000000'}]){
  await assert.rejects(reservePreparedServerPerpsAutomation(result,{...reservationOptions,readAccount:async()=>({...account,...changed})}));
 }
 assert.equal(journal.pending(input.walletAddress).length,0);
 const reserved=await reservePreparedServerPerpsAutomation(result,reservationOptions);
 assert.equal(reserved.stage,'RESERVED_NOT_AUTHORIZED');assert.equal(reserved.readyForSigning,false);assert.equal(reserved.reservation.margin,10000000);
 assert.equal(journal.pending(input.walletAddress).length,1);
 await assert.rejects(reservePreparedServerPerpsAutomation(result,{...reservationOptions,reservationId:'duplicate'}),/DUPLICATE_SIGNAL/);
 const reopened=openPerpsExecutionJournal(path,{now:()=>now});try{assert.equal(reopened.read('reserved-signal-1').state,'RESERVED');}finally{reopened.close();}
 const signed=Buffer.from(result.preparation.serializedTxBase64,'base64');sign(null,signed.subarray(193),f.ownerKey).copy(signed,1);
 const signatureOptions={journal,reservationId:'reserved-signal-1',walletAddress:input.walletAddress,signalId:input.signal.id};
 assert.throws(()=>verifyOwnerSignedServerPerpsEnvelope(result,signed.toString('base64'),signatureOptions));
 journal.beginSigning('reserved-signal-1');
 const checkedSignature=verifyOwnerSignedServerPerpsEnvelope(result,signed.toString('base64'),signatureOptions);
 assert.equal(checkedSignature.readyForBroadcast,false);assert.equal(checkedSignature.signature,bs58.encode(signed.subarray(1,65)));
 assert.equal(readOwnerSignedServerPerpsEnvelope(checkedSignature).signedBase64,signed.toString('base64'));
 assert.throws(()=>readOwnerSignedServerPerpsEnvelope({...checkedSignature}));
 for(const offset of [0,1,65,129,193,signed.length-1]){const changed=Buffer.from(signed);changed[offset]^=1;assert.throws(()=>verifyOwnerSignedServerPerpsEnvelope(result,changed.toString('base64'),signatureOptions));}
 assert.throws(()=>verifyOwnerSignedServerPerpsEnvelope(result,signed.toString('base64')+'\n',signatureOptions));
 assert.throws(()=>journal.cancelUnsigned('reserved-signal-1'),/RECONCILIATION_REQUIRED/);
 monotonic=15001;assert.throws(()=>readOwnerSignedServerPerpsEnvelope(checkedSignature));monotonic=0;
 journal.recordBroadcastIntent('reserved-signal-1',{wireHash:checkedSignature.wireHash,signature:checkedSignature.signature});
 assert.throws(()=>readOwnerSignedServerPerpsEnvelope(checkedSignature));assert.equal(journal.read('reserved-signal-1').state,'UNCERTAIN');
 let slowClock=0;
 await assert.rejects(prepareInspectedServerAutomation(input,{nowSeconds:seconds,monotonicNow:()=>slowClock,rpcRequest:f.request,builderRequest:async()=>{
  slowClock=15001;return new Response(JSON.stringify(f.preparation));
 }}));
 for(const planMutation of ['missing-swap','duplicate-ledger','late-swap','wrong-minimum']){
  const bad=await fixture({exits:true,trusted:true,planMutation});
  await assert.rejects(prepareInspectedServerAutomation(input,{nowSeconds:seconds,rpcRequest:bad.request,builderRequest:async()=>new Response(JSON.stringify(bad.preparation))}));
  assert.equal(bad.calls.some(c=>c.method==='simulateTransaction'),false);
 }
 // A successful program simulation is insufficient: these spending/exit-token
 // mutations must reject the actual configured Telegram preparation pipeline.
 for(const change of ['extra-usdc','extra-sol','exit-token-amount','exit-token-owner','missing-exit-token']){
  await assert.rejects(prepareInspectedServerAutomation(input,{nowSeconds:seconds,builderRequest:async()=>new Response(JSON.stringify(f.preparation)),rpcRequest:async(m,p)=>{
   const reply=await f.request(m,p);if(m!=='simulateTransaction')return reply;
   const addresses=p[1].accounts.addresses,values=reply.value.accounts;
   if(change==='extra-sol')values[addresses.indexOf(input.walletAddress)].lamports--;
   else if(change==='extra-usdc'){
    const account=values.find(a=>a?.owner===TOKEN&&Buffer.from(a.data[0],'base64').readBigUInt64LE(64)===10000000n);
    const b=Buffer.from(account.data[0],'base64');b.writeBigUInt64LE(9999999n,64);account.data[0]=b.toString('base64');
   }else{
    const index=addresses.indexOf(bs58.encode(f.loaded[1]));
    if(change==='missing-exit-token')values[index]=null;
    else{const b=Buffer.from(values[index].data[0],'base64');if(change==='exit-token-amount')b.writeBigUInt64LE(1n,64);else b[32]^=1;values[index].data[0]=b.toString('base64');}
   }
   return reply;
  }}));
 }
 assert.equal(f.calls.some(c=>/send|execute|signTransaction/i.test(c.method)),false);
});
test('table identity, bank slot, warmup, activation and distinct addresses fail closed',async()=>{
 for(const mutate of [
  f=>{f.account.owner=f.intent.walletAddress;},f=>{f.account.executable=true;},
  f=>{f.table.writeBigUInt64LE(1n,4);f.account.data[0]=f.table.toString('base64');},
  f=>{f.table.writeBigUInt64LE(51n,12);f.account.data[0]=f.table.toString('base64');},
  f=>{f.table.writeBigUInt64LE(52n,12);f.account.data[0]=f.table.toString('base64');},
  f=>{Buffer.from(bs58.decode(f.intent.walletAddress)).copy(f.table,56);f.account.data[0]=f.table.toString('base64');},
  f=>{f.account.data[0]+='\n';}
 ]){
  const f=await fixture({lookup:true});mutate(f);await assert.rejects(inspectServerPerpsPreparation(f.preparation,f.intent,{request:f.request,nowSeconds:seconds}));
 }
 const f=await fixture({lookup:true});
 await assert.rejects(inspectServerPerpsPreparation(f.preparation,f.intent,{request:async(m,p)=>m==='getMultipleAccounts'?{context:{slot:49},value:[f.account]}:f.request(m,p),nowSeconds:seconds}));
});
test('changed network, blockhash, expired instruction or mismatched intent cannot pass the combined gate',async()=>{
 const f=await fixture();
 for(const options of [{nowSeconds:seconds+31},{minimumSlot:51,request:(m,p)=>m==='getSlot'?50:f.request(m,p)},{request:async()=> 'wrong-network'}]){
  await assert.rejects(inspectServerPerpsPreparation(f.preparation,f.intent,{request:f.request,nowSeconds:seconds,...options}));
 }
 await assert.rejects(inspectServerPerpsPreparation({...f.preparation,txMetadata:{...f.preparation.txMetadata,blockhash:f.intent.walletAddress}},f.intent,{request:f.request,nowSeconds:seconds}));
 await assert.rejects(inspectServerPerpsPreparation(f.preparation,{...f.intent,side:'SHORT'},{request:f.request,nowSeconds:seconds}));
});

// Full signing rehearsal: ephemeral, unfunded local keys and mocked read-only
// RPC/builder responses. No HTTP submission or real account key is involved.
async function custodySigningFixture(t,{beginSigning=true,reserve=true,ownerIndexed=false}={}){
 const directory=mkdtempSync(join(tmpdir(),'jamd-custody-signing-')),wallets=join(directory,'wallets'),keysDirectory=join(directory,'keys');
 mkdirSync(wallets,{mode:0o700});mkdirSync(keysDirectory,{mode:0o700});
 const keyFile=join(keysDirectory,'master.key'),allowNonPosixForTests=process.platform==='win32',ownerAccountHash='a'.repeat(64),clock={value:0};
 let controls,journal,backupRegistry;t.after(()=>{try{try{backupRegistry?.close();}catch{}controls?.close();}finally{journal?.close();rmSync(directory,{recursive:true,force:true});}});
 createPerpsCustodyMasterKey(keyFile,{allowNonPosixForTests});const vault=openPerpsCustodyVault({directory:wallets,keyFile,allowNonPosixForTests});
 const wallet=vault[ownerIndexed?'createOrReadExclusiveWallet':'createExclusiveWallet']({ownerAccountHash,explicitCustodyApproval:true}),walletAddress=wallet.walletAddress;
 let daily=await emptyFixtureDailyAccount(walletAddress,{monotonicNow:()=>clock.value});
 const settings={capital:100,loss:20,positions:2,margin:10,leverage:3,dailyTrades:5};
 controls=openPerpsAutomationControls(join(directory,'controls.sqlite'),{now:()=>now,monotonicNow:()=>clock.value,
  authorizeActivation:async()=>({custodyAuthorized:vault.describe(wallet).exclusive,executionReady:true,dailyAccount:daily})});
 const initial=ownerIndexed?createPerpsCustodyProvisioner({vault,controls}).provision({ownerAccountHash,settings,explicitCustodyApproval:true}).controls:controls.provision({ownerAccountHash,walletAddress,settings});
 const approval=controls.issueActivationChallenge({ownerAccountHash,walletAddress,expectedRevision:initial.revision});
 const active=await controls.activate({ownerAccountHash,walletAddress,expectedRevision:initial.revision,token:approval.token,explicitApproval:true});
 journal=openPerpsExecutionJournal(join(directory,'journal.sqlite'),{now:()=>now});
 const f=await fixture({exits:true,trusted:true,ownerAddress:walletAddress});
 const input={settings:active.settings,signal:{id:'custody-signal-1',createdAt:new Date(now).toISOString(),pair:'SOLUSDT',side:'LONG',entry:100,sl:95,tp1:110},
  decision:{ok:true},walletAddress,snapshot:{updatedAt:now,walletAddress,availableUsd:20,allocatedUsd:0,lossTodayUsd:0,openPositions:0,tradesToday:0},enabled:true,paused:false,maxSlippageBps:50,now};
 const prepared=await prepareInspectedServerAutomation(input,{nowSeconds:seconds,monotonicNow:()=>clock.value,rpcRequest:f.request,builderRequest:async()=>new Response(JSON.stringify(f.preparation))});
 const args={journal,controls,ownerAccountHash,walletAddress,signalId:input.signal.id,reservationId:'custody-reservation-1',controlRevision:active.revision,
  readAccount:async()=>daily,monotonicNow:()=>clock.value};
 if(reserve){await reservePreparedServerPerpsAutomation(prepared,{...args,readControls:async()=>controls.readForExecutor({walletAddress})});if(beginSigning)journal.beginSigning(args.reservationId);}
 // Genuine operator restore proof for this ephemeral UNFUNDED wallet. No mock
 // readiness boolean is accepted by the production signing/broadcast gates.
 const recoveryOptions={allowNonPosixForTests,now:()=>now,monotonicNow:()=>clock.value},controlsPath=join(directory,'controls.sqlite'),journalPath=join(directory,'journal.sqlite');
 for(const path of [controlsPath,journalPath])chmodSync(path,0o600);
 const operatorDirectory=join(directory,'operator'),operator=await initializePerpsOperatorRecovery({directory:operatorDirectory,...recoveryOptions});
 const archive=await createPerpsCustodyRecoveryArchive({directory:wallets,keyFile,recipient:operator.recipient,explicitOperatorApproval:true,requireRestoreProof:true,runtimePaths:{controlsPath,journalPath,temporaryDirectory:directory},...recoveryOptions});
 backupRegistry=openPerpsBackupRegistry(join(directory,'backup.sqlite'),recoveryOptions);await backupRegistry.registerArchive(archive,{explicitOperatorApproval:true});
 const restored=await restorePerpsCustodyRecoveryArchive({ciphertext:archive.ciphertext,operatorDirectory,destinationDirectory:join(directory,'restored'),explicitOperatorApproval:true,...recoveryOptions});
 backupRegistry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true});args.backupRegistry=backupRegistry;
 return {prepared,args,vault,controls,journal,backupRegistry,backupArchiveSha:archive.sha256,clock,wallet,daily,walletDirectory:wallets,rpcRequest:f.request,builderRequest:async()=>new Response(JSON.stringify(f.preparation)),
  async replaceBalance(units){daily=await emptyFixtureDailyAccount(walletAddress,{availableUsdcUnits:units,monotonicNow:()=>clock.value});}};
}

test('exclusive custody signs only the inspected reserved operation once, preserving keeper/API/message bytes',async t=>{
 const f=await custodySigningFixture(t),grant=await authorizeServerPerpsSigning(f.prepared,f.args);
 assert.throws(()=>f.vault.signPrepared({...grant}));
 const signed=f.vault.signPrepared(grant),original=Buffer.from(f.prepared.preparation.serializedTxBase64,'base64'),wire=Buffer.from(readOwnerSignedServerPerpsEnvelope(signed).signedBase64,'base64');
 assert.equal(signed.readyForBroadcast,false);assert.equal(signed.walletAddress,f.wallet.walletAddress);
 assert.notEqual(wire.subarray(1,65).toString('hex'),original.subarray(1,65).toString('hex'));assert.deepEqual(wire.subarray(65),original.subarray(65));
 assert.equal(signed.signature,bs58.encode(wire.subarray(1,65)));assert.equal(f.journal.read(f.args.reservationId).state,'SIGNING');
 assert.throws(()=>f.vault.signPrepared(grant));assert.equal(f.journal.pending(f.wallet.walletAddress).length,1);
});
test('runtime activation approval binds actual backup, exclusive custody, reconciled account and live worker without activating anything',async t=>{
 const f=await custodySigningFixture(t,{reserve:false}),state=f.controls.read(f.args);let running=true,reads=0;
 const options={controls:f.controls,vault:f.vault,backupRegistry:f.backupRegistry,journal:f.journal,readAccount:async()=>{reads++;return f.daily;},isExecutionRunning:()=>running};
 const input={...f.args,revision:state.revision,settings:state.settings};
 const approval=await createServerPerpsActivationAuthorizer(options)(input);assert.equal(approval.dailyAccount,f.daily);approval.revalidate();assert.equal(reads,1);
 running=false;assert.throws(()=>approval.revalidate());await assert.rejects(createServerPerpsActivationAuthorizer(options)(input));assert.equal(reads,1);running=true;
 f.backupRegistry.revokeArchive({archiveSha256:f.backupArchiveSha,explicitOperatorApproval:true});assert.throws(()=>approval.revalidate());await assert.rejects(createServerPerpsActivationAuthorizer(options)(input));assert.equal(reads,1);
 assert.equal(f.journal.pending(f.args.walletAddress).length,0);
});
test('activation rechecks backup after async risk and rejects forged daily accounts or unresolved entries',async t=>{
 for(const kind of ['revoke','forged','pending','absent-position','quarantine']){
  const f=await custodySigningFixture(t,{reserve:kind==='pending'}),state=f.controls.read(f.args);let reads=0;
  if(kind==='quarantine')writeFileSync(join(f.walletDirectory,PERPS_CUSTODY_RESTORE_REVIEW_MARKER),'{}');
  const authorize=createServerPerpsActivationAuthorizer({controls:f.controls,vault:f.vault,backupRegistry:f.backupRegistry,
   journal:kind==='absent-position'?{...f.journal,openPositions:()=>[{position_address:'unreconciled'}]}:f.journal,isExecutionRunning:()=>true,
   readAccount:async()=>{reads++;if(kind==='revoke')f.backupRegistry.revokeArchive({archiveSha256:f.backupArchiveSha,explicitOperatorApproval:true});return kind==='forged'?{...f.daily}:f.daily;}});
  await assert.rejects(authorize({...f.args,revision:state.revision,settings:state.settings}));
  if(['pending','quarantine'].includes(kind))assert.equal(reads,0);
 }
});
test('durable activation commit revalidates private runtime approval after the callback has resolved',async t=>{
 const f=await custodySigningFixture(t,{reserve:false}),state=f.controls.pause(f.args);
 const authorizer=createServerPerpsActivationAuthorizer({controls:f.controls,vault:f.vault,backupRegistry:f.backupRegistry,journal:f.journal,readAccount:async()=>f.daily,isExecutionRunning:()=>true});
 const second=openPerpsAutomationControls(join(f.walletDirectory,'..','controls.sqlite'),{now:()=>now,monotonicNow:()=>f.clock.value,authorizeActivation:async input=>{
  const approval=await authorizer(input);f.backupRegistry.revokeArchive({archiveSha256:f.backupArchiveSha,explicitOperatorApproval:true});return approval;
 }});
 try{
  const review=second.issueActivationChallenge({...f.args,expectedRevision:state.revision});
  await assert.rejects(second.activate({...f.args,expectedRevision:state.revision,token:review.token,explicitApproval:true}));
  assert.equal(second.read(f.args).paused,true);assert.equal(second.read(f.args).revision,state.revision);
 }finally{second.close();}
});
test('the real runtime callback permits one explicit fixture activation only with a verified backup and reconciled budget',async t=>{
 const f=await custodySigningFixture(t,{reserve:false}),paused=f.controls.pause(f.args);
 const authorizeActivation=createServerPerpsActivationAuthorizer({controls:f.controls,vault:f.vault,backupRegistry:f.backupRegistry,journal:f.journal,readAccount:async()=>f.daily,isExecutionRunning:()=>true});
 const second=openPerpsAutomationControls(join(f.walletDirectory,'..','controls.sqlite'),{now:()=>now,monotonicNow:()=>f.clock.value,authorizeActivation});
 try{
  const review=second.issueActivationChallenge({...f.args,expectedRevision:paused.revision}),request={...f.args,expectedRevision:paused.revision,token:review.token,explicitApproval:true};
  const active=await second.activate(request);assert.equal(active.enabled,true);assert.equal(active.paused,false);assert.notEqual(active.revision,paused.revision);
  await assert.rejects(second.activate(request));assert.equal(f.journal.pending(f.args.walletAddress).length,0);
 }finally{second.close();}
});
test('restore quarantine blocks an already-issued private signing grant and retains pending collateral',async t=>{
 const f=await custodySigningFixture(t),grant=await authorizeServerPerpsSigning(f.prepared,f.args);
 writeFileSync(join(f.walletDirectory,PERPS_CUSTODY_RESTORE_REVIEW_MARKER),'{}',{mode:0o600});
 assert.equal(f.vault.describe(f.wallet).exclusive,false);assert.throws(()=>f.vault.signPrepared(grant));
 assert.equal(f.journal.read(f.args.reservationId).state,'SIGNING');assert.equal(f.journal.pending(f.wallet.walletAddress).length,1);
});

test('signing authority requires durable SIGNING state, private daily evidence, owner and exact current configuration',async t=>{
 const f=await custodySigningFixture(t,{beginSigning:false});
 await assert.rejects(authorizeServerPerpsSigning(f.prepared,f.args));f.journal.beginSigning(f.args.reservationId);
 for(const changes of [{ownerAccountHash:'b'.repeat(64)},{controlRevision:'old-revision'},{signalId:'other-signal'},{readAccount:async()=>({...f.daily})}]){
  await assert.rejects(authorizeServerPerpsSigning(f.prepared,{...f.args,...changes}));
 }
 await assert.rejects(authorizeServerPerpsSigning({...f.prepared},f.args));
 await f.replaceBalance('9999999');await assert.rejects(authorizeServerPerpsSigning(f.prepared,f.args),/INSUFFICIENT_UNRESERVED_BALANCE/);
 assert.equal(f.journal.read(f.args.reservationId).state,'SIGNING');
});
test('a pause or expired short authorization prevents key use and leaves signed-or-unknown funds held',async t=>{
 const paused=await custodySigningFixture(t),grant=await authorizeServerPerpsSigning(paused.prepared,paused.args);
 paused.controls.pause({ownerAccountHash:paused.args.ownerAccountHash,walletAddress:paused.wallet.walletAddress});
 assert.throws(()=>paused.vault.signPrepared(grant));assert.equal(paused.journal.read(paused.args.reservationId).state,'SIGNING');
 const expired=await custodySigningFixture(t),old=await authorizeServerPerpsSigning(expired.prepared,expired.args);expired.clock.value=2001;
 assert.throws(()=>expired.vault.signPrepared(old));assert.equal(expired.journal.read(expired.args.reservationId).state,'SIGNING');
});
test('pause during the authorization read is rechecked before any custody signature is returned',async t=>{
 const f=await custodySigningFixture(t);let reads=0;
 const controls={read(args){const value=f.controls.read(args);if(++reads===3)f.controls.pause(args);return value;}};
 const grant=await authorizeServerPerpsSigning(f.prepared,{...f.args,controls});
 assert.throws(()=>f.vault.signPrepared(grant));assert.equal(f.journal.read(f.args.reservationId).state,'SIGNING');
});
test('broadcast writes the exact identity before one fixed-endpoint attempt and does not equate an acknowledgement with a position',async t=>{
 const f=await custodySigningFixture(t),signed=f.vault.signPrepared(await authorizeServerPerpsSigning(f.prepared,f.args));let calls=0;
 const broadcast=createServerPerpsBroadcaster({...f.args,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://perps-api.jup.ag/v2/transaction/execute');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.method,'POST');
  const row=f.journal.read(f.args.reservationId);assert.equal(row.state,'UNCERTAIN');assert.equal(row.signature,signed.signature);assert.equal(row.wire_hash,signed.wireHash);
  const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body).sort(),['action','serializedTxBase64']);assert.equal(body.action,'increase-position');
  assert.equal(bs58.encode(Buffer.from(body.serializedTxBase64,'base64').subarray(1,65)),signed.signature);
  return Response.json({action:'increase-position',txid:signed.signature});
 }});
 const result=await broadcast(signed,f.args);assert.equal(calls,1);assert.equal(result.stage,'BROADCAST_ACKNOWLEDGED');assert.equal(result.state,'UNCERTAIN');assert.equal(result.readyForRetry,false);
 assert.equal(f.journal.read(f.args.reservationId).state,'UNCERTAIN');
 await assert.rejects(broadcast(signed,f.args));assert.equal(calls,1);
});
test('transport errors, malformed or oversized replies and wrong acknowledgements hold the reservation without retrying',async t=>{
 for(const reply of [
  async()=>{throw Error('private transport detail');},async()=>new Response('unavailable',{status:503}),
  async()=>Response.json({action:'decrease-position',txid:'wrong'}),async()=>Response.json({action:'increase-position',txid:'wrong'}),
  async()=>new Response('invalid json',{headers:{'Content-Type':'application/json'}}),
  async()=>Response.json({data:'x'.repeat(4097)}),async()=>Response.json({},{headers:{'Content-Type':'text/html'}}),
 ]){
  const f=await custodySigningFixture(t),signed=f.vault.signPrepared(await authorizeServerPerpsSigning(f.prepared,f.args));let calls=0;
  const broadcast=createServerPerpsBroadcaster({...f.args,fetchImpl:async()=>{calls++;return reply();}}),result=await broadcast(signed,f.args);
  assert.equal(calls,1);assert.equal(result.stage,'BROADCAST_UNKNOWN');assert.equal(result.signature,signed.signature);assert.equal(result.readyForRetry,false);
  assert.equal(f.journal.read(f.args.reservationId).state,'UNCERTAIN');await assert.rejects(broadcast(signed,f.args));assert.equal(calls,1);
 }
});
test('forged output, a foreign journal, paused controls or unverified funds cannot reach the submission transport',async t=>{
 const f=await custodySigningFixture(t),signed=f.vault.signPrepared(await authorizeServerPerpsSigning(f.prepared,f.args));let calls=0;
 const fetchImpl=async()=>{calls++;throw Error('must not be called');};
 const broadcast=createServerPerpsBroadcaster({...f.args,fetchImpl});await assert.rejects(broadcast({...signed},f.args));
 await assert.rejects(broadcast(signed,{...f.args,ownerAccountHash:'b'.repeat(64)}));
 await assert.rejects(createServerPerpsBroadcaster({...f.args,fetchImpl,readAccount:async()=>({...f.daily})})(signed,f.args));
 const wrongJournal={...f.journal};await assert.rejects(createServerPerpsBroadcaster({...f.args,journal:wrongJournal,fetchImpl})(signed,f.args));
 f.controls.pause(f.args);await assert.rejects(broadcast(signed,f.args));assert.equal(calls,0);assert.equal(f.journal.read(f.args.reservationId).state,'SIGNING');
});
test('a failed durable broadcast write stops transmission and concurrent submitters cannot send twice',async t=>{
 const f=await custodySigningFixture(t),signed=f.vault.signPrepared(await authorizeServerPerpsSigning(f.prepared,f.args));let calls=0;
 const original=f.journal.recordBroadcastIntent;f.journal.recordBroadcastIntent=()=>{throw Error('disk-full');};
 const broadcast=createServerPerpsBroadcaster({...f.args,fetchImpl:async()=>{calls++;return Response.json({action:'increase-position',txid:signed.signature});}});
 await assert.rejects(broadcast(signed,f.args),/disk-full/);assert.equal(calls,0);assert.equal(f.journal.read(f.args.reservationId).state,'SIGNING');
 f.journal.recordBroadcastIntent=original;
 const results=await Promise.allSettled([broadcast(signed,f.args),broadcast(signed,f.args)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);assert.equal(f.journal.read(f.args.reservationId).state,'UNCERTAIN');
});
function publishedExecutorSignal(){return {id:'custody-signal-1',pair:'SOLUSDT',side:'LONG',status:'OPEN',score:12.5,entry:100,sl:95,tp1:110,
 createdAt:new Date(now-60000).toISOString(),telegramSentAt:new Date(now-59000).toISOString(),telegramMessageId:123,contractMultiplier:1,
 marketAlignment:'with-market',higherTrend:'bullish 4h alignment',microTrend:'bullish 15m alignment',volumeRatio:1.3,adx:26,spreadPercent:.0015,liquidityUsd:25000000,freshness:{status:'fresh'}};}
function executorFeed(open=[publishedExecutorSignal()],livePaused=false){return readServerPerpsSignalFeed({feedToken:'fixture-only-feed-token-not-live'},{now:()=>now,monotonicNow:()=>0,
 fetchImpl:async()=>Response.json({ok:true,clientFeed:true,generatedAt:new Date(now).toISOString(),executor:{livePaused,minScore:12,minLiquidityUsd:3000000},open})});}
async function executorFixture(t,{changeFeed,ownerIndexed=false}={}){
 const f=await custodySigningFixture(t,{reserve:false,ownerIndexed}),initial=await emptyFixtureDailyAccount(f.wallet.walletAddress,{bankSlot:50});
 const calls={feed:0,builder:0,submit:0,risk:0};
 const readFeed=async()=>{calls.feed++;return changeFeed?changeFeed(f,calls.feed):executorFeed();};
 const options={...f.args,mode:'execute',now:()=>now,readFeed,rpcRequest:f.rpcRequest,readFinalizedAccount:async()=>f.daily,
  builderRequest:async(...args)=>{calls.builder++;return f.builderRequest(...args);},
  readAccount:async args=>{calls.risk++;assert.equal(args.ownerAccountHash,f.args.ownerAccountHash);return args.minimumSlot?f.daily:initial;},
  vault:f.vault,fetchImpl:async(_url,options)=>{calls.submit++;const wire=Buffer.from(JSON.parse(options.body).serializedTxBase64,'base64');return Response.json({action:'increase-position',txid:bs58.encode(wire.subarray(1,65))});}};
 return {...f,options,calls,executor:createServerPerpsExecutor(options)};
}
test('observation mode lists only authenticated published candidates and has no custody, reservation or submission path',async()=>{
 const executor=createServerPerpsExecutor({readFeed:()=>executorFeed()});
 const result=await executor.runOnce();assert.equal(result.stage,'OBSERVATION_ONLY');assert.equal(result.tradingEnabled,false);assert.equal(result.signals[0].id,'custody-signal-1');
 await assert.rejects(createServerPerpsExecutor({readFeed:async()=>({candidates:[publishedExecutorSignal()]})}).runOnce());
});
test('complete executor cycle binds published Telegram signal to controls, simulated wire, durable reservation, custody signature and one send',async t=>{
 const f=await executorFixture(t,{ownerIndexed:true}),result=await f.executor.runOnce(f.args);
 assert.equal(f.vault.createOrReadExclusiveWallet({ownerAccountHash:f.args.ownerAccountHash,explicitCustodyApproval:true}).walletAddress,f.wallet.walletAddress);
 assert.equal(result.stage,'BROADCAST_ACKNOWLEDGED');assert.equal(result.state,'UNCERTAIN');assert.equal(result.readyForRetry,false);
 assert.equal(f.calls.builder,1);assert.equal(f.calls.submit,1);assert.equal(f.calls.feed,4);
 const row=f.journal.readSignal(f.wallet.walletAddress,'custody-signal-1');assert.equal(row.state,'UNCERTAIN');assert.equal(row.signature,result.signature);
 const again=await f.executor.runOnce(f.args);assert.equal(again.stage,'RECONCILIATION_REQUIRED');assert.equal(f.calls.submit,1);
});

test('maintenance worker cannot use active consent to sign, while explicit execution and restart retain the one-send journal',async t=>{
 const f=await executorFixture(t,{ownerIndexed:true}),reports=[];
 const options={controls:f.controls,executor:f.executor,saveStatus:r=>reports.push(r)};
 const maintenance=createServerPerpsWorker(options),first=await maintenance.run({once:true});
 assert.equal(first.results.RECONCILIATION_ONLY,1);assert.equal(f.calls.feed,0);assert.equal(f.calls.builder,0);assert.equal(f.calls.submit,0);
 const active=createServerPerpsWorker({...options,mode:'execute'}),submitted=await active.run({once:true});
 assert.equal(submitted.results.BROADCAST_ACKNOWLEDGED,1);assert.equal(f.calls.submit,1);
 const restarted=createServerPerpsWorker({...options,mode:'execute'}),next=await restarted.run({once:true});
 assert.equal(next.results.RECONCILIATION_REQUIRED,1);assert.equal(f.calls.submit,1);
 assert.equal(f.journal.pending(f.wallet.walletAddress)[0].state,'UNCERTAIN');assert.ok(reports.every(r=>r.activationRequested===false));
});

test('unverified or forged backup readiness blocks a new executor entry before risk, signals or builder access',async t=>{
 const f=await executorFixture(t);f.backupRegistry.revokeArchive({archiveSha256:f.backupArchiveSha,explicitOperatorApproval:true});
 assert.equal((await f.executor.runOnce(f.args)).stage,'BACKUP_VERIFICATION_REQUIRED');assert.equal(f.calls.risk,0);assert.equal(f.calls.feed,0);assert.equal(f.calls.builder,0);assert.equal(f.calls.submit,0);assert.equal(f.journal.pending(f.wallet.walletAddress).length,0);
 assert.equal((await f.executor.reconcileOnly(f.args)).stage,'RECONCILIATION_ONLY');assert.equal(f.calls.feed,0);assert.equal(f.calls.risk,0);
 const g=await executorFixture(t),copy={...g.backupRegistry.readVerified(g.args)},forged={readVerified:()=>copy};
 assert.equal((await createServerPerpsExecutor({...g.options,backupRegistry:forged}).runOnce(g.args)).stage,'BACKUP_VERIFICATION_REQUIRED');assert.equal(g.calls.risk,0);assert.equal(g.calls.feed,0);
});

test('revoking the restore attestation invalidates an already-issued custody signing grant without releasing held collateral',async t=>{
 const f=await custodySigningFixture(t),grant=await authorizeServerPerpsSigning(f.prepared,f.args);
 f.backupRegistry.revokeArchive({archiveSha256:f.backupArchiveSha,explicitOperatorApproval:true});
 assert.throws(()=>f.vault.signPrepared(grant));assert.equal(f.journal.read(f.args.reservationId).state,'SIGNING');assert.equal(f.journal.read(f.args.reservationId).signature,null);
 const g=await custodySigningFixture(t);await assert.rejects(authorizeServerPerpsSigning(g.prepared,{...g.args,backupRegistry:{readVerified:()=>({...g.backupRegistry.readVerified(g.args)})}}));
});

test('revoked backups cannot reach submission either before or during a fresh funding read',async t=>{
 for(const timing of ['before','during']){
  const f=await custodySigningFixture(t),signed=f.vault.signPrepared(await authorizeServerPerpsSigning(f.prepared,f.args));let submits=0;
  const revoke=()=>f.backupRegistry.revokeArchive({archiveSha256:f.backupArchiveSha,explicitOperatorApproval:true});if(timing==='before')revoke();
  const broadcaster=createServerPerpsBroadcaster({...f.args,readAccount:async()=>{if(timing==='during')revoke();return f.daily;},fetchImpl:async()=>{submits++;throw Error('must not send');}});
  await assert.rejects(broadcaster(signed,f.args));assert.equal(submits,0);assert.equal(f.journal.read(f.args.reservationId).state,'SIGNING');assert.equal(f.journal.read(f.args.reservationId).wire_hash,null);
 }
});
test('closed, unpublished, remotely paused or disabled automation never reaches preparation',async t=>{
 for(const changeFeed of [()=>executorFeed([{...publishedExecutorSignal(),status:'CLOSED'}]),()=>executorFeed([{...publishedExecutorSignal(),telegramMessageId:null}]),()=>executorFeed(undefined,true)]){
  const f=await executorFixture(t,{changeFeed}),result=await f.executor.runOnce(f.args);
  assert.ok(['NO_NEW_PUBLISHED_SIGNAL','REMOTE_PAUSED'].includes(result.stage));assert.equal(f.calls.builder,0);assert.equal(f.calls.submit,0);
 }
 const f=await executorFixture(t);f.controls.pause(f.args);assert.equal((await f.executor.runOnce(f.args)).stage,'AUTOMATION_INACTIVE');assert.equal(f.calls.feed,0);
});
test('a pause before signing cancels only its own unsigned reservation; a pause after signing quarantines it without sending',async t=>{
 for(const at of [3,4]){
  const f=await executorFixture(t,{changeFeed:(f,n)=>{if(n===at)f.controls.pause(f.args);return executorFeed();}}),result=await f.executor.runOnce(f.args);
  assert.equal(result.stage,'EXECUTION_BLOCKED');assert.equal(f.calls.submit,0);
  assert.equal(f.journal.readSignal(f.wallet.walletAddress,'custody-signal-1').state,at===3?'CANCELLED':'SIGNING');
 }
});

test('custody authorization rejects changed or missing durable position/exit bindings before any key use',async t=>{
 const f=await custodySigningFixture(t),row=f.journal.read(f.args.reservationId),evidence=readServerPerpsPreparationEvidence(f.prepared,{walletAddress:f.wallet.walletAddress,signalId:f.args.signalId});
 assert.equal(row.position_address,evidence.positionAddress);
 assert.deepEqual(JSON.parse(row.entry_exit_plan),evidence.entryExitPlan);
 for(const change of [{position_address:null},{entry_exit_plan:null},{entry_exit_plan:'{}'}]){
  const journal={...f.journal,read:id=>({...f.journal.read(id),...change})};
  await assert.rejects(authorizeServerPerpsSigning(f.prepared,{...f.args,journal}));
  assert.equal(f.journal.read(f.args.reservationId).state,'SIGNING');
 }
});
