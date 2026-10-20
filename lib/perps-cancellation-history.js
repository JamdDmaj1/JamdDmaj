// Finalized cancellation accounting, never signing or closure permission. A
// missing trade event is not enough: exact durable wire and actual effects bind.
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {requireVerifiedServerPerpsTradeTransaction,readVerifiedPerpsTransactionEvidence} from './perps-server-trade-transaction.js';
import {decodeServerPerpsEnvelope} from './perps-server-envelope.js';
import {derivePerpsCancellationRoles,inspectPerpsCancellationPolicy} from './perps-exit-cancellation-policy.js';
import {canonicalServerPerpsEntryExitPlan} from './perps-entry-exit-plan.js';
import {PERPS_CUSTODIES} from './perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',proofs=new WeakMap();
function fail(){throw Error('UNVERIFIED_PERPS_CANCELLATION_HISTORY');}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function balances(value,length){if(!Array.isArray(value)||value.length!==length||value.some(n=>!Number.isSafeInteger(n)||n<0))fail();return value.map(BigInt);}
function tokens(rows,length){
 if(!Array.isArray(rows)||rows.length>length)fail();const result=new Map();
 for(const row of rows){
  if(!Number.isSafeInteger(row?.accountIndex)||row.accountIndex<0||row.accountIndex>=length||result.has(row.accountIndex)
   ||typeof row.uiTokenAmount?.amount!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(row.uiTokenAmount.amount)||BigInt(row.uiTokenAmount.amount)>18446744073709551615n
   ||!Number.isSafeInteger(row.uiTokenAmount.decimals)||row.uiTokenAmount.decimals<0||row.uiTokenAmount.decimals>255)fail();
  for(const key of [row.mint,row.owner])try{if(typeof key!=='string'||bs58.decode(key).length!==32||bs58.encode(bs58.decode(key))!==key)fail();}catch{fail();}
  result.set(row.accountIndex,{mint:row.mint,owner:row.owner,program:row.programId??null,amount:row.uiTokenAmount.amount,decimals:row.uiTokenAmount.decimals});
 }
 return result;
}
function usdc(row,owner){if(!row||row.mint!==PERPS_CUSTODIES.USDC.mint||row.owner!==owner||row.decimals!==6||row.program!==null&&row.program!==TOKEN)fail();return BigInt(row.amount);}
export function requireVerifiedPerpsCancellationHistory(value,{transaction}={}){
 const proof=proofs.get(value);if(!proof||transaction!==undefined&&transaction!==proof.transaction)fail();requireVerifiedServerPerpsTradeTransaction(proof.transaction);
 const row=proof.journal.readExitCancellation(value.cancellationId);
 if(!row||!['UNCERTAIN','CONFIRMED'].includes(row.state)||row.wallet!==value.walletAddress||row.signature!==value.signature
  ||row.wire_hash!==proof.signedHash||row.unsigned_wire_hash!==proof.unsignedHash||row.confirmed_slot!==null&&row.confirmed_slot!==value.slot)fail();return value;
}
export async function readJournalledPerpsCancellation(transaction,{journal}={}){
 requireVerifiedServerPerpsTradeTransaction(transaction);
 if(typeof journal?.readExitCancellationBySignature!=='function'||typeof journal?.readExitCancellation!=='function'||typeof journal?.read!=='function')return null;
 const row=journal.readExitCancellationBySignature({walletAddress:transaction.walletAddress,signature:transaction.signature});if(!row)return null;
 if(transaction.failed||transaction.events.length||!['UNCERTAIN','CONFIRMED'].includes(row.state))fail();
 const entry=journal.read(row.reservation);if(!entry||entry.wallet!==transaction.walletAddress||!['OPEN','CLOSED'].includes(entry.state))fail();
 const plan=JSON.parse(entry.entry_exit_plan);if(canonicalServerPerpsEntryExitPlan(plan)!==entry.entry_exit_plan||!plan.exits.some(exit=>exit.address===row.address))fail();
 const evidence=readVerifiedPerpsTransactionEvidence(transaction),wire=Buffer.from(evidence.wire,'base64');if(wire[0]!==3||evidence.keys[0]!==transaction.walletAddress)fail();
 const ownerSigned=Buffer.from(wire);ownerSigned.fill(0,65,129);const unsigned=Buffer.from(wire);unsigned.fill(0,1,129);
 const signedHash=hash(ownerSigned),unsignedHash=hash(unsigned);if(signedHash!==row.wire_hash||unsignedHash!==row.unsigned_wire_hash)fail();
 const envelope=decodeServerPerpsEnvelope(unsigned.toString('base64'),transaction.walletAddress),keys=evidence.keys;
 const roles=await derivePerpsCancellationRoles({walletAddress:transaction.walletAddress,positionAddress:entry.position_address,exitAddress:row.address});
 inspectPerpsCancellationPolicy(envelope,keys,roles);
 const meta=evidence.meta,pre=balances(meta.preBalances,keys.length),post=balances(meta.postBalances,keys.length),before=tokens(meta.preTokenBalances,keys.length),after=tokens(meta.postTokenBalances,keys.length);
 if(!Number.isSafeInteger(meta.fee)||meta.fee!==row.fee_lamports||meta.fee<1||meta.fee>1000000)fail();
 const owner=0,ownerAta=keys.indexOf(roles.ownerAta),request=keys.indexOf(row.address),requestAta=keys.indexOf(roles.requestAta);
 if([ownerAta,request,requestAta].some(index=>index<3)||pre[request]===0n||pre[requestAta]===0n||post[request]!==0n||post[requestAta]!==0n||after.has(requestAta))fail();
 const returned=usdc(before.get(requestAta),row.address),old=before.has(ownerAta)?usdc(before.get(ownerAta),transaction.walletAddress):0n;
 if(usdc(after.get(ownerAta),transaction.walletAddress)!==old+returned)fail();
 let rent=0n;
 if(before.has(ownerAta)){if(pre[ownerAta]!==post[ownerAta])fail();}
 else {if(pre[ownerAta]!==0n||post[ownerAta]<1n||post[ownerAta]>10000000n)fail();rent=post[ownerAta];}
 if(post[owner]!==pre[owner]+pre[request]+pre[requestAta]-BigInt(meta.fee)-rent)fail();
 for(let i=0;i<keys.length;i++){
  if([owner,ownerAta,request,requestAta].includes(i))continue;
  if(pre[i]!==post[i]||JSON.stringify(before.get(i))!==JSON.stringify(after.get(i)))fail();
 }
 // No token account other than the two bound ATAs may appear/disappear.
 for(const index of new Set([...before.keys(),...after.keys()]))if(![ownerAta,requestAta].includes(index)&&JSON.stringify(before.get(index))!==JSON.stringify(after.get(index)))fail();
 const result=Object.freeze({stage:'FINALIZED_NON_TRADE_CANCELLATION',readyForSigning:false,walletAddress:transaction.walletAddress,signature:transaction.signature,
  cancellationId:row.id,positionAddress:entry.position_address,exitAddress:row.address,slot:transaction.slot,returnedUsdcUnits:returned.toString(),networkFeeLamports:String(meta.fee),realizedTradingLossUsdUnits:'0'});
 proofs.set(result,{transaction,journal,signedHash,unsignedHash});return requireVerifiedPerpsCancellationHistory(result,{transaction});
}
