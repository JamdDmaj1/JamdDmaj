// Durable second-leg facts only. A stored descriptor is NOT a reconstructed
// private wire, a current chain observation, a custody grant or send authority.
import {createHash} from 'node:crypto';
import {ed25519} from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
import {validateStoredPerpsCloseExecution} from './perps-close-execution-record.js';
import {readConstructedPerpsCloseConversionWire} from './perps-close-conversion-wire.js';
import {requireVerifiedPerpsCloseConversionReceipt} from './perps-close-conversion-receipt.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES} from './perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
const intents=new WeakMap(),hash=b=>createHash('sha256').update(b).digest('hex');
const fields=['stage','readyForSigning','tradingEnabled','walletAddress','asset','source','destination','amountUnits','minimumUsdcUnits','nativeSolInput','closeWrappedAccount','blockhash','computeUnitLimit','computeUnitPriceMicroLamports','lastValidBlockHeight','serializedTxBase64','messageBase64','requiresFinalizedProceedsAndJournalBinding','requiresFreshOracleAndFundingPolicy','requiresSameWireSimulation','requiresExplicitAuthorization'];
const receiptFields=['signature','wireHash','unsignedWireHash','slot','blockTime','executionDay','walletAddress','asset','convertedTokenUnits','receivedUsdcUnits','minimumUsdcUnits','networkFeeLamports','rentLockedLamports','rentRefundedLamports','walletSolChangeLamports','swapFeeUsdcUnits'];
function fail(){throw Error('UNVERIFIED_PERPS_CONVERSION_RECORD');}
function integer(v){if(!Number.isSafeInteger(v)||v<0)fail();return v;}
function key(v,n=32){try{const b=bs58.decode(v);if(b.length!==n||bs58.encode(b)!==v)fail();return Buffer.from(b);}catch{fail();}}
function units(v,positive=false){if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(v)||BigInt(v)>18446744073709551615n||positive&&v==='0')fail();return BigInt(v);}
function canonical(text,names,max){
 if(typeof text!=='string'||text.length>max)fail();const p=JSON.parse(text);
 if(!p||Object.keys(p).sort().join(',')!==[...names].sort().join(','))fail();
 if(JSON.stringify(Object.fromEntries(names.map(k=>[k,p[k]])))!==text)fail();return p;
}
function inspectMessage(w,message){
 const keys=Array.from({length:message[3]},(_,i)=>bs58.encode(message.subarray(4+i*32,36+i*32)));
 if(new Set(keys).size!==keys.length)fail();let at=36+keys.length*32;
 const byte=()=>{if(at>=message.length||message[at]>=128)fail();return message[at++];},take=n=>{if(at+n>message.length)fail();const b=message.subarray(at,at+n);at+=n;return b;};
 const count=byte(),list=[];for(let i=0;i<count;i++){
  const program=keys[byte()],n=byte(),accounts=Array.from(take(n),i=>keys[i]),length=byte(),data=take(length);
  if(!program||accounts.some(x=>!x))fail();list.push({program,accounts,data:Buffer.from(data)});
 }if(at!==message.length)fail();
 const coreIndex=w.nativeSolInput?6:3,core=list[coreIndex],r=core?.accounts;
 if(core?.program!==PERPS_PROGRAM||r.length!==17||r[0]!==w.walletAddress||r[1]!==w.source||r[2]!==w.destination||r[5]!==PERPS_POOL
  ||r[6]!==PERPS_CUSTODIES[w.asset].address||r[10]!==PERPS_CUSTODIES.USDC.address||r[7]!==r[8]||r[11]!==r[12]||r[14]!==TOKEN||r[16]!==PERPS_PROGRAM)fail();
 const expected=[],add=(program,accounts,data)=>expected.push({program,accounts,data});
 const budget=Buffer.alloc(5);budget[0]=2;budget.writeUInt32LE(w.computeUnitLimit,1);add(COMPUTE,[],budget);
 const priority=Buffer.alloc(9);priority[0]=3;priority.writeBigUInt64LE(BigInt(w.computeUnitPriceMicroLamports),1);add(COMPUTE,[],priority);
 if(w.nativeSolInput)add(ATA,[w.walletAddress,w.source,w.walletAddress,PERPS_CUSTODIES[w.asset].mint,SYSTEM,TOKEN],Buffer.from([1]));
 add(ATA,[w.walletAddress,w.destination,w.walletAddress,PERPS_CUSTODIES.USDC.mint,SYSTEM,TOKEN],Buffer.from([1]));
 if(w.nativeSolInput){const d=Buffer.alloc(12);d.writeUInt32LE(2);d.writeBigUInt64LE(units(w.amountUnits,true),4);add(SYSTEM,[w.walletAddress,w.source],d);add(TOKEN,[w.source],Buffer.from([17]));}
 const swap=Buffer.alloc(24);Buffer.from('414b3f4ceb5b5b88','hex').copy(swap);swap.writeBigUInt64LE(units(w.amountUnits,true),8);swap.writeBigUInt64LE(units(w.minimumUsdcUnits,true),16);add(PERPS_PROGRAM,r,swap);
 if(w.closeWrappedAccount)add(TOKEN,[w.source,w.walletAddress,w.walletAddress],Buffer.from([9]));
 if(list.length!==expected.length||list.some((ix,i)=>ix.program!==expected[i].program||ix.accounts.join(',')!==expected[i].accounts.join(',')||!ix.data.equals(expected[i].data)))fail();
 const writes=[...new Set([w.walletAddress,w.source,w.destination,PERPS_POOL,r[6],r[9],r[10],r[13]])];
 const reads=[...new Set(expected.flatMap(i=>[i.program,...i.accounts]).filter(k=>!writes.includes(k)))];
 if(keys.join(',')!==[...writes,...reads].join(',')||message[2]!==reads.length)fail();
}
export function perpsCloseConversionPayoutBinding(parent,execution){
 validateStoredPerpsCloseExecution(execution,parent);
 if(execution.state!=='FIRST_LEG_FINALIZED'||!JSON.parse(execution.payout_json).requiresConversion)fail();
 return hash(JSON.stringify([execution.parent_binding,execution.payout_json]));
}
export function storedPerpsCloseConversionWire(wire){
 readConstructedPerpsCloseConversionWire(wire);return JSON.stringify(Object.fromEntries(fields.map(k=>[k,wire[k]])));
}
export function inspectStoredPerpsCloseConversionWire(text,parent,execution){
 perpsCloseConversionPayoutBinding(parent,execution);const w=canonical(text,fields,8192),p=JSON.parse(execution.payout_json);
 if(w.stage!=='PROTECTED_CLOSE_CONVERSION_WIRE_ONLY'||w.readyForSigning!==false||w.tradingEnabled!==false
  ||w.walletAddress!==parent.wallet||w.asset!==p.receiveAsset||!['BTC','ETH','SOL'].includes(w.asset)||w.amountUnits!==p.receivedTokenUnits
  ||w.nativeSolInput!==(p.delivery==='NATIVE_SOL')||typeof w.closeWrappedAccount!=='boolean'||w.closeWrappedAccount&&!w.nativeSolInput
  ||w.computeUnitLimit!==400000||integer(w.computeUnitPriceMicroLamports)>10000
  ||fields.slice(17).some(k=>w[k]!==true))fail();
 units(w.amountUnits,true);units(w.minimumUsdcUnits,true);units(w.lastValidBlockHeight,true);
 for(const k of ['walletAddress','source','destination','blockhash'])key(w[k]);
 if(w.source===w.destination||w.source===w.walletAddress||w.destination===w.walletAddress)fail();
 const raw=Buffer.from(w.serializedTxBase64,'base64'),message=Buffer.from(w.messageBase64,'base64');
 if(raw.length>1232||raw.length<165||raw.toString('base64')!==w.serializedTxBase64||message.toString('base64')!==w.messageBase64
  ||raw[0]!==1||raw.subarray(1,65).some(n=>n!==0)||!raw.subarray(65).equals(message)
  ||message[0]!==1||message[1]!==0||message[3]>=128||message[3]<3||message[2]>=message[3]
  ||!message.subarray(4,36).equals(key(parent.wallet))||!message.subarray(4+message[3]*32,36+message[3]*32).equals(key(w.blockhash)))fail();
 inspectMessage(w,message);
 // Full native role/PDA validation remains in the original private constructor
 // and fresh revalidation. These canonical archive facts never recreate it.
 return Object.freeze({wire:Object.freeze(w),unsignedWireHash:hash(raw)});
}
function signedFacts(unsigned,encoded,owner){
 if(typeof encoded!=='string'||encoded.length>1644)fail();const b=Buffer.from(encoded,'base64'),raw=Buffer.from(unsigned,'base64');
 if(b.toString('base64')!==encoded||b.length!==raw.length||b[0]!==1||!b.subarray(65).equals(raw.subarray(65))
  ||!ed25519.verify(b.subarray(1,65),b.subarray(65),key(owner),{zip215:false}))fail();
 return Object.freeze({signature:bs58.encode(b.subarray(1,65)),wireHash:hash(b)});
}
export function verifyOwnerSignedPerpsCloseConversionIntent(wire,encoded){
 readConstructedPerpsCloseConversionWire(wire);const facts=signedFacts(wire.serializedTxBase64,encoded,wire.walletAddress);
 const result=Object.freeze({stage:'CONVERSION_OWNER_SIGNATURE_FACT_ONLY',readyForBroadcast:false,...facts,requiresCustodyAuthorization:true,requiresFreshSigningRevalidation:true});
 intents.set(result,{wire,encoded});return result;
}
export function readVerifiedPerpsCloseConversionIntent(value,wireJson){
 const p=intents.get(value);if(!p||storedPerpsCloseConversionWire(p.wire)!==wireJson)fail();
 const facts=signedFacts(p.wire.serializedTxBase64,p.encoded,p.wire.walletAddress);
 if(facts.signature!==value.signature||facts.wireHash!==value.wireHash)fail();return p.encoded;
}
export function canonicalStoredPerpsConversionReceipt(text,row,parent,execution){
 const p=canonical(text,receiptFields,4096),{wire:w}=inspectStoredPerpsCloseConversionWire(row.wire_json,parent,execution);
 if(p.signature!==row.signature||p.wireHash!==row.wire_hash||p.unsignedWireHash!==row.unsigned_wire_hash
  ||p.walletAddress!==parent.wallet||p.asset!==w.asset||p.convertedTokenUnits!==w.amountUnits||p.minimumUsdcUnits!==w.minimumUsdcUnits
  ||integer(p.slot)<row.prepared_slot||integer(p.blockTime)*1000<row.created-2000||!Number.isSafeInteger(p.blockTime*1000)
  ||new Date(p.blockTime*1000).toISOString().slice(0,10)!==p.executionDay
  ||p.networkFeeLamports!==String(row.fee_lamports)||units(p.receivedUsdcUnits,true)<units(w.minimumUsdcUnits,true))fail();
 for(const name of ['networkFeeLamports','rentLockedLamports','rentRefundedLamports','swapFeeUsdcUnits'])units(p[name]);
 if(typeof p.walletSolChangeLamports!=='string'||! /^(0|-?[1-9][0-9]{0,19})$/.test(p.walletSolChangeLamports)
  ||BigInt(p.walletSolChangeLamports)< -18446744073709551615n||BigInt(p.walletSolChangeLamports)>18446744073709551615n)fail();return text;
}
export function storeVerifiedPerpsConversionReceipt(payout,row,parent,execution){
 requireVerifiedPerpsCloseConversionReceipt(payout);
 return canonicalStoredPerpsConversionReceipt(JSON.stringify(Object.fromEntries(receiptFields.map(k=>[k,payout[k]]))),row,parent,execution);
}
export function validateStoredPerpsCloseConversion(row,parent,execution){
 if(!row||row.close_id!==parent.id||row.parent_binding!==execution.parent_binding||row.payout_binding!==perpsCloseConversionPayoutBinding(parent,execution)
  ||integer(row.created)<execution.updated||integer(row.updated)<row.created||integer(row.prepared_slot)<execution.confirmed_slot
  ||integer(row.fee_lamports)<1||row.fee_lamports>1000000||!['PREPARED','SIGNING','UNCERTAIN','FINALIZED'].includes(row.state))fail();
 const {wire,unsignedWireHash}=inspectStoredPerpsCloseConversionWire(row.wire_json,parent,execution);if(unsignedWireHash!==row.unsigned_wire_hash)fail();
 if(['PREPARED','SIGNING'].includes(row.state)){
  if([row.signature,row.wire_hash,row.owner_signed_wire,row.confirmed_slot,row.receipt_json].some(x=>x!==null))fail();
 }else{
  const facts=signedFacts(wire.serializedTxBase64,row.owner_signed_wire,parent.wallet);
  if(facts.signature!==row.signature||facts.wireHash!==row.wire_hash)fail();
  if(row.state==='UNCERTAIN'){if(row.confirmed_slot!==null||row.receipt_json!==null)fail();}
  else {canonicalStoredPerpsConversionReceipt(row.receipt_json,row,parent,execution);if(integer(row.confirmed_slot)!==JSON.parse(row.receipt_json).slot)fail();}
 }return row;
}
