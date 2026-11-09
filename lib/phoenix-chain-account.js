// One mainnet bank for the wallet, canonical token accounts and explicitly
// selected Phoenix subaccounts. No API position summary can impersonate this
// evidence, and this evidence alone never authorizes a signature.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {decodeTrader} from '@ellipsis-labs/rise';
import {PHOENIX_IDENTITIES as ID,phoenixKey} from './phoenix-market-plan.js';
import {derivePhoenixWalletAccounts} from './phoenix-instruction-bindings.js';

const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const SYSTEM='11111111111111111111111111111111';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const proofs=new WeakMap(),U64=18446744073709551615n;
const fail=(code='UNVERIFIED')=>{throw Error('PHOENIX_ACCOUNT_'+code);};

function units(value){
 if(typeof value==='number'&&!Number.isSafeInteger(value))fail();
 if(!/^(0|[1-9]\d{0,19})$/.test(String(value)))fail();
 const n=BigInt(value);if(n>U64)fail();return n;
}
function bytes(account,{owner,maxBytes=16384}={}){
 if(!account||account.owner!==owner||account.executable!==false||!Array.isArray(account.data)||
    account.data.length!==2||account.data[1]!=='base64'||typeof account.data[0]!=='string'||
    account.data[0].length>Math.ceil(maxBytes/3)*4)fail();
 units(account.lamports);
 const data=Buffer.from(account.data[0],'base64');
 if(data.length>maxBytes||data.toString('base64')!==account.data[0])fail();
 return data;
}
export function decodePhoenixRpcToken(account,{mint,owner}){
 if(account===null)return Object.freeze({exists:false,amountUnits:'0',spendable:false,delegate:null,uninitializedLamports:'0'});
 // ATA creation legitimately initializes a system-owned PDA that already has
 // donated lamports. Dust sent by a third party must not permanently block it.
 if(account?.owner===SYSTEM){
  if(bytes(account,{owner:SYSTEM,maxBytes:0}).length!==0)fail('TOKEN');
  return Object.freeze({exists:false,amountUnits:'0',spendable:false,delegate:null,uninitializedLamports:units(account.lamports).toString()});
 }
 const b=bytes(account,{owner:TOKEN,maxBytes:165});
 if(b.length!==165||bs58.encode(b.subarray(0,32))!==mint||bs58.encode(b.subarray(32,64))!==owner||
    ![1,2].includes(b[108])||b.readUInt32LE(109)!==0)fail('TOKEN');
 const delegateOption=b.readUInt32LE(72),closeOption=b.readUInt32LE(129);
 if(delegateOption>1||closeOption>1)fail('TOKEN');
 const delegate=delegateOption===1?bs58.encode(b.subarray(76,108)):null;
 const closeAuthority=closeOption===1?bs58.encode(b.subarray(133,165)):null;
 return Object.freeze({exists:true,amountUnits:b.readBigUInt64LE(64).toString(),
  frozen:b[108]===2,spendable:b[108]===1&&delegate===null&&(closeAuthority===null||closeAuthority===owner),delegate,closeAuthority});
}
export function decodePhoenixRpcTrader(account,{address,walletAddress,index}){
 if(account===null)return Object.freeze({exists:false,address,subaccountIndex:index,positions:Object.freeze([])});
 const b=bytes(account,{owner:ID.program,maxBytes:16384});
 // Bound the dynamic short-map before allowing the SDK decoder to iterate it.
 if(b.length<240)fail('LAYOUT');
 const len=b.readBigUInt64LE(224),capacity=b.readBigUInt64LE(232);
 if(len>capacity||capacity>256n||240n+capacity*40n>BigInt(b.length))fail('LAYOUT');
 let value;try{value=decodeTrader(b);}catch{fail('LAYOUT');}
 if(value.key!==address||value.authority!==walletAddress||value.traderPdaIndex!==0||value.traderSubaccountIndex!==index||
    (index===0?(value.maxPositions<32||value.maxPositions>128):value.maxPositions!==1)||
    value.positions.entries.length>(index===0?128:1)||value.traderPreferenceFlags.hasReservedBits)fail('IDENTITY');
 const seen=new Set(),positions=value.positions.entries.map(({key,value:p})=>{
  if(key<0n||key>1023n||seen.has(key.toString()))fail('LAYOUT');seen.add(key.toString());
  return Object.freeze({assetId:Number(key),baseLots:p.baseLotPosition.toString(),
   virtualQuoteLots:p.virtualQuoteLotPosition.toString(),cumulativeFundingSnapshot:p.cumulativeFundingSnapshot.toString(),
   accumulatedFunding:p.accumulatedFundingForActivePosition.toString(),sequence:p.positionSequenceNumber});
 });
 return Object.freeze({exists:true,address,subaccountIndex:index,authority:walletAddress,
  positionAuthority:value.positionAuthority,authorityIsWallet:value.positionAuthority===walletAddress,
  capabilityFlags:value.state.flags,quoteCollateralUnits:value.state.quoteLotCollateral.toString(),
  withdrawalQueued:value.withdrawQueueNode!==null,maxPositions:value.maxPositions,
  disableCollateralSweep:value.disableCollateralSweep,disablePositionAuthoritySwap:value.disablePositionAuthoritySwap,
  hasSplineLiquidity:value.numMarketsWithSplines!==0,conditionalOrderCount:value.occupiedConditionalOrderIndices.length,
  spotCollateralCount:value.spotCollaterals.length,hasLockedDeposit:value.lockedDeposit!==null,
  positions:Object.freeze(positions)});
}

