// Read-only finality for the exact approved parent wire, including the actual
// Phoenix co-signature. A provider HTTP response cannot produce this proof.
import bs58 from 'bs58';
import {createHash} from 'node:crypto';
import {getCompiledTransactionMessageDecoder,getProgramDerivedAddress} from '@solana/kit';
import {verifyPhoenixStoredParentAttempt,verifyPhoenixParentCompletedWire} from './phoenix-parent-stored.js';
import {PHOENIX_IDENTITIES as ID} from './phoenix-market-plan.js';
import {buildRegisterTraderIx,getOnboardTraderDelegatedEncoder} from '@ellipsis-labs/rise';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',SYSTEM='11111111111111111111111111111111';
const receipts=new WeakSet();
const fail=code=>{throw Error('PHOENIX_PARENT_RECEIPT_'+code);};
const integer=v=>{if(!Number.isSafeInteger(v)||v<0)fail('NUMBER');return v;};
function error(value){if(value===null)return;if(typeof value==='string'&&/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(value))return;
 if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&JSON.stringify(value).length<=4096)return;fail('ERROR');}
function systemEffects(meta,m,row,rent){
 const found=[];
 if(!Array.isArray(meta.innerInstructions))fail('CPI');
 for(const group of meta.innerInstructions){
  if(![0,1].includes(group.index)||!Array.isArray(group.instructions))fail('CPI');
  for(const ix of group.instructions){
   const program=m.staticAccounts[ix.programIdIndex];
   if(program===ID.program)continue;
   if(program!==SYSTEM||group.index!==0||ix.stackHeight!==2||!Array.isArray(ix.accounts)||typeof ix.data!=='string'||ix.data.length>100)fail('CPI');
   const b=Buffer.from(bs58.decode(ix.data)),addresses=ix.accounts.map(i=>m.staticAccounts[i]);
   if(b.length===12&&b.readUInt32LE(0)===2&&addresses.length===2&&addresses[0]===row.wallet&&addresses[1]===row.parent&&b.readBigUInt64LE(4)===rent)found.push('TRANSFER');
   else if(b.length===12&&b.readUInt32LE(0)===8&&addresses.length===1&&addresses[0]===row.parent&&b.readBigUInt64LE(4)===1520n)found.push('ALLOCATE');
   else if(b.length===36&&b.readUInt32LE(0)===1&&addresses.length===1&&addresses[0]===row.parent&&bs58.encode(b.subarray(4))===ID.program)found.push('ASSIGN');
   else fail('CPI');
  }
 }
 if(found.join(',')!=='TRANSFER,ALLOCATE,ASSIGN')fail('CPI');
}
export function requirePhoenixParentReceipt(value){if(!receipts.has(value))fail('UNVERIFIED');return value;}
export async function reconcilePhoenixParent(row,{request,now=Date.now}={}){
 verifyPhoenixStoredParentAttempt(row);if(row.state!=='UNKNOWN'||typeof request!=='function'||typeof now!=='function')fail('INPUT');
 const p=JSON.parse(row.preparation),simulation=JSON.parse(row.simulation),minimum=integer(simulation.observedSlot),at=integer(now());
 if(await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');
 const status=await request('getSignatureStatuses',[[row.signature],{searchTransactionHistory:true}]);
 if(!Number.isSafeInteger(status?.context?.slot)||status.context.slot<minimum||!Array.isArray(status.value)||status.value.length!==1)fail('STATUS');
 const pending=()=>Object.freeze({stage:'PHOENIX_PARENT_UNRESOLVED',signature:row.signature,state:'UNKNOWN',mayRetry:false,requiresReconciliation:true});
 const s=status.value[0];if(s===null)return pending();
 error(s.err);if(integer(s.slot)<minimum||s.slot>status.context.slot||!['processed','confirmed','finalized'].includes(s.confirmationStatus))fail('STATUS');
 if(s.confirmationStatus!=='finalized')return pending();
 const tx=await request('getTransaction',[row.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
 if(tx===null)return pending();
 const facts=await verifyPhoenixParentTransaction(row,tx,{slot:s.slot,err:s.err,at});
 if(facts.traderAuthority!==row.wallet||p.parentAddress!==facts.parentAddress)fail('AUTHORITY');
 if(await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');
 const result=Object.freeze({...facts,stage:'PHOENIX_PARENT_FINALIZED'});receipts.add(result);return result;
}
// Unbranded transaction facts, usable for public sponsored fixture verification.
// They are NOT accepted by the journal. Only reconcilePhoenixParent first
// validates the durable SAME-WALLET consent and can issue the finality seal.
export async function verifyPhoenixParentTransaction(row,tx,{slot,err,at}={}){
 error(err);integer(at);
 if(tx?.slot!==integer(slot)||!Array.isArray(tx.transaction)||tx.transaction.length!==2||tx.transaction[1]!=='base64'||!tx.meta||
    JSON.stringify(tx.meta.err)!==JSON.stringify(err)||integer(tx.blockTime)*1000>at+2000)fail('TRANSACTION');
 const full=verifyPhoenixParentCompletedWire(row,tx.transaction[0]),m=getCompiledTransactionMessageDecoder().decode(full.subarray(129));
 if(bs58.encode(full.subarray(1,65))!==row.signature||createHash('sha256').update(full.subarray(129)).digest('hex')!==row.message_hash)fail('BINDING');
 if(m.version!=='legacy'||m.header.numSignerAccounts!==2||m.staticAccounts[0]!==row.wallet||m.instructions.length!==2)fail('PROFILE');
 const ins=m.instructions,keys=m.staticAccounts,traderAuthority=keys[ins[0].accountIndices[4]];
 const [parent]=await getProgramDerivedAddress({programAddress:ID.program,seeds:['trader',bs58.decode(traderAuthority),new Uint8Array([0]),new Uint8Array([0])]});
 const expected=buildRegisterTraderIx({programAddress:ID.program,logAuthorityAddress:'GdxfTLSsdSY37G6fZoYtdGDSfgFnbT2EmRpuePZxWShS',
  globalConfigurationAddress:'2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ',payer:row.wallet,trader:traderAuthority,traderAccount:parent,maxPositions:32n,traderPdaIndex:0,traderSubaccountIndex:0});
 if(parent!==row.parent||ins[0].accountIndices.length!==7||ins.some(i=>keys[i.programAddressIndex]!==ID.program)||
    expected.accounts.some((a,i)=>keys[ins[0].accountIndices[i]]!==a.address)||!Buffer.from(ins[0].data).equals(Buffer.from(expected.data))||
    ins[1].accountIndices.length<8||!Buffer.from(ins[1].data).equals(Buffer.from(getOnboardTraderDelegatedEncoder().encode(undefined)))||
    [ID.program,'GdxfTLSsdSY37G6fZoYtdGDSfgFnbT2EmRpuePZxWShS','2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ',
     'EzkM8YbCkBLaCqX2cdxtMyxfTLpKui3mWQWnhe5w2P4Z','6UCimUpRW2CGh3ESJm3S59c4WcCaVLYcpPPbbrfX2nzr',parent].some((a,i)=>keys[ins[1].accountIndices[i]]!==a))fail('PROFILE');
 if(tx.meta.fee!==10000||tx.meta.loadedAddresses&&
    (!Array.isArray(tx.meta.loadedAddresses.readonly)||!Array.isArray(tx.meta.loadedAddresses.writable)||tx.meta.loadedAddresses.readonly.length||tx.meta.loadedAddresses.writable.length)||
    !Array.isArray(tx.meta.preBalances)||!Array.isArray(tx.meta.postBalances)||tx.meta.preBalances.length!==m.staticAccounts.length||tx.meta.postBalances.length!==m.staticAccounts.length||
    !Array.isArray(tx.meta.preTokenBalances)||!Array.isArray(tx.meta.postTokenBalances)||tx.meta.preTokenBalances.length!==0||tx.meta.postTokenBalances.length!==0)fail('EFFECTS');
 const simulation=JSON.parse(row.simulation),rent=err===null?BigInt(simulation.rentLockedLamports):0n,rootIndex=m.staticAccounts.indexOf(parent);
 if(rootIndex<2||rent+10000n>BigInt(row.maximum_lamports))fail('EFFECTS');
 for(let i=0;i<m.staticAccounts.length;i++){
  const before=BigInt(integer(tx.meta.preBalances[i])),after=BigInt(integer(tx.meta.postBalances[i]));
  if(i===0?before-after!==10000n+rent:i===rootIndex?before!==0n||after!==rent:before!==after)fail('EFFECTS');
 }
 if(err===null)systemEffects(tx.meta,m,row,rent);
 return Object.freeze({stage:'PHOENIX_PARENT_TRANSACTION_FACTS',walletAddress:row.wallet,traderAuthority,parentAddress:parent,signature:row.signature,messageHash:row.message_hash,
  state:err===null?'REGISTERED':'FAILED',slot:tx.slot,blockTime:tx.blockTime,networkFeeLamports:'10000',rentLockedLamports:String(rent),
  finalizedTxBase64:tx.transaction[0],mayRetry:false,requiresNewReview:err!==null});
}
