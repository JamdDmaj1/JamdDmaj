// Exact finalized wallet-only setup, independent of expired trading quotes.
import bs58 from 'bs58';
import {getCompiledTransactionMessageDecoder,getProgramDerivedAddress} from '@solana/kit';
import {verifyPhoenixStoredChildSetup,inspectPhoenixChildSetupArchive} from './phoenix-child-setup-stored.js';
import {decodePhoenixRpcTrader} from './phoenix-chain-account.js';
import {derivePhoenixWalletAccounts} from './phoenix-instruction-bindings.js';
import {PHOENIX_IDENTITIES as ID} from './phoenix-market-plan.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',SYSTEM='11111111111111111111111111111111';
const proofs=new WeakSet();
const fail=code=>{throw Error('PHOENIX_CHILD_RECEIPT_'+code);};
const integer=v=>{if(!Number.isSafeInteger(v)||v<0)fail('NUMBER');return v;};
const exposed=p=>p.baseLots!=='0'||p.virtualQuoteLots!=='0';
function error(v){if(v===null)return;if(typeof v==='string'&&/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(v))return;
 if(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===1&&JSON.stringify(v).length<4096)return;fail('STATUS');}
function creation(meta,m,row,setup,rent){
 const found=[],registerIndex=2+Number(setup.changesParentSettlementPolicy);
 if(!Array.isArray(meta.innerInstructions))fail('CPI');
 for(const group of meta.innerInstructions){if(!Number.isSafeInteger(group.index)||group.index<2||group.index>=m.instructions.length||!Array.isArray(group.instructions))fail('CPI');
  for(const i of group.instructions){const program=m.staticAccounts[i.programIdIndex];if(program===ID.program)continue;
   if(!setup.createsAccount||program!==SYSTEM||group.index!==registerIndex||i.stackHeight!==2||!Array.isArray(i.accounts)||typeof i.data!=='string'||i.data.length>100)fail('CPI');
   const b=Buffer.from(bs58.decode(i.data)),a=i.accounts.map(n=>m.staticAccounts[n]);
   if(b.length===12&&b.readUInt32LE(0)===2&&a.length===2&&a[0]===row.wallet&&a[1]===setup.traderAddress&&b.readBigUInt64LE(4)===rent)found.push('TRANSFER');
   else if(b.length===12&&b.readUInt32LE(0)===8&&a.length===1&&a[0]===setup.traderAddress&&b.readBigUInt64LE(4)===280n)found.push('ALLOCATE');
   else if(b.length===36&&b.readUInt32LE(0)===1&&a.length===1&&a[0]===setup.traderAddress&&bs58.encode(b.subarray(4))===ID.program)found.push('ASSIGN');
   else fail('CPI');
  }
 }
 if(found.join(',')!==(setup.createsAccount?'TRANSFER,ALLOCATE,ASSIGN':''))fail('CPI');
}
export function requirePhoenixChildSetupReceipt(value){if(!proofs.has(value))fail('UNVERIFIED');return value;}
export async function reconcilePhoenixChildSetup(row,{request,now=Date.now}={}){
 verifyPhoenixStoredChildSetup(row);if(row.state!=='UNKNOWN'||typeof request!=='function'||typeof now!=='function')fail('INPUT');
 const {wire,setup}=inspectPhoenixChildSetupArchive(JSON.parse(row.preparation)),simulation=JSON.parse(row.simulation),at=integer(now());
 if(await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');
 const pending=()=>Object.freeze({stage:'PHOENIX_CHILD_SETUP_UNRESOLVED',signature:row.signature,state:'UNKNOWN',mayRetry:false,requiresReconciliation:true});
 const status=await request('getSignatureStatuses',[[row.signature],{searchTransactionHistory:true}]);
 if(!Number.isSafeInteger(status?.context?.slot)||status.context.slot<simulation.observedSlot||!Array.isArray(status.value)||status.value.length!==1)fail('STATUS');
 const s=status.value[0];if(s===null)return pending();error(s.err);
 if(integer(s.slot)<simulation.observedSlot||s.slot>status.context.slot||!['processed','confirmed','finalized'].includes(s.confirmationStatus))fail('STATUS');
 if(s.confirmationStatus!=='finalized')return pending();
 const tx=await request('getTransaction',[row.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);if(tx===null)return pending();
 if(tx.slot!==s.slot||!Array.isArray(tx.transaction)||tx.transaction.length!==2||tx.transaction[1]!=='base64'||tx.transaction[0]!==row.signed||!tx.meta||JSON.stringify(tx.meta.err)!==JSON.stringify(s.err)||integer(tx.blockTime)*1000>at+2000)fail('TRANSACTION');
 const m=getCompiledTransactionMessageDecoder().decode(Buffer.from(row.signed,'base64').subarray(65)),meta=tx.meta,a=await derivePhoenixWalletAccounts(row.wallet,wire.subaccountIndex);
 const [parent]=await getProgramDerivedAddress({programAddress:ID.program,seeds:['trader',bs58.decode(row.wallet),new Uint8Array([0]),new Uint8Array([0])]});
 if(parent!==row.parent||a.trader!==wire.traderAddress||String(meta.fee)!==simulation.networkFeeLamports||!Array.isArray(meta.preBalances)||!Array.isArray(meta.postBalances)||
    meta.preBalances.length!==m.staticAccounts.length||meta.postBalances.length!==m.staticAccounts.length||!Array.isArray(meta.preTokenBalances)||!Array.isArray(meta.postTokenBalances)||meta.preTokenBalances.length||meta.postTokenBalances.length||
    meta.loadedAddresses&&(!Array.isArray(meta.loadedAddresses.writable)||!Array.isArray(meta.loadedAddresses.readonly)||meta.loadedAddresses.writable.length||meta.loadedAddresses.readonly.length))fail('EFFECTS');
 const rent=s.err===null?BigInt(simulation.rentLockedLamports):0n,fee=BigInt(integer(meta.fee)),childIndex=m.staticAccounts.indexOf(a.trader);
 if(childIndex<1||fee+rent>BigInt(row.maximum_lamports))fail('EFFECTS');
 for(let i=0;i<m.staticAccounts.length;i++){const before=BigInt(integer(meta.preBalances[i])),after=BigInt(integer(meta.postBalances[i]));
  if(i===0?before-after!==fee+rent:i===childIndex&&setup.createsAccount?before!==0n||after!==rent:before!==after)fail('EFFECTS');}
 if(s.err===null){creation(meta,m,row,setup,rent);
  const state=await request('getMultipleAccounts',[[parent,a.trader],{encoding:'base64',commitment:'finalized',minContextSlot:tx.slot}]);
  if(!Number.isSafeInteger(state?.context?.slot)||state.context.slot<tx.slot||!Array.isArray(state.value)||state.value.length!==2)fail('STATE');
  const root=decodePhoenixRpcTrader(state.value[0],{address:parent,walletAddress:row.wallet,index:0}),child=decodePhoenixRpcTrader(state.value[1],{address:a.trader,walletAddress:row.wallet,index:wire.subaccountIndex});
  if(!root.exists||!root.authorityIsWallet||!root.disableCollateralSweep||!child.exists||!child.authorityIsWallet||!child.disableCollateralSweep||child.positions.some(exposed)||child.quoteCollateralUnits!=='0'||
     child.withdrawalQueued||child.spotCollateralCount||child.hasLockedDeposit||child.hasSplineLiquidity||child.conditionalOrderCount||setup.createsAccount&&(child.capabilityFlags!==root.capabilityFlags||child.disablePositionAuthoritySwap!==root.disablePositionAuthoritySwap)||
     setup.changesParentSettlementPolicy&&(root.positions.some(exposed)||root.quoteCollateralUnits!=='0'||root.withdrawalQueued||root.spotCollateralCount||root.hasLockedDeposit||root.hasSplineLiquidity||root.conditionalOrderCount))fail('STATE');
 }
 if(await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');
 const result=Object.freeze({stage:'PHOENIX_CHILD_SETUP_FINALIZED',state:s.err===null?'READY':'FAILED',signature:row.signature,walletAddress:row.wallet,parentAddress:parent,traderAddress:a.trader,subaccountIndex:wire.subaccountIndex,
  messageHash:row.message_hash,slot:tx.slot,blockTime:tx.blockTime,networkFeeLamports:String(meta.fee),rentLockedLamports:String(rent),finalizedTxBase64:row.signed,mayRetry:false,authorizesTrading:false,requiresNewReview:s.err!==null});proofs.add(result);return result;
}
