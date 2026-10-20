// Wallet-side SOL/rent/token conservation on privately bound close snapshots.
// This is NOT pool/oracle policy, minimum-return approval, a durable close
// record, signing authorization, or permission to submit a transaction.
import bs58 from 'bs58';
import {createHash} from 'node:crypto';
import {readServerPerpsFullCloseSimulation} from './perps-server-close-simulation.js';
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {PERPS_PROGRAM,PERPS_CUSTODIES} from './perps-server-custody.js';
const SYSTEM='11111111111111111111111111111111',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',TOKEN2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',proofs=new WeakMap();
function fail(){throw Error('PERPS_CLOSE_WALLET_FUNDING_MISMATCH');}
function bytes(account){if(!account||account.executable)fail();return Buffer.from(account.data[0],'base64');}
const lamports=account=>BigInt(account?.lamports??'0');
const vacant=account=>account===null||account.owner===SYSTEM&&!account.executable&&account.data[0]==='';
const closed=account=>vacant(account)&&lamports(account)===0n;
function system(account){if(!account||!vacant(account))fail();return lamports(account);}
function token(account,owner,mint){
 const b=bytes(account);
 if(account.owner!==TOKEN||b.length!==165||bs58.encode(b.subarray(0,32))!==mint||bs58.encode(b.subarray(32,64))!==owner
  ||b[108]!==1||b.readUInt32LE(72)!==0||b.readBigUInt64LE(121)!==0n)fail();
 const native=b.readUInt32LE(109),close=b.readUInt32LE(129),amount=b.readBigUInt64LE(64);
 if(native!==(mint===PERPS_CUSTODIES.SOL.mint?1:0)||close>1||close===1&&bs58.encode(b.subarray(133,165))!==owner)fail();
 // SOL transfers can leave an unsynchronized excess above the recorded WSOL
 // amount. Never invent tokens from that excess or permit an underfunded record.
 if(native===1&&lamports(account)<amount+b.readBigUInt64LE(113))fail();
 return amount;
}
export {token as readPerpsCloseLegacyToken};
function sameExceptAmount(before,after,nativeIncrement=0n){
 const a=bytes(before),b=bytes(after);a.fill(0,64,72);b.fill(0,64,72);
 if(before.owner!==after.owner||lamports(after)-lamports(before)!==nativeIncrement||!a.equals(b))fail();
}
function controlled(account,wallet){
 if(!account||![TOKEN,TOKEN2022].includes(account.owner))return false;
 const b=bytes(account),key=Buffer.from(bs58.decode(wallet));
 return b.length>=64&&b.subarray(32,64).equals(key)||b.length>=108&&b[72]!==0&&b.subarray(76,108).equals(key)
  ||b.length>=165&&b[129]!==0&&b.subarray(133,165).equals(key);
}
export function readServerPerpsFullCloseFunding(value){
 const proof=proofs.get(value);if(!proof)fail();readServerPerpsFullCloseSimulation(proof.simulation);return proof;
}
export async function checkServerPerpsFullCloseFunding(simulation,{request,monotonicNow=()=>performance.now()}={}){
 if(typeof request!=='function'||typeof monotonicNow!=='function')fail();
 const started=monotonicNow();if(!Number.isFinite(started))fail();
 const snapshot=readServerPerpsFullCloseSimulation(simulation),{inspection,before,after,addresses}=snapshot;
 const {plan,collateral}=readInspectedServerPerpsFullClose(inspection),{bindings}=inspection,owner=plan.walletAddress;
 const fee=BigInt(simulation.feeLamports),oldSol=system(before[owner]),newSol=system(after[owner]);
 if(oldSol<fee)fail();
 let locked=0n,refunded=0n,nativePayout=0n;
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 async function createdToken(address,tokenOwner,mint,nativeIncrement=0n){
  const old=before[address],next=after[address];
  if(!vacant(old))fail();token(next,tokenOwner,mint);
  const minimum=await request('getMinimumBalanceForRentExemption',[165,{commitment:'confirmed'}]);
  if(!Number.isSafeInteger(minimum)||minimum<1||minimum>10000000)fail();
  const required=lamports(old)>BigInt(minimum)?lamports(old):BigInt(minimum);
  if(mint===PERPS_CUSTODIES.SOL.mint&&bytes(next).readBigUInt64LE(113)!==BigInt(minimum))fail();
  if(lamports(next)!==required+nativeIncrement)fail();locked+=required-lamports(old);
 }
 const oldRecipient=before[bindings.recipient],nextRecipient=after[bindings.recipient];
 const oldUsdc=vacant(oldRecipient)?0n:token(oldRecipient,owner,PERPS_CUSTODIES.USDC.mint);
 const nextUsdc=vacant(nextRecipient)?0n:token(nextRecipient,owner,PERPS_CUSTODIES.USDC.mint);
 if(nextUsdc-oldUsdc!==BigInt(simulation.receivedUsdcUnits))fail();
 if(vacant(oldRecipient)&&!vacant(nextRecipient))await createdToken(bindings.recipient,owner,PERPS_CUSTODIES.USDC.mint);
 else if(!vacant(oldRecipient))sameExceptAmount(oldRecipient,nextRecipient);
 if(closed(after[plan.positionAddress]))refunded+=lamports(before[plan.positionAddress]);
 else if(lamports(before[plan.positionAddress])!==lamports(after[plan.positionAddress]))fail();
 if(plan.side==='LONG'){
  const address=bindings.collateralAccount,old=before[address],next=after[address];
  const oldAmount=vacant(old)?0n:token(old,owner,collateral.mint);
  const payout=BigInt(simulation.receivedCollateralUnits),separate=plan.requiresSeparateUsdcConversion;
  if(closed(next)){
   if(oldAmount!==0n||separate&&plan.asset!=='SOL')fail();
   refunded+=lamports(old);if(separate)nativePayout=payout;
  }
  else{
   if(token(next,owner,collateral.mint)!==oldAmount+(separate?payout:0n))fail();
   const nativeIncrement=separate&&plan.asset==='SOL'?payout:0n;
   if(vacant(old))await createdToken(address,owner,collateral.mint,nativeIncrement);else sameExceptAmount(old,next,nativeIncrement);
  }
  if(!separate){
   const a=before[bindings.tokenLedger],b=after[bindings.tokenLedger],discriminator=createHash('sha256').update('account:TokenLedger').digest().subarray(0,8);
   for(const account of [a,b])if(account?.owner!==PERPS_PROGRAM||bytes(account).length!==48||!bytes(account).subarray(0,8).equals(discriminator))fail();
   const data=bytes(b);
   if(lamports(a)!==lamports(b)||bs58.encode(data.subarray(8,40))!==address||data.readBigUInt64LE(40)!==oldAmount)fail();
  }
 }
 if(bindings.requestAddress){
  // Never reuse/consume an existing request (including somebody's pending exit).
  if(!closed(before[bindings.requestAddress])||!closed(before[bindings.requestAta])||!closed(after[bindings.requestAddress]))fail();
  if(!closed(after[bindings.requestAta])){
   if(token(after[bindings.requestAta],bindings.requestAddress,collateral.mint)!==0n)fail();
   await createdToken(bindings.requestAta,bindings.requestAddress,collateral.mint);
  }
 }
 for(const address of addresses){
  if([bindings.recipient,bindings.collateralAccount].includes(address))continue;
  if((controlled(before[address],owner)||controlled(after[address],owner))&&JSON.stringify(before[address])!==JSON.stringify(after[address]))fail();
 }
 if(locked>30000000n||oldSol+refunded+nativePayout-fee-locked!==newSol)fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail();
 readServerPerpsFullCloseSimulation(simulation);
 const result=Object.freeze({stage:'FULL_CLOSE_WALLET_FUNDING_ONLY',readyForSigning:false,tradingEnabled:false,
  walletAddress:owner,positionAddress:plan.positionAddress,receivedUsdcUnits:simulation.receivedUsdcUnits,
  receivedCollateralUnits:simulation.receivedCollateralUnits,collateralAsset:simulation.collateralAsset,
  requiresSeparateUsdcConversion:plan.requiresSeparateUsdcConversion,
  collateralDelivery:plan.requiresSeparateUsdcConversion&&plan.asset==='SOL'&&closed(after[bindings.collateralAccount])?'NATIVE_SOL':'TOKEN',
  networkFeeLamports:fee.toString(),rentLockedLamports:locked.toString(),rentRefundedLamports:refunded.toString(),
  walletSolChangeLamports:(newSol-oldSol).toString(),requiresFullInstructionAndProtocolEffectsPolicy:true,
  requiresIndependentMinimumReturn:true,requiresDurableCloseAccounting:true});
 proofs.set(result,Object.freeze({simulation}));return result;
}
