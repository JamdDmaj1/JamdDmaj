// Canonical offline archive validation, never a new signing authorization.
import {createHash,createPublicKey,verify} from 'node:crypto';
import bs58 from 'bs58';
import {buildRegisterTraderIx,buildSyncParentToChildIx,buildUpdateTraderPreferenceBitsIx,TraderPreferenceToggleTarget} from '@ellipsis-labs/rise';
import {createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,appendTransactionMessageInstructions,compileTransaction,getBase64EncodedWireTransaction} from '@solana/kit';
import {PHOENIX_IDENTITIES as ID,phoenixKey} from './phoenix-market-plan.js';
const fail=()=>{throw Error('PHOENIX_CHILD_STORED_REJECTED');};
const COMPUTE='ComputeBudget111111111111111111111111111111';
const shape=ix=>({programAddress:ix.programAddress,accounts:ix.accounts.map(a=>({address:a.address,role:a.role})),data:[...ix.data]});
export function inspectPhoenixChildSetupArchive(archive){
 const w=archive?.wire,s=archive?.setup;if(!w||!s||w.stage!=='PHOENIX_CHILD_SETUP_WIRE'||s.stage!=='PHOENIX_ISOLATED_SETUP_UNSIGNED'||
    !['walletAddress','parentAddress','traderAddress','subaccountIndex'].every(k=>w[k]===s[k])||!Number.isInteger(w.subaccountIndex)||w.subaccountIndex<1||w.subaccountIndex>100||
    typeof s.createsAccount!=='boolean'||typeof s.changesParentSettlementPolicy!=='boolean'||!Array.isArray(s.instructions)||s.instructions.length<1||s.instructions.length>4||
    s.accountDataBytes!==(s.createsAccount?280:0)||!Number.isInteger(w.computeUnitLimit)||w.computeUnitLimit<100000||w.computeUnitLimit>1000000||
    !Number.isInteger(w.computeUnitPriceMicroLamports)||w.computeUnitPriceMicroLamports<0||w.computeUnitPriceMicroLamports>10000||!Number.isSafeInteger(w.lastValidBlockHeight)||w.lastValidBlockHeight<1)fail();
 [w.walletAddress,w.parentAddress,w.traderAddress,w.blockhash].forEach(phoenixKey);
 const protocol={programAddress:ID.program,logAuthorityAddress:'GdxfTLSsdSY37G6fZoYtdGDSfgFnbT2EmRpuePZxWShS',globalConfigurationAddress:'2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ'};
 const protect=traderAccount=>buildUpdateTraderPreferenceBitsIx({...protocol,traderWallet:w.walletAddress,traderAccount,toggles:[{target:TraderPreferenceToggleTarget.CollateralSweep,set:false}]});
 const expected=[];if(s.changesParentSettlementPolicy)expected.push(protect(w.parentAddress));
 if(s.createsAccount){
  expected.push(buildRegisterTraderIx({...protocol,payer:w.walletAddress,trader:w.walletAddress,traderAccount:w.traderAddress,maxPositions:1n,disableCollateralSweep:true,traderPdaIndex:0,traderSubaccountIndex:w.subaccountIndex}));
  const sync=s.instructions[expected.length],arenas=sync?.accounts?.slice(6).map(a=>a.address);
  if(!arenas?.length||arenas.length>16||new Set(arenas).size!==arenas.length)fail();arenas.forEach(phoenixKey);
  expected.push(buildSyncParentToChildIx({...protocol,traderWallet:w.walletAddress,parentTraderAccount:w.parentAddress,childTraderAccount:w.traderAddress,globalTraderIndex:arenas}),protect(w.traderAddress));
 }else if(s.instructions.length>expected.length)expected.push(protect(w.traderAddress));
 if(JSON.stringify(expected.map(shape))!==JSON.stringify(s.instructions))fail();
 const limit=Buffer.alloc(5);limit[0]=2;limit.writeUInt32LE(w.computeUnitLimit,1);const price=Buffer.alloc(9);price[0]=3;price.writeBigUInt64LE(BigInt(w.computeUnitPriceMicroLamports),1);
 let m=createTransactionMessage({version:'legacy'});m=setTransactionMessageFeePayer(w.walletAddress,m);m=setTransactionMessageLifetimeUsingBlockhash({blockhash:w.blockhash,lastValidBlockHeight:BigInt(w.lastValidBlockHeight)},m);
 m=appendTransactionMessageInstructions([{programAddress:COMPUTE,accounts:[],data:limit},{programAddress:COMPUTE,accounts:[],data:price},...expected],m);
 const unsigned=getBase64EncodedWireTransaction(compileTransaction(m)),raw=Buffer.from(unsigned,'base64');
 if(raw[0]!==1||raw.length>1232||unsigned!==w.serializedTxBase64||raw.subarray(65).toString('base64')!==w.messageBase64||createHash('sha256').update(raw.subarray(65)).digest('hex')!==w.messageHash)fail();
 return {wire:w,setup:s,unsigned:raw};
}
export function verifyPhoenixChildSetupSignature(archive,encoded){const p=inspectPhoenixChildSetupArchive(archive),raw=Buffer.from(encoded,'base64');
 const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(bs58.decode(p.wire.walletAddress))]),format:'der',type:'spki'});
 if(raw.toString('base64')!==encoded||raw.length!==p.unsigned.length||raw[0]!==1||!raw.subarray(65).equals(p.unsigned.subarray(65))||!verify(null,raw.subarray(65),publicKey,raw.subarray(1,65)))fail();
 return {raw,signature:bs58.encode(raw.subarray(1,65))};
}
export function verifyPhoenixStoredChildSetup(row){
 if(!row||row.phase!=='CHILD'||!['PREPARED','SIGNED','UNKNOWN','CANCELLED','FINALIZED'].includes(row.state)||!['id','owner','message_hash'].every(k=>typeof row[k]==='string'&&/^[a-f0-9]{64}$/.test(row[k]))||
    typeof row.revision!=='string'||!/^[A-Za-z0-9:_-]{1,128}$/.test(row.revision)||!['created','updated','expires'].every(k=>Number.isSafeInteger(row[k]))||row.created<0||row.updated<row.created||row.expires<=row.created||row.expires-row.created>900000||
    typeof row.maximum_lamports!=='string'||!/^[1-9]\d{0,8}$/.test(row.maximum_lamports)||BigInt(row.maximum_lamports)>100000000n)fail();
 const archive=JSON.parse(row.preparation),{wire:w,setup}=inspectPhoenixChildSetupArchive(archive),s=JSON.parse(row.simulation);
 if(row.wallet!==w.walletAddress||row.parent!==w.parentAddress||row.message!==w.messageBase64||row.message_hash!==w.messageHash||row.last_height!==String(w.lastValidBlockHeight)||
    s.stage!=='PHOENIX_CHILD_SETUP_SIMULATED'||s.walletAddress!==row.wallet||s.parentAddress!==row.parent||s.traderAddress!==w.traderAddress||s.subaccountIndex!==w.subaccountIndex||s.messageHash!==row.message_hash||s.createsAccount!==setup.createsAccount||
    !Number.isSafeInteger(s.observedSlot)||s.observedSlot<1||typeof s.rentLockedLamports!=='string'||! /^(0|[1-9]\d{0,7})$/.test(s.rentLockedLamports)||BigInt(s.rentLockedLamports)>10000000n||(!setup.createsAccount?s.rentLockedLamports!=='0':s.rentLockedLamports==='0')||
    s.networkFeeLamports!==String(5000+Number((BigInt(w.computeUnitLimit)*BigInt(w.computeUnitPriceMicroLamports)+999999n)/1000000n))||
    BigInt(s.maximumLamports)!==BigInt(s.networkFeeLamports)+BigInt(s.rentLockedLamports)||BigInt(s.maximumLamports)>BigInt(row.maximum_lamports))fail();
 if(['PREPARED','CANCELLED'].includes(row.state)){if(row.signature!==null||row.signed!==null)fail();}
 else if(verifyPhoenixChildSetupSignature(archive,row.signed).signature!==row.signature)fail();
 if(row.state==='FINALIZED'){
  const r=JSON.parse(row.receipt);if(r.stage!=='PHOENIX_CHILD_SETUP_FINALIZED'||!['READY','FAILED'].includes(r.state)||r.walletAddress!==row.wallet||r.parentAddress!==row.parent||r.traderAddress!==w.traderAddress||
   r.subaccountIndex!==w.subaccountIndex||r.signature!==row.signature||r.messageHash!==row.message_hash||r.finalizedTxBase64!==row.signed||r.networkFeeLamports!==s.networkFeeLamports||
   r.rentLockedLamports!==(r.state==='READY'?s.rentLockedLamports:'0')||!Number.isSafeInteger(r.slot)||r.slot<s.observedSlot||!Number.isSafeInteger(r.blockTime)||r.blockTime<0)fail();
 }else if(row.receipt!==null)fail();return row;
}
