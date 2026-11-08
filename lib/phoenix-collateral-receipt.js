// Exact finalized payout evidence. No signing grant, queue resubmission or
// inference of wallet cash from an accepted withdrawal request alone.
import {createPublicKey,verify} from 'node:crypto';
import bs58 from 'bs58';
import {getCompiledTransactionMessageDecoder} from '@solana/kit';
import {getWithdrawFundsEncoder,getEmberWithdrawEncoder} from '@ellipsis-labs/rise';
import {requirePhoenixCollateralWire} from './phoenix-collateral-simulation.js';
import {derivePhoenixWalletAccounts} from './phoenix-instruction-bindings.js';
import {PHOENIX_IDENTITIES as ID,phoenixKey} from './phoenix-market-plan.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const COMPUTE='ComputeBudget111111111111111111111111111111',GLOBAL='2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ';
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const proofs=new WeakMap(),finalized=new WeakMap();
const fail=code=>{throw Error('PHOENIX_COLLATERAL_RECEIPT_'+code);};
function raw(v){if(typeof v!=='string'||v.length>1644)fail('WIRE');const b=Buffer.from(v,'base64');if(b.toString('base64')!==v||b.length<100||b.length>1232||b[0]!==1)fail('WIRE');return b;}
function uint(v){if(typeof v!=='string'||!/^(0|[1-9]\d{0,19})$/.test(v)||BigInt(v)>18446744073709551615n)fail('UNITS');return BigInt(v);}
function signedMessage(encoded,wallet){
 const b=raw(encoded),key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(bs58.decode(wallet))]),format:'der',type:'spki'});
 if(!verify(null,b.subarray(65),key,b.subarray(1,65)))fail('SIGNATURE');
 const message=getCompiledTransactionMessageDecoder().decode(b.subarray(65));
 if(message.version!=='legacy'||message.header.numSignerAccounts!==1||message.staticAccounts[0]!==wallet||message.staticAccounts.length>64)fail('WIRE');
 return {signed:b,message,signature:bs58.encode(b.subarray(1,65))};
}
export function capturePhoenixSignedCollateral(wire,serializedTxBase64,{payout}={}){
 const p=requirePhoenixCollateralWire(wire),{preparation}=p,b=raw(serializedTxBase64);
 if(!b.subarray(65).equals(Buffer.from(wire.messageBase64,'base64')))fail('WIRE');
 const material=signedMessage(serializedTxBase64,wire.walletAddress);
 let payoutEvidence=null;
 if(preparation.phase==='UNWRAP'){
  requirePhoenixCanonicalPayout(payout,{walletAddress:wire.walletAddress,subaccountIndex:preparation.subaccountIndex,amountUnits:preparation.amountUnits});
  payoutEvidence=finalized.get(payout).evidence;
 }
 const archive=Object.freeze({version:1,walletAddress:wire.walletAddress,phase:preparation.phase,subaccountIndex:preparation.subaccountIndex,
  amountUnits:preparation.amountUnits,observedSlot:preparation.observedSlot,serializedTxBase64,...(payoutEvidence?{payoutArchive:archivePhoenixSignedCollateral(payoutEvidence)}:{})});
 const result=Object.freeze({stage:'PHOENIX_SIGNED_COLLATERAL_EVIDENCE',signature:material.signature,walletAddress:wire.walletAddress,
  phase:preparation.phase,amountUnits:preparation.amountUnits,readyForSigning:false,requiresDurableJournalBeforeBroadcast:true});
 proofs.set(result,{...material,archive,addresses:preparation.addresses,payoutEvidence});return result;
}
export function archivePhoenixSignedCollateral(value){const p=proofs.get(value);if(!p)fail('UNVERIFIED');return p.archive;}
export async function restorePhoenixSignedCollateral(archive){
 if(!archive||archive.version!==1||!['WITHDRAW','UNWRAP'].includes(archive.phase)||!Number.isSafeInteger(archive.observedSlot)||archive.observedSlot<1||uint(archive.amountUnits)===0n)fail('ARCHIVE');
 if(Object.keys(archive).sort().join(',')!==(archive.phase==='UNWRAP'?'amountUnits,observedSlot,payoutArchive,phase,serializedTxBase64,subaccountIndex,version,walletAddress':'amountUnits,observedSlot,phase,serializedTxBase64,subaccountIndex,version,walletAddress'))fail('ARCHIVE');
 let payoutEvidence=null;
 if(archive.phase==='UNWRAP'){
  const source=archive.payoutArchive;
  if(!source||source.phase!=='WITHDRAW'||source.walletAddress!==archive.walletAddress||source.subaccountIndex!==archive.subaccountIndex||source.amountUnits!==archive.amountUnits)fail('PAYOUT_BINDING');
  payoutEvidence=await restorePhoenixSignedCollateral(source);
 }else if(archive.payoutArchive!==undefined)fail('PAYOUT_BINDING');
 phoenixKey(archive.walletAddress);const p=signedMessage(archive.serializedTxBase64,archive.walletAddress),a=await derivePhoenixWalletAccounts(archive.walletAddress,archive.subaccountIndex);
 const {message:m}=p,keys=m.staticAccounts,ins=m.instructions,amount=BigInt(archive.amountUnits),withdraw=archive.phase==='WITHDRAW';
 if(ins.length!==(withdraw?4:6))fail('ARCHIVE');
 const address=(i,n)=>keys[i.accountIndices[n]],program=i=>keys[i.programAddressIndex];
 const limit=Buffer.from(ins[0].data),price=Buffer.from(ins[1].data);
 if(program(ins[0])!==COMPUTE||program(ins[1])!==COMPUTE||limit.length!==5||limit[0]!==2||limit.readUInt32LE(1)<100000||limit.readUInt32LE(1)>1000000||
    price.length!==9||price[0]!==3||price.readBigUInt64LE(1)>10000n)fail('ARCHIVE');
 const ata=ins[withdraw?2:3];
 if(program(ata)!==ATA||address(ata,0)!==archive.walletAddress||address(ata,1)!==(withdraw?a.canonicalAta:a.usdcAta)||
    address(ata,2)!==archive.walletAddress||address(ata,3)!==(withdraw?ID.canonicalUsdc:ID.usdc)||!Buffer.from(ata.data).equals(Buffer.from([1])))fail('ARCHIVE');
 if(withdraw){
  const i=ins[3];if(program(i)!==ID.program||address(i,2)!==GLOBAL||address(i,3)!==archive.walletAddress||address(i,4)!==a.trader||address(i,6)!==a.globalVault||address(i,7)!==a.canonicalAta||
   !Buffer.from(i.data).equals(Buffer.from(getWithdrawFundsEncoder().encode(amount))))fail('ARCHIVE');
 }else{
  const approve=Buffer.alloc(9);approve[0]=4;approve.writeBigUInt64LE(amount,1);
  if(program(ins[2])!==TOKEN||address(ins[2],0)!==a.canonicalAta||address(ins[2],1)!==a.emberState||address(ins[2],2)!==archive.walletAddress||!Buffer.from(ins[2].data).equals(approve)||
     program(ins[4])!==ID.ember||address(ins[4],0)!==archive.walletAddress||address(ins[4],1)!==a.emberState||address(ins[4],2)!==ID.usdc||address(ins[4],3)!==ID.canonicalUsdc||
     address(ins[4],4)!==a.usdcAta||address(ins[4],5)!==a.canonicalAta||address(ins[4],6)!==a.emberVault||!Buffer.from(ins[4].data).equals(Buffer.from(getEmberWithdrawEncoder().encode(amount)))||
     program(ins[5])!==TOKEN||address(ins[5],0)!==a.canonicalAta||address(ins[5],1)!==archive.walletAddress||!Buffer.from(ins[5].data).equals(Buffer.from([5])))fail('ARCHIVE');
 }
 const result=Object.freeze({stage:'PHOENIX_SIGNED_COLLATERAL_EVIDENCE',signature:p.signature,walletAddress:archive.walletAddress,
  phase:archive.phase,amountUnits:archive.amountUnits,restoredForReadOnlyReconciliation:true,readyForSigning:false});
 proofs.set(result,{...p,archive:Object.freeze({...archive,...(payoutEvidence?{payoutArchive:archivePhoenixSignedCollateral(payoutEvidence)}:{})}),addresses:a,payoutEvidence});return result;
}
function tokenAmount(rows,key,mint,wallet,keys,optional=false){
 if(!Array.isArray(rows)||rows.length>64||rows.some(r=>!Number.isInteger(r.accountIndex)||r.accountIndex<0||r.accountIndex>=keys.length))fail('TOKEN_BALANCES');const found=rows.filter(r=>r.accountIndex===keys.indexOf(key));
 if(found.length===0&&optional)return 0n;
 if(found.length!==1||found[0].mint!==mint||found[0].owner!==wallet||found[0].programId!==TOKEN||found[0].uiTokenAmount?.decimals!==6)fail('TOKEN_BALANCES');
 return uint(found[0].uiTokenAmount.amount);
}
function creditedTransfer(meta,keys,{index,source,destination,mint,amount}){
 if(!Array.isArray(meta.innerInstructions))fail('TRANSFER');const groups=meta.innerInstructions.filter(g=>g.index===index);
 if(groups.length!==1||!Array.isArray(groups[0].instructions)||groups[0].instructions.length>1024)fail('TRANSFER');
 let count=0;
 for(const i of groups[0].instructions){
  if(keys[i.programIdIndex]!==TOKEN)continue;
  if(typeof i.data!=='string'||i.data.length>1400||!Array.isArray(i.accounts))fail('TRANSFER');
  const b=Buffer.from(bs58.decode(i.data));if(![3,12].includes(b[0]))continue;
  const checked=b[0]===12,dest=keys[i.accounts[checked?2:1]];
  if(dest!==destination)continue;
  if(keys[i.accounts[0]]!==source||b.length!==(checked?10:9)||b.readBigUInt64LE(1)!==amount||checked&&(keys[i.accounts[1]]!==mint||b[9]!==6))fail('TRANSFER');count++;
 }
 if(count!==1)fail('TRANSFER');
}
export function requirePhoenixFinalizedCollateral(value,{walletAddress,phase,signature}={}){
 if(!finalized.has(value)||(walletAddress&&value.walletAddress!==walletAddress)||(phase&&value.phase!==phase)||(signature&&value.signature!==signature))fail('UNVERIFIED');return value;
}
export function requirePhoenixCanonicalPayout(value,{walletAddress,subaccountIndex,amountUnits}={}){
 requirePhoenixFinalizedCollateral(value,{walletAddress,phase:'WITHDRAW'});
 if(value.state!=='CANONICAL_RECEIVED'||value.subaccountIndex!==subaccountIndex||value.receivedUnits!==amountUnits)fail('PAYOUT_BINDING');return value;
}
export async function reconcilePhoenixCollateral(value,{request}={}){
 const p=proofs.get(value);if(!p||typeof request!=='function')fail('UNVERIFIED');const {archive:a,message:m,addresses}=p;
 if(await request('getGenesisHash',[])!==MAINNET)fail('NETWORK');
 const reply=await request('getSignatureStatuses',[[value.signature],{searchTransactionHistory:true}]);
 if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<a.observedSlot||!Array.isArray(reply.value)||reply.value.length!==1)fail('STATUS');
 const pending=()=>Object.freeze({stage:'PHOENIX_COLLATERAL_UNRESOLVED',signature:value.signature,state:'UNKNOWN',phase:a.phase,mayRetry:false,walletCredited:false});
 let payoutSlot=null;
 if(p.payoutEvidence){
  const source=await reconcilePhoenixCollateral(p.payoutEvidence,{request});
  if(source.state==='UNKNOWN')return pending();
  requirePhoenixCanonicalPayout(source,{walletAddress:a.walletAddress,subaccountIndex:a.subaccountIndex,amountUnits:a.amountUnits});
  payoutSlot=source.slot;
 }
 const status=reply.value[0];if(status===null)return pending();
 if(!Number.isSafeInteger(status.slot)||status.slot<a.observedSlot||status.slot>reply.context.slot||!['processed','confirmed','finalized'].includes(status.confirmationStatus)||
    status.err!==null&&(!status.err||typeof status.err!=='object'))fail('STATUS');
 if(status.confirmationStatus!=='finalized')return pending();
 const tx=await request('getTransaction',[value.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
 if(tx===null)return pending();
 if(tx.slot!==status.slot||payoutSlot!==null&&tx.slot<payoutSlot||!Array.isArray(tx.transaction)||tx.transaction[1]!=='base64'||!raw(tx.transaction[0]).equals(p.signed)||!tx.meta||
    !Number.isSafeInteger(tx.meta.fee)||tx.meta.fee<5000||tx.meta.fee>15000||JSON.stringify(tx.meta.err)!==JSON.stringify(status.err))fail('TRANSACTION');
 if(await request('getGenesisHash',[])!==MAINNET)fail('NETWORK');
 const seal=record=>{const result=Object.freeze({stage:'PHOENIX_FINALIZED_COLLATERAL',walletAddress:a.walletAddress,subaccountIndex:a.subaccountIndex,
  signature:value.signature,phase:a.phase,amountUnits:a.amountUnits,slot:tx.slot,networkFeeLamports:String(tx.meta.fee),mayRetry:false,
  ...(p.payoutEvidence?{payoutSignature:p.payoutEvidence.signature}:{}),...record});finalized.set(result,{evidence:value});return result;};
 if(tx.meta.err!==null)return seal({state:'FAILED',walletCredited:false});
 const keys=m.staticAccounts,meta=tx.meta,amount=BigInt(a.amountUnits);
 const preCanon=tokenAmount(meta.preTokenBalances,addresses.canonicalAta,ID.canonicalUsdc,a.walletAddress,keys,true);
 const postCanon=tokenAmount(meta.postTokenBalances,addresses.canonicalAta,ID.canonicalUsdc,a.walletAddress,keys);
 const preUsdc=tokenAmount(meta.preTokenBalances,addresses.usdcAta,ID.usdc,a.walletAddress,keys,true);
 // WITHDRAW does not include the USDC ATA in its message; absence is unchanged.
 const postUsdc=a.phase==='WITHDRAW'&&keys.indexOf(addresses.usdcAta)<0?preUsdc:tokenAmount(meta.postTokenBalances,addresses.usdcAta,ID.usdc,a.walletAddress,keys);
 if(!Array.isArray(meta.preBalances)||!Array.isArray(meta.postBalances)||meta.preBalances.length!==keys.length||meta.postBalances.length!==keys.length||
    [...meta.preBalances,...meta.postBalances].some(v=>!Number.isSafeInteger(v)||v<0))fail('SOL_BALANCES');
 const ataIndex=keys.indexOf(a.phase==='WITHDRAW'?addresses.canonicalAta:addresses.usdcAta),rent=BigInt(meta.postBalances[ataIndex])-BigInt(meta.preBalances[ataIndex]);
 if(rent<0n||rent>10000000n||BigInt(meta.preBalances[0])-BigInt(meta.postBalances[0])!==BigInt(meta.fee)+rent)fail('SOL_CONSERVATION');
 if(a.phase==='WITHDRAW'){
  if(preUsdc!==postUsdc||![0n,amount].includes(postCanon-preCanon))fail('CONSERVATION');
  if(postCanon===preCanon)return seal({state:'AWAITING_PAYOUT',walletCredited:false,requiresQueueReconciliation:true,rentLockedLamports:rent.toString()});
  creditedTransfer(meta,keys,{index:3,source:addresses.globalVault,destination:addresses.canonicalAta,mint:ID.canonicalUsdc,amount});
 }else{
  if(preCanon-postCanon!==amount||postUsdc-preUsdc!==amount)fail('CONSERVATION');
  creditedTransfer(meta,keys,{index:4,source:addresses.emberVault,destination:addresses.usdcAta,mint:ID.usdc,amount});
 }
 return seal({state:a.phase==='WITHDRAW'?'CANONICAL_RECEIVED':'USDC_RECEIVED',walletCredited:a.phase==='UNWRAP',
  rentLockedLamports:rent.toString(),receivedUnits:a.amountUnits,canonicalBalanceAfterUnits:postCanon.toString()});
}
