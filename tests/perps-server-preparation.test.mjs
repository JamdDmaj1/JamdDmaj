import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import bs58 from 'bs58';
import {inspectServerPerpsPreparation,prepareInspectedServerAutomation,readServerPerpsPreparationEvidence} from '../lib/perps-server-preparation.js';
import {PERPS_CUSTODIES,PERPS_POOL,PERPS_PROGRAM,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {getProgramDerivedAddress} from '@solana/kit';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {reservePreparedServerPerpsAutomation} from '../lib/perps-server-reservation.js';
import {verifyOwnerSignedServerPerpsEnvelope,readOwnerSignedServerPerpsEnvelope} from '../lib/perps-server-signed-envelope.js';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
import {authorizeServerPerpsSigning} from '../lib/perps-server-signing-authorization.js';
import {emptyFixtureDailyAccount} from './helpers/perps-history-fixture.mjs';
import {createServerPerpsBroadcaster} from '../lib/perps-server-broadcast.js';
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
async function fixture({exits=false,lookup=false,trusted=false,planMutation=null,ownerAddress=null}={}){
 lookup ||= exits||trusted;
 const apiPrivate=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,21)]),format:'der',type:'pkcs8'});
 const keys=Array.from({length:19},(_,i)=>Buffer.alloc(32,i+1));keys[2]=createPublicKey(apiPrivate).export({format:'der',type:'spki'}).subarray(-32);
 const ownerKey=trusted?createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,5)]),format:'der',type:'pkcs8'}):null;
 if(ownerKey)keys[0]=createPublicKey(ownerKey).export({format:'der',type:'spki'}).subarray(-32);
 if(ownerAddress)keys[0]=Buffer.from(bs58.decode(ownerAddress));
 keys.push(Buffer.from(bs58.decode('ComputeBudget111111111111111111111111111111')),Buffer.from(bs58.decode('PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu')));
 const blockhash=bs58.encode(Buffer.alloc(32,40)),tableAddress=bs58.encode(Buffer.alloc(32,60));
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
 return {preparation,intent,request,calls,account,table,loaded,ownerKey};
}
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
async function custodySigningFixture(t,{beginSigning=true}={}){
 const directory=mkdtempSync(join(tmpdir(),'jamd-custody-signing-')),wallets=join(directory,'wallets'),keysDirectory=join(directory,'keys');
 mkdirSync(wallets,{mode:0o700});mkdirSync(keysDirectory,{mode:0o700});
 const keyFile=join(keysDirectory,'master.key'),allowNonPosixForTests=process.platform==='win32',ownerAccountHash='a'.repeat(64),clock={value:0};
 let controls,journal;t.after(()=>{try{controls?.close();}finally{journal?.close();rmSync(directory,{recursive:true,force:true});}});
 createPerpsCustodyMasterKey(keyFile,{allowNonPosixForTests});const vault=openPerpsCustodyVault({directory:wallets,keyFile,allowNonPosixForTests});
 const wallet=vault.createExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true}),walletAddress=wallet.walletAddress;
 let daily=await emptyFixtureDailyAccount(walletAddress,{monotonicNow:()=>clock.value});
 const settings={capital:100,loss:20,positions:2,margin:10,leverage:3,dailyTrades:5};
 controls=openPerpsAutomationControls(join(directory,'controls.sqlite'),{now:()=>now,monotonicNow:()=>clock.value,
  authorizeActivation:async()=>({custodyAuthorized:vault.describe(wallet).exclusive,executionReady:true,dailyAccount:daily})});
 const initial=controls.provision({ownerAccountHash,walletAddress,settings}),approval=controls.issueActivationChallenge({ownerAccountHash,walletAddress,expectedRevision:initial.revision});
 const active=await controls.activate({ownerAccountHash,walletAddress,expectedRevision:initial.revision,token:approval.token,explicitApproval:true});
 journal=openPerpsExecutionJournal(join(directory,'journal.sqlite'),{now:()=>now});
 const f=await fixture({exits:true,trusted:true,ownerAddress:walletAddress});
 const input={settings:active.settings,signal:{id:'custody-signal-1',createdAt:new Date(now).toISOString(),pair:'SOLUSDT',side:'LONG',entry:100,sl:95,tp1:110},
  decision:{ok:true},walletAddress,snapshot:{updatedAt:now,walletAddress,availableUsd:20,allocatedUsd:0,lossTodayUsd:0,openPositions:0,tradesToday:0},enabled:true,paused:false,maxSlippageBps:50,now};
 const prepared=await prepareInspectedServerAutomation(input,{nowSeconds:seconds,monotonicNow:()=>clock.value,rpcRequest:f.request,builderRequest:async()=>new Response(JSON.stringify(f.preparation))});
 const args={journal,controls,ownerAccountHash,walletAddress,signalId:input.signal.id,reservationId:'custody-reservation-1',controlRevision:active.revision,
  readAccount:async()=>daily,monotonicNow:()=>clock.value};
 await reservePreparedServerPerpsAutomation(prepared,{...args,readControls:async()=>controls.readForExecutor({walletAddress})});
 if(beginSigning)journal.beginSigning(args.reservationId);
 return {prepared,args,vault,controls,journal,clock,wallet,daily,async replaceBalance(units){daily=await emptyFixtureDailyAccount(walletAddress,{availableUsdcUnits:units,monotonicNow:()=>clock.value});}};
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