export function requireFreshPhoenixChainAccount(value,{walletAddress,minimumSlot=0,request}={}){
 const p=proofs.get(value);
 if(!p)fail('PROOF_MISSING');
 if(value.walletAddress!==walletAddress)fail('PROOF_WALLET');
 if(Number.isSafeInteger(minimumSlot)&&minimumSlot>0&&Number.isSafeInteger(value.observedSlot)&&value.observedSlot<minimumSlot)fail('PROOF_SLOT');
 if(request&&request!==p.request)fail('PROOF_REQUEST');
 const elapsed=p.monotonicNow()-p.started;
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail('PROOF_ELAPSED');
 if(p.now()<value.observedAt)fail('PROOF_FUTURE');
 if(p.now()-value.observedAt>10000)fail('PROOF_OLD');
 return value;
}

export function decodePhoenixRpcPayer(account){
 if(account===null)return '0';
 if(bytes(account,{owner:SYSTEM,maxBytes:0}).length!==0)fail('PAYER');
 return units(account.lamports).toString();
}

export async function readPhoenixChainAccount({walletAddress,subaccountIndices=[1],minimumSlot=0}={},
 {request,now=Date.now,monotonicNow=()=>performance.now(),commitment='confirmed'}={}){
 phoenixKey(walletAddress);
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'||
    !Number.isSafeInteger(minimumSlot)||minimumSlot<0||!['confirmed','finalized'].includes(commitment)||
    !Array.isArray(subaccountIndices)||subaccountIndices.length<1||subaccountIndices.length>32||
    new Set(subaccountIndices).size!==subaccountIndices.length||subaccountIndices.some(i=>!Number.isInteger(i)||i<1||i>255))fail();
 const indices=[...subaccountIndices].sort((a,b)=>a-b),started=monotonicNow();
 if(!Number.isFinite(started))fail();
 const accounts=await Promise.all(indices.map(i=>derivePhoenixWalletAccounts(walletAddress,i)));
 const [parent]=await getProgramDerivedAddress({programAddress:ID.program,seeds:['trader',bs58.decode(walletAddress),new Uint8Array([0]),new Uint8Array([0])]});
 const addresses=[walletAddress,accounts[0].usdcAta,accounts[0].canonicalAta,parent,...accounts.map(a=>a.trader)];
 if(new Set(addresses).size!==addresses.length)fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');
 const reply=await request('getMultipleAccounts',[addresses,{commitment,encoding:'base64',minContextSlot:minimumSlot}]);
 if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<minimumSlot||
    !Array.isArray(reply.value)||reply.value.length!==addresses.length)fail('BANK');
 const payer=reply.value[0];
 if(payer!==null&&bytes(payer,{owner:SYSTEM,maxBytes:0}).length!==0)fail('PAYER');
 const usdc=decodePhoenixRpcToken(reply.value[1],{mint:ID.usdc,owner:walletAddress});
 const canonical=decodePhoenixRpcToken(reply.value[2],{mint:ID.canonicalUsdc,owner:walletAddress});
 const subaccounts=[decodePhoenixRpcTrader(reply.value[3],{address:parent,walletAddress,index:0}),
  ...indices.map((index,i)=>decodePhoenixRpcTrader(reply.value[i+4],{address:addresses[i+4],walletAddress,index}))];
 if(await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');
 const observedAt=now(),elapsed=monotonicNow()-started;
 if(!Number.isSafeInteger(observedAt)||observedAt<0||!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail('EXPIRED');
 const result=Object.freeze({stage:'PHOENIX_CHAIN_ACCOUNT',readyForSigning:false,network:'solana-mainnet',walletAddress,
  commitment,observedSlot:reply.context.slot,observedAt,payerLamports:payer===null?'0':units(payer.lamports).toString(),
  usdc,canonical,subaccounts:Object.freeze(subaccounts),scannedSubaccountIndices:Object.freeze([0,...indices]),
  requiresReconciledVenueJournal:true,requiresCompleteManagedAccountSet:true});
 proofs.set(result,{request,started,now,monotonicNow});return result;
}
