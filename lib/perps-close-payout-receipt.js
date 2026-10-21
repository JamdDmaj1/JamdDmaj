// Finalized first-leg payout evidence only. No signing, submission, journal
// mutation, protected swap, daily-risk release or complete-settlement authority.
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {canonicalPerpsCloseSettlement} from './perps-close-settlement.js';
import {readPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
import {readServerPerpsTradeTransaction,readVerifiedPerpsTransactionEvidence} from './perps-server-trade-transaction.js';
import {readServerPerpsAccount,requireFreshServerPerpsAccount} from './perps-server-account.js';
import {PERPS_PROGRAM,PERPS_CUSTODIES,deriveServerPerpsIdentities,decodeServerPerpsCustody} from './perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const proofs=new WeakMap(),hash=b=>createHash('sha256').update(b).digest('hex');
function fail(){throw Error('UNVERIFIED_PERPS_CLOSE_PAYOUT');}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
function units(s){if(typeof s!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(s)||BigInt(s)>18446744073709551615n)fail();return BigInt(s);}
function address(s){try{if(typeof s!=='string'||bs58.decode(s).length!==32||bs58.encode(bs58.decode(s))!==s)fail();return s;}catch{fail();}}
const associated=async(owner,mint)=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];
// This digest is NOT authorization. Future journal transitions must atomically
// compare these exact fields, recorded owner signature and signed-wire hash.
export function perpsClosePayoutRecordBinding(row){
 if(typeof row?.id!=='string'||!row.id||row.id.length>180||/[\x00-\x1f]/.test(row.id)||!['PREPARED','SIGNING','UNCERTAIN'].includes(row.state)||typeof row.settlement!=='string'||row.settlement.length>4096
  ||typeof row.entries!=='string'||row.entries.length>262144||!/^[a-f0-9]{64}$/.test(row.unsigned_wire_hash??''))fail();
 address(row.wallet);address(row.position);integer(row.created);integer(row.observed_slot);integer(row.fee_lamports);
 if(row.fee_lamports<1||row.fee_lamports>1000000)fail();
 return hash(JSON.stringify([row.id,row.wallet,row.position,row.state,row.created,row.observed_slot,row.fee_lamports,row.unsigned_wire_hash,row.entries,row.settlement]));
}
export function requireVerifiedPerpsClosePayout(value){
 const p=proofs.get(value);if(!p)fail();
 const elapsed=p.monotonicNow()-p.started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail();
 requireFreshServerPerpsAccount(p.account,{walletAddress:value.walletAddress,minimumSlot:value.slot});return value;
}
export async function readFinalizedPerpsClosePayout(row,identity,{request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 row=structuredClone(row);identity=structuredClone(identity);
 const started=monotonicNow(),observedAt=integer(now());if(!Number.isFinite(started))fail();
 const binding=perpsClosePayoutRecordBinding(row),settlement=JSON.parse(row.settlement);
 if(canonicalPerpsCloseSettlement(settlement,{walletAddress:row.wallet,positionAddress:row.position})!==row.settlement
  ||settlement.version!==2||settlement.mode!=='COLLATERAL_THEN_USDC')fail();
 const receipt=await readPerpsBroadcastReceipt({walletAddress:row.wallet,signature:identity?.signature,wireHash:identity?.wireHash},request,{now,requireFinalized:true});
 if(receipt===null)return null;if(receipt.state!=='CONFIRMED'||receipt.slot<row.observed_slot)fail();
 const transaction=await readServerPerpsTradeTransaction({walletAddress:row.wallet,signature:receipt.signature,day:receipt.executionDay},{request,now,monotonicNow});
 const evidence=readVerifiedPerpsTransactionEvidence(transaction),{keys,instructions,meta}=evidence;
 if(transaction.failed||transaction.unknownPerpsEvents||transaction.slot!==receipt.slot||keys[0]!==row.wallet
  ||transaction.blockTime*1000<row.created-2000||meta.fee!==row.fee_lamports||row.fee_lamports<1||row.fee_lamports>1000000)fail();
 const wire=Buffer.from(evidence.wire,'base64');if(wire[0]!==3)fail();
 wire.fill(0,1,129);if(hash(wire)!==row.unsigned_wire_hash)fail();
 const ids=await deriveServerPerpsIdentities({walletAddress:row.wallet,asset:settlement.asset,side:settlement.side});
 const c=PERPS_CUSTODIES[settlement.receiveAsset],collateralAccount=await associated(row.wallet,c.mint);
 if(ids.position!==row.position||collateralAccount!==settlement.collateralAccount
  ||settlement.receiveAccount!==(settlement.delivery==='NATIVE_SOL'?row.wallet:collateralAccount))fail();
 const cores=instructions.map((ix,index)=>({...ix,index})).filter(ix=>keys[ix.program]===PERPS_PROGRAM);
 if(cores.length!==1)fail();
 const core=cores[0],data=Buffer.from(core.data),tag=data.subarray(0,8).toString('hex'),v2=tag==='a2bfc83e8b3eb011';
 if(!(tag==='2e17f02c1e8a5e8c'&&data.length===42||v2&&data.length===50)||core.accounts.length!==22||data[32]!==1||data[33]!==1)fail();
 const roles=core.accounts.map(i=>keys[i]),time=data.readBigInt64LE(34),limit=data.readBigUInt64LE(24);
 if(roles[2]!==row.wallet||roles[3]!==collateralAccount||roles[4]!==ids.transferAuthority||roles[7]!==row.position
  ||roles[8]!==PERPS_CUSTODIES[settlement.asset].address||roles[v2?10:11]!==c.address||roles[v2?13:15]!==c.mint
  ||limit!==units(settlement.closePriceLimitUsdUnits)||time<BigInt(transaction.blockTime)-30n||time>BigInt(transaction.blockTime)+2n)fail();
 const events=transaction.events.filter(e=>e.positionAddress===row.position);
 if(events.length!==1||events[0].eventName!=='InstantDecreasePositionEvent'||events[0].instructionIndex!==core.index)fail();
 const event=events[0];
 if(event.side!==settlement.side||event.asset!==settlement.asset||event.fields.desiredMint!==c.mint
  ||event.fields.sizeUsdDelta!==settlement.sizeUsdUnits||event.fields.originalPositionCollateralUsd!==settlement.collateralUsdUnits
  ||event.fields.positionOpenTime!==settlement.positionOpenTimeSeconds||units(settlement.positionOpenTimeSeconds)>BigInt(transaction.blockTime)||event.fields.priceSlippage!==limit.toString())fail();
 const payout=units(event.fields.transferToken);
 const custodyReply=await request('getMultipleAccounts',[[c.address],{commitment:'finalized',encoding:'base64',minContextSlot:receipt.slot}]);
 if(integer(custodyReply?.context?.slot)<receipt.slot||!Array.isArray(custodyReply.value)||custodyReply.value.length!==1)fail();
 const custody=decodeServerPerpsCustody(settlement.receiveAsset,c.address,custodyReply.value[0]),vault=custody.tokenAccount;
 if(roles[v2?12:14]!==vault)fail();
 for(const list of [meta.preBalances,meta.postBalances])if(!Array.isArray(list)||list.length!==keys.length||list.some(n=>!Number.isSafeInteger(n)||n<0))fail();
 const balance=(list,key)=>{const i=keys.indexOf(key);if(i<0)fail();return BigInt(list[i]);};
 const beforeLamports=key=>balance(meta.preBalances,key),afterLamports=key=>balance(meta.postBalances,key);
 function tokenBalances(list){
  if(!Array.isArray(list)||list.length>keys.length)fail();const map=new Map();
  for(const b of list){const i=integer(b?.accountIndex);if(i>=keys.length||map.has(keys[i]))fail();
   address(b.mint);address(b.owner);if(b.programId!==undefined&&b.programId!==TOKEN)fail();
   units(b.uiTokenAmount?.amount);integer(b.uiTokenAmount?.decimals);map.set(keys[i],b);
  }return map;
 }
 const pre=tokenBalances(meta.preTokenBalances),post=tokenBalances(meta.postTokenBalances);
 function token(map,key,owner,mint,decimals,lamports){
  const b=map.get(key);if(!b){if(lamports!==0n)fail();return 0n;}
  if(b.owner!==owner||b.mint!==mint||b.uiTokenAmount.decimals!==decimals)fail();return units(b.uiTokenAmount.amount);
 }
 const amount=(map,key,owner,mint=c.mint,decimals=c.decimals)=>token(map,key,owner,mint,decimals,map===pre?beforeLamports(key):afterLamports(key));
 if(amount(pre,vault,ids.transferAuthority)-amount(post,vault,ids.transferAuthority)!==payout)fail();
 if(beforeLamports(vault)-afterLamports(vault)!==(settlement.receiveAsset==='SOL'?payout:0n))fail();
 const oldTokens=amount(pre,collateralAccount,row.wallet),newTokens=amount(post,collateralAccount,row.wallet);
 const group=meta.innerInstructions.find(g=>g.index===core.index),transfers=[];
 for(const ix of group?.instructions??[]){
  if(keys[ix.programIdIndex]!==TOKEN)continue;const d=Buffer.from(bs58.decode(ix.data)),r=ix.accounts.map(i=>keys[i]);
  if((d[0]===3&&d.length===9&&r.length===3&&r[0]===vault&&r[1]===collateralAccount&&r[2]===ids.transferAuthority)
   ||(d[0]===12&&d.length===10&&r.length===4&&r[0]===vault&&r[1]===c.mint&&r[2]===collateralAccount&&r[3]===ids.transferAuthority&&d[9]===c.decimals))transfers.push(d.readBigUInt64LE(1));
 }
 if(payout>0n?(transfers.length!==1||transfers[0]!==payout):transfers.some(v=>v!==0n))fail();
 let refund=0n,locked=0n,native=0n;
 if(beforeLamports(row.position)===0n)fail();
 if(afterLamports(row.position)===0n)refund+=beforeLamports(row.position);
 else if(afterLamports(row.position)!==beforeLamports(row.position))fail();
 if(settlement.delivery==='NATIVE_SOL'){
  const cleanups=instructions.filter(ix=>keys[ix.program]===TOKEN&&Buffer.from(ix.data).equals(Buffer.from([9]))&&ix.accounts.map(i=>keys[i]).join(',')===[collateralAccount,row.wallet,row.wallet].join(','));
  if(oldTokens!==0n||newTokens!==0n||afterLamports(collateralAccount)!==0n||cleanups.length!==1||instructions.indexOf(cleanups[0])<=core.index)fail();
  refund+=beforeLamports(collateralAccount);native=payout;
 }else{
  if(newTokens-oldTokens!==payout)fail();
  const rent=afterLamports(collateralAccount)-beforeLamports(collateralAccount)-(settlement.receiveAsset==='SOL'?payout:0n);
  if(rent<0n||rent>10000000n||beforeLamports(collateralAccount)>0n&&rent!==0n)fail();locked+=rent;
 }
 if(v2){
  const [requestAddress]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(row.position),data.subarray(42,50),new Uint8Array([2])]});
  const requestAta=await associated(requestAddress,c.mint);
  if(roles[15]!==requestAddress||roles[16]!==requestAta||beforeLamports(requestAddress)!==0n||afterLamports(requestAddress)!==0n||beforeLamports(requestAta)!==0n)fail();
  const rent=afterLamports(requestAta);if(rent>10000000n||amount(post,requestAta,requestAddress)!==0n)fail();locked+=rent;
 }
 if(afterLamports(row.wallet)-beforeLamports(row.wallet)!==native+refund-locked-BigInt(meta.fee))fail();
 if(settlement.receiveAsset!=='USDC'){
  const usdcAta=await associated(row.wallet,PERPS_CUSTODIES.USDC.mint);
  if(keys.includes(usdcAta)&&amount(pre,usdcAta,row.wallet,PERPS_CUSTODIES.USDC.mint,6)!==amount(post,usdcAta,row.wallet,PERPS_CUSTODIES.USDC.mint,6))fail();
 }
 const account=await readServerPerpsAccount({walletAddress:row.wallet,minimumSlot:Math.max(receipt.slot,custodyReply.context.slot)},{request,now,monotonicNow,commitment:'finalized'});
 if(account.positions.some(p=>p.address===row.position))fail();
 const result=Object.freeze({stage:'FINALIZED_FIRST_LEG_PAYOUT_ONLY',readyForSigning:false,tradingEnabled:false,
  walletAddress:row.wallet,positionAddress:row.position,recordBinding:binding,unsignedWireHash:row.unsigned_wire_hash,
  signature:receipt.signature,wireHash:receipt.wireHash,slot:receipt.slot,blockTime:transaction.blockTime,executionDay:receipt.executionDay,observedSlot:account.observedSlot,observedAt,
  receiveAsset:settlement.receiveAsset,receiveMint:c.mint,receiveAccount:settlement.receiveAccount,delivery:settlement.delivery,
  receivedTokenUnits:payout.toString(),networkFeeLamports:String(meta.fee),requiresConversion:settlement.conversionRequired&&payout>0n,
  requiresSignedCloseJournalBinding:true,requiresProtectedConversion:settlement.conversionRequired&&payout>0n,requiresCompleteDailyAccounting:true});
 proofs.set(result,{account,started,monotonicNow});return requireVerifiedPerpsClosePayout(result);
}
